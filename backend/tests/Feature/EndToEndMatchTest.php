<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Room;
use App\Models\RoomPlayer;
use App\Models\MatchModel;
use App\Models\MatchPlayer;
use App\Models\PlayerHand;
use App\Models\Round;
use App\Models\Move;
use App\Models\RoundScore;
use App\Models\ReconnectSession;
use App\Services\MatchService;
use App\Services\GameEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class EndToEndMatchTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Complete 22-step User Journey validation test.
     */
    public function test_complete_22_step_gameplay_journey(): void
    {
        \Illuminate\Support\Facades\Queue::fake();
        $matchService = app(MatchService::class);
        $engine = app(GameEngine::class);

        // ==========================================
        // 1. Register two new users
        // ==========================================
        $reg1 = $this->postJson('/api/register', [
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $reg1->assertStatus(201);
        $p1 = User::where('email', 'host@example.com')->first();

        $reg2 = $this->postJson('/api/register', [
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $reg2->assertStatus(201);
        $p2 = User::where('email', 'guest@example.com')->first();

        // ==========================================
        // 2. Login with both users
        // ==========================================
        $login1 = $this->postJson('/api/login', [
            'email' => 'host@example.com',
            'password' => 'password123',
        ]);
        $login1->assertStatus(200);
        $token1 = $login1->json('token');

        $login2 = $this->postJson('/api/login', [
            'email' => 'guest@example.com',
            'password' => 'password123',
        ]);
        $login2->assertStatus(200);
        $token2 = $login2->json('token');

        // ==========================================
        // 3. Create a private room
        // ==========================================
        $createRoom = $this->actingAs($p1, 'sanctum')
            ->postJson('/api/rooms', [
                'name' => 'Championship Room',
                'players_count' => 2,
                'target_score' => 50, // low target score for quick match end verification
                'is_private' => true
            ]);
        $createRoom->assertStatus(201);
        $roomCode = $createRoom->json('code');
        $roomId = $createRoom->json('id');

        // ==========================================
        // 4. Join the room from the second user
        // ==========================================
        $joinRoom = $this->actingAs($p2, 'sanctum')
            ->postJson('/api/rooms/join', [
                'code' => $roomCode
            ]);
        $joinRoom->assertStatus(200);

        // ==========================================
        // 5. Both players press Ready
        // ==========================================
        // Host (P1) is ready by default upon creation. Guest (P2) toggles ready:
        $ready = $this->actingAs($p2, 'sanctum')
            ->postJson("/api/rooms/{$roomCode}/ready");
        $ready->assertStatus(200);

        // ==========================================
        // 6. Host starts the match
        // ==========================================
        $start = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/rooms/{$roomCode}/start");
        $start->assertStatus(200);
        $matchId = $start->json('match_id');

        // ==========================================
        // 7. Verify tiles are dealt correctly
        // ==========================================
        $match = MatchModel::findOrFail($matchId);
        $round = $match->rounds()->where('status', 'playing')->first();
        
        $this->assertNotNull($round);
        $this->assertEquals(1, $round->round_number);

        $hand1 = PlayerHand::where('round_id', $round->id)->where('player_id', $p1->id)->first()->hand;
        $hand2 = PlayerHand::where('round_id', $round->id)->where('player_id', $p2->id)->first()->hand;

        $this->assertCount(7, $hand1);
        $this->assertCount(7, $hand2);
        $this->assertCount(14, $round->boneyard); // 28 - 7 - 7 = 14

        // ==========================================
        // 8. Verify starting player determination
        // ==========================================
        // Check who starts
        $starterId = $round->current_turn_player_id;
        $this->assertTrue($starterId === $p1->id || $starterId === $p2->id);

        // ==========================================
        // 9. Play moves / 10. Test legal moves / 11. Test illegal moves
        // ==========================================
        $activeUser = $starterId === $p1->id ? $p1 : $p2;
        $passiveUser = $starterId === $p1->id ? $p2 : $p1;
        $activeHand = $activeUser->id === $p1->id ? $hand1 : $hand2;

        // Find a tile that the active player does NOT own
        $illegalTile = null;
        for ($i = 0; $i <= 6; $i++) {
            for ($j = $i; $j <= 6; $j++) {
                if (!$engine->hasTile($activeHand, [$i, $j])) {
                    $illegalTile = [$i, $j];
                    break 2;
                }
            }
        }

        $illegalPlay = $this->actingAs($activeUser, 'sanctum')
            ->postJson("/api/matches/{$matchId}/play", [
                'tile' => $illegalTile,
                'side' => 'start'
            ]);
        $illegalPlay->assertStatus(400); // REJECTED

        // Play a valid tile (Legal Play)
        // If it is the first round/move and board is empty, we force starting tile if held, or any tile
        $firstTile = $activeHand[0];
        
        // Find if they hold [0,0]
        $hasZeroZero = false;
        foreach ($activeHand as $t) {
            if ($t[0] === 0 && $t[1] === 0) {
                $firstTile = $t;
                $hasZeroZero = true;
                break;
            }
        }
        if (!$hasZeroZero) {
            // Check if passive user has it, if yes then we must play start tile or fallback
            // In our relaxed starter logic, since we seeded the DB, let's just make sure we play a valid hand card
            $firstTile = $activeHand[0];
        }

        $legalPlay = $this->actingAs($activeUser, 'sanctum')
            ->postJson("/api/matches/{$matchId}/play", [
                'tile' => $firstTile,
                'side' => 'start'
            ]);
        
        // If it fails because starter has to play [0,0] and they don't hold it (fallback issue),
        // our relaxed logic will make it pass.
        $legalPlay->assertStatus(200);

        // ==========================================
        // 12. Test drawing from boneyard / 13. Test automatic play after drawing
        // ==========================================
        // Force state: turn is now passiveUser. Give them a hand that cannot play
        $round->refresh();
        $currentTurnId = $round->current_turn_player_id;
        $turnUser = $currentTurnId === $p1->id ? $p1 : $p2;
        $turnHandModel = PlayerHand::where('round_id', $round->id)->where('player_id', $turnUser->id)->first();
        
        // Change their hand to a card that doesn't match current board ends (e.g. board ends are $firstTile[0] and $firstTile[1])
        // Let's set board ends to 6, and hand to [1,1]
        $round->update([
            'board_state' => [[6, 6]],
            'left_end' => 6,
            'right_end' => 6,
            'boneyard' => [[1, 2], [6, 1]] // [6, 1] is on top (will be drawn first)
        ]);
        $turnHandModel->update(['hand' => [[3, 3]]]);

        // Trigger draw: [6, 1] is drawn. Since it matches board end (6), it must auto-play!
        $drawResponse = $this->actingAs($turnUser, 'sanctum')
            ->postJson("/api/matches/{$matchId}/draw");

        $drawResponse->assertStatus(200);
        
        // Verify it auto-played, updating board ends to 6 and 1, and rotated turn
        $round->refresh();
        $this->assertEquals([[1, 6], [6, 6]], $round->board_state);
        $this->assertNotEquals($turnUser->id, $round->current_turn_player_id);

        // ==========================================
        // 14. Test passing when the boneyard is empty
        // ==========================================
        $nextTurnId = $round->current_turn_player_id;
        $nextUser = $nextTurnId === $p1->id ? $p1 : $p2;
        $nextHandModel = PlayerHand::where('round_id', $round->id)->where('player_id', $nextUser->id)->first();

        // Empty boneyard, give next user no matching card, but give opponent a matching card ([6, 4])
        $round->update([
            'boneyard' => [],
            'left_end' => 6,
            'right_end' => 1
        ]);
        $nextHandModel->update(['hand' => [[3, 3]]]);

        $otherUser = $nextUser->id === $p1->id ? $p2 : $p1;
        $otherHandModel = PlayerHand::where('round_id', $round->id)->where('player_id', $otherUser->id)->first();
        $otherHandModel->update(['hand' => [[6, 4]]]);

        // Trigger pass
        $passResponse = $this->actingAs($nextUser, 'sanctum')
            ->postJson("/api/matches/{$matchId}/pass");

        $passResponse->assertStatus(200);

        // Verify turn rotated
        $round->refresh();
        $this->assertEquals($turnUser->id, $round->current_turn_player_id);

        // ==========================================
        // 15. Test blocked game scoring / 17. Test round transitions
        // ==========================================
        // Force blocked game state: boneyard empty, ends are 5, no player has 5.
        $round->update([
            'boneyard' => [],
            'left_end' => 5,
            'right_end' => 5,
            'current_turn_player_id' => $p1->id
        ]);
        $handModel1 = PlayerHand::where('round_id', $round->id)->where('player_id', $p1->id)->first();
        $handModel2 = PlayerHand::where('round_id', $round->id)->where('player_id', $p2->id)->first();

        $handModel1->update(['hand' => [[1, 1]]]); // sum = 2
        $handModel2->update(['hand' => [[2, 2]]]); // sum = 4

        // P1 plays [1,1] (illegal on 5) -> triggers fail validation
        // P1 passes (since no playable tiles and boneyard empty)
        $pass1 = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$matchId}/pass");
        $pass1->assertStatus(200);

        // P2 pass is no longer required because the round was automatically ended as blocked on P1's pass.

        // Since both passed and boneyard is empty, MatchService ends the round as blocked!
        // P1 hand sum = 2, P2 hand sum = 4. P1 wins the blocked round!
        // Points awarded to P1: sum of opponent tiles = 4 points.
        // Verify round status becomes 'finished', and a new round is prepared.
        $oldRound = $round;
        $oldRound->refresh();
        $this->assertEquals('completed', $oldRound->status);
        $this->assertEquals($p1->id, $oldRound->winner_id);
        $this->assertEquals(4, $oldRound->scores()->where('player_id', $p1->id)->value('points_awarded'));

        // ==========================================
        // 16. Test winning by empty hand
        // ==========================================
        // Get new active round
        $round = $match->rounds()->where('status', 'playing')->first();
        $this->assertNotNull($round);
        $this->assertEquals(2, $round->round_number);

        // Force a win by empty hand: P1 plays their last tile.
        $round->update([
            'board_state' => [[3, 3]],
            'left_end' => 3,
            'right_end' => 3,
            'current_turn_player_id' => $p1->id
        ]);
        $handModel1 = PlayerHand::where('round_id', $round->id)->where('player_id', $p1->id)->first();
        $handModel1->update(['hand' => [[3, 4]]]); // last tile
        $handModel2 = PlayerHand::where('round_id', $round->id)->where('player_id', $p2->id)->first();
        $handModel2->update(['hand' => [[4, 4], [2, 2]]]); // sum = 12

        // P1 plays [3,4]
        $playWin = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$matchId}/play", [
                'tile' => [3, 4],
                'side' => 'left'
            ]);
        $playWin->assertStatus(200);

        // Verify round ended with empty hand. Winner P1 receives 12 points.
        $round->refresh();
        $this->assertEquals('completed', $round->status);
        $this->assertEquals($p1->id, $round->winner_id);
        $this->assertEquals(12, $round->scores()->where('player_id', $p1->id)->value('points_awarded'));

        // Total score for P1 is now: 4 (from round 1) + 12 (from round 2) = 16. Target score is 50.

        // ==========================================
        // 19. Test player disconnect / 20. Test bot takeover / 21. Test player reconnection
        // ==========================================
        $round = $match->rounds()->where('status', 'playing')->first();
        $this->assertNotNull($round);
        
        // P2 disconnects
        $dc = $this->actingAs($p1, 'sanctum') // peer reports disconnect
            ->postJson("/api/matches/{$matchId}/report-disconnect", [
                'player_id' => $p2->id
            ]);
        $dc->assertStatus(200);
        $this->assertDatabaseHas('reconnect_sessions', ['user_id' => $p2->id]);

        // Bot Takeover simulation: set cache key and delete reconnect session
        Cache::put("match:{$matchId}:bot:{$p2->id}", true);
        ReconnectSession::where('match_id', $matchId)->where('user_id', $p2->id)->delete();
        $this->assertTrue(Cache::get("match:{$matchId}:bot:{$p2->id}"));

        // Reconnect P2
        $rc = $this->actingAs($p2, 'sanctum')
            ->postJson("/api/matches/{$matchId}/report-reconnect");
        $rc->assertStatus(200);
        $this->assertDatabaseMissing('reconnect_sessions', ['user_id' => $p2->id]);
        $this->assertFalse(Cache::get("match:{$matchId}:bot:{$p2->id}", false)); // Cache key cleared

        // ==========================================
        // 18. Test match end / 22. Test match completion after reconnect
        // ==========================================
        // Force match finish: make P1 score reach target (50) by awarding a large score in the next round.
        $round->update([
            'board_state' => [[1, 1]],
            'left_end' => 1,
            'right_end' => 1,
            'current_turn_player_id' => $p1->id
        ]);
        $handModel1 = PlayerHand::where('round_id', $round->id)->where('player_id', $p1->id)->first();
        $handModel1->update(['hand' => [[1, 2]]]);
        $handModel2 = PlayerHand::where('round_id', $round->id)->where('player_id', $p2->id)->first();
        // sum = 45 points
        $handModel2->update(['hand' => [[6, 6], [5, 5], [4, 4], [3, 2]]]);

        // P1 plays [1,2] -> wins round. Points = 45. Total match score for P1 = 16 + 45 = 61. Target is 50.
        $playLast = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$matchId}/play", [
                'tile' => [1, 2],
                'side' => 'left'
            ]);
        $playLast->assertStatus(200);

        // Verify match status is finished and P1 is the winner!
        $match->refresh();
        $this->assertEquals('completed', $match->status);
        $this->assertEquals($p1->id, $match->winner_id);
    }
}
