<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Room;
use App\Models\MatchModel;
use App\Models\MatchPlayer;
use App\Models\PlayerHand;
use App\Models\Round;
use App\Models\ReconnectSession;
use App\Jobs\TurnTimeoutJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MatchControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    /**
     * Test first-turn fallback logic when double-zero is in the boneyard.
     */
    public function test_1v1_first_turn_fallback_when_double_zero_in_boneyard(): void
    {
        $p1 = User::create([
            'username' => 'player_one',
            'email' => 'p1@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $p2 = User::create([
            'username' => 'player_two',
            'email' => 'p2@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_shield'
        ]);

        $room = Room::create([
            'code' => 'TEST12',
            'host_id' => $p1->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'playing'
        ]);

        $match = MatchModel::create([
            'room_id' => $room->id,
            'mode' => '1v1',
            'target_score' => 101,
            'status' => 'active'
        ]);

        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p1->id, 'seat_index' => 0]);
        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p2->id, 'seat_index' => 1]);

        $round = Round::create([
            'match_id' => $match->id,
            'round_number' => 1,
            'status' => 'playing',
            'board_state' => [],
            'left_end' => null,
            'right_end' => null,
            'boneyard' => [[0, 0], [4, 5]],
            'current_turn_player_id' => $p1->id,
            'turn_deadline' => now()->addSeconds(25)
        ]);

        PlayerHand::create([
            'round_id' => $round->id,
            'player_id' => $p1->id,
            'hand' => [[1, 1], [3, 4]]
        ]);

        PlayerHand::create([
            'round_id' => $round->id,
            'player_id' => $p2->id,
            'hand' => [[2, 2], [3, 5]]
        ]);

        $response = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$match->id}/play", [
                'tile' => [1, 1],
                'side' => 'start'
            ]);

        $response->assertStatus(200);

        $round->refresh();
        $this->assertEquals([[1, 1]], $round->board_state);
        $this->assertEquals($p2->id, $round->current_turn_player_id);
    }

    /**
     * Test that playing a tile you don't possess fails.
     */
    public function test_cannot_play_unpossessed_tile(): void
    {
        $p1 = User::create(['username' => 'player_one', 'email' => 'p1@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);
        $p2 = User::create(['username' => 'player_two', 'email' => 'p2@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);

        $room = Room::create(['code' => 'TEST13', 'host_id' => $p1->id, 'players_count' => 2, 'target_score' => 101, 'status' => 'playing']);
        $match = MatchModel::create(['room_id' => $room->id, 'mode' => '1v1', 'target_score' => 101, 'status' => 'active']);

        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p1->id, 'seat_index' => 0]);
        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p2->id, 'seat_index' => 1]);

        $round = Round::create([
            'match_id' => $match->id,
            'round_number' => 1,
            'status' => 'playing',
            'board_state' => [],
            'left_end' => null,
            'right_end' => null,
            'boneyard' => [[0, 0]],
            'current_turn_player_id' => $p1->id,
            'turn_deadline' => now()->addSeconds(25)
        ]);

        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p1->id, 'hand' => [[1, 1]]]);
        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p2->id, 'hand' => [[2, 2]]]);

        $response = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$match->id}/play", [
                'tile' => [3, 3],
                'side' => 'start'
            ]);

        $response->assertStatus(400);
    }

    /**
     * Test drawing tiles from boneyard.
     */
    public function test_drawing_tile_from_boneyard(): void
    {
        $p1 = User::create(['username' => 'player_one', 'email' => 'p1@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);
        $p2 = User::create(['username' => 'player_two', 'email' => 'p2@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);

        $room = Room::create(['code' => 'TEST14', 'host_id' => $p1->id, 'players_count' => 2, 'target_score' => 101, 'status' => 'playing']);
        $match = MatchModel::create(['room_id' => $room->id, 'mode' => '1v1', 'target_score' => 101, 'status' => 'active']);

        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p1->id, 'seat_index' => 0]);
        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p2->id, 'seat_index' => 1]);

        $round = Round::create([
            'match_id' => $match->id,
            'round_number' => 1,
            'status' => 'playing',
            'board_state' => [[2, 2]],
            'left_end' => 2,
            'right_end' => 2,
            'boneyard' => [[4, 5], [1, 2]], // [1,2] is on top (array_pop)
            'current_turn_player_id' => $p1->id,
            'turn_deadline' => now()->addSeconds(25)
        ]);

        // P1 holds [3, 4] (cannot play on 2)
        $h1 = PlayerHand::create(['round_id' => $round->id, 'player_id' => $p1->id, 'hand' => [[3, 4]]]);
        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p2->id, 'hand' => [[2, 5]]]);

        // P1 draws a tile
        $response = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$match->id}/draw");

        $response->assertStatus(200);

        // Since drawn tile [1, 2] is playable on 2, it is automatically played on right (or left)!
        // Verify P1 hand remains 1 tile ([3,4]), boneyard drops to 1 tile, board updates
        $round->refresh();
        $this->assertEquals(1, count($round->boneyard));
        $this->assertEquals([[1, 2], [2, 2]], $round->board_state);
        $this->assertEquals($p2->id, $round->current_turn_player_id); // turn rotates
    }

    /**
     * Test passing when boneyard is empty.
     */
    public function test_passing_turn_when_boneyard_empty(): void
    {
        $p1 = User::create(['username' => 'player_one', 'email' => 'p1@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);
        $p2 = User::create(['username' => 'player_two', 'email' => 'p2@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);

        $room = Room::create(['code' => 'TEST15', 'host_id' => $p1->id, 'players_count' => 2, 'target_score' => 101, 'status' => 'playing']);
        $match = MatchModel::create(['room_id' => $room->id, 'mode' => '1v1', 'target_score' => 101, 'status' => 'active']);

        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p1->id, 'seat_index' => 0]);
        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p2->id, 'seat_index' => 1]);

        $round = Round::create([
            'match_id' => $match->id,
            'round_number' => 1,
            'status' => 'playing',
            'board_state' => [[5, 5]],
            'left_end' => 5,
            'right_end' => 5,
            'boneyard' => [], // empty boneyard
            'current_turn_player_id' => $p1->id,
            'turn_deadline' => now()->addSeconds(25)
        ]);

        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p1->id, 'hand' => [[1, 2]]]); // no playable tile
        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p2->id, 'hand' => [[5, 6]]]);

        $response = $this->actingAs($p1, 'sanctum')
            ->postJson("/api/matches/{$match->id}/pass");

        $response->assertStatus(200);

        $round->refresh();
        $this->assertEquals($p2->id, $round->current_turn_player_id); // turn rotates
    }

    /**
     * Test reconnection reporting and bot takeover.
     */
    public function test_reconnection_reporting_and_bot_takeover(): void
    {
        $p1 = User::create(['username' => 'player_one', 'email' => 'p1@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);
        $p2 = User::create(['username' => 'player_two', 'email' => 'p2@example.com', 'password' => bcrypt('password123'), 'avatar' => 'avatar_crown']);

        $room = Room::create(['code' => 'TEST16', 'host_id' => $p1->id, 'players_count' => 2, 'target_score' => 101, 'status' => 'playing']);
        $match = MatchModel::create(['room_id' => $room->id, 'mode' => '1v1', 'target_score' => 101, 'status' => 'active']);

        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p1->id, 'seat_index' => 0]);
        MatchPlayer::create(['match_id' => $match->id, 'user_id' => $p2->id, 'seat_index' => 1]);

        $round = Round::create([
            'match_id' => $match->id,
            'round_number' => 1,
            'status' => 'playing',
            'board_state' => [],
            'left_end' => null,
            'right_end' => null,
            'boneyard' => [[0, 0]],
            'current_turn_player_id' => $p1->id,
            'turn_deadline' => now()->addSeconds(25)
        ]);

        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p1->id, 'hand' => [[1, 1]]]);
        PlayerHand::create(['round_id' => $round->id, 'player_id' => $p2->id, 'hand' => [[2, 2]]]);

        // 1. Report Disconnect
        $response = $this->actingAs($p2, 'sanctum') // peer reports disconnect of P1
            ->postJson("/api/matches/{$match->id}/report-disconnect", [
                'player_id' => $p1->id
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('reconnect_sessions', [
            'match_id' => $match->id,
            'user_id' => $p1->id
        ]);

        // 2. Report Reconnect
        $response2 = $this->actingAs($p1, 'sanctum') // P1 returns
            ->postJson("/api/matches/{$match->id}/report-reconnect");

        $response2->assertStatus(200);
        $this->assertDatabaseMissing('reconnect_sessions', [
            'match_id' => $match->id,
            'user_id' => $p1->id
        ]);
    }
}
