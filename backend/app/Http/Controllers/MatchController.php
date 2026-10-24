<?php

namespace App\Http\Controllers;

use App\Models\MatchModel;
use App\Models\PlayerHand;
use App\Models\ReconnectSession;
use App\Models\Team;
use App\Models\RoundScore;
use App\Services\MatchService;
use App\Services\ReconnectionManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class MatchController extends Controller
{
    protected MatchService $matchService;

    public function __construct(MatchService $matchService)
    {
        $this->matchService = $matchService;
    }

    /**
     * Get the active game state for a player (authoritative filters applied).
     */
    public function show(Request $request, int $id)
    {
        $user = $request->user();
        $match = MatchModel::findOrFail($id);

        $player = $match->players()->where('user_id', $user->id)->first();
        if (!$player) {
            return response()->json(['message' => 'Unauthorized. Not a participant in this match.'], 403);
        }

        $round = $match->rounds()->orderBy('round_number', 'desc')->first();
        if (!$round) {
            return response()->json(['message' => 'Round not found.'], 404);
        }

        $handModel = PlayerHand::where('round_id', $round->id)->where('player_id', $user->id)->first();
        $myHand = $handModel ? $handModel->hand : [];

        $reconnectSessions = ReconnectSession::where('match_id', $match->id)->pluck('expires_at', 'user_id')->toArray();

        // Construct player data list
        $playersData = $match->players->map(function ($p) use ($round, $reconnectSessions) {
            $handCount = PlayerHand::where('round_id', $round->id)->where('player_id', $p->user_id)->first();
            $tileCount = $handCount ? count($handCount->hand) : 0;
            
            $hasSession = isset($reconnectSessions[$p->user_id]);
            $isBot = Cache::get("match:{$p->match_id}:bot:{$p->user_id}", false);

            return [
                'id' => $p->user->id,
                'username' => $p->user->username,
                'avatar' => $p->user->avatar,
                'seat_index' => $p->seat_index,
                'team_index' => $p->team_index,
                'tile_count' => $tileCount,
                'is_connected' => !$hasSession,
                'is_bot' => $isBot,
                'reconnect_deadline' => $hasSession ? $reconnectSessions[$p->user_id]->toIso8601String() : null,
            ];
        })->toArray();

        // Construct scores map
        $scoresMap = [];
        foreach ($match->players as $p) {
            $scoresMap[$p->user_id] = RoundScore::whereHas('round', fn($q) => $q->where('match_id', $match->id))
                ->where('player_id', $p->user_id)
                ->sum('points_awarded');
        }

        $teamScores = null;
        if ($match->mode === '2v2') {
            $teamScores = Team::where('match_id', $match->id)->pluck('score', 'team_index')->toArray();
        }

        $roundsHistory = $match->rounds()
            ->where('status', 'finished')
            ->orderBy('round_number', 'asc')
            ->get()
            ->map(function ($r) {
                return [
                    'round_number' => $r->round_number,
                    'reason' => $r->end_reason,
                    'winner_id' => $r->winner_id,
                    'points_awarded' => $r->points_awarded
                ];
            })->toArray();

        $duration = $match->ended_at ? $match->ended_at->diffInSeconds($match->started_at) : ($match->started_at ? now()->diffInSeconds($match->started_at) : 0);

        return response()->json([
            'match_id' => $match->id,
            'mode' => $match->mode,
            'status' => $match->status,
            'target_score' => $match->target_score,
            'winner_id' => $match->winner_id,
            'winning_team_index' => $match->winning_team_index,
            'duration_seconds' => $duration,
            'round_history' => $roundsHistory,
            'round_number' => $round->round_number,
            'round_status' => $round->status,
            'board' => $round->board_state,
            'left_end' => $round->left_end,
            'right_end' => $round->right_end,
            'boneyard_count' => count($round->boneyard),
            'current_turn_player_id' => $round->current_turn_player_id,
            'turn_deadline' => $round->turn_deadline ? $round->turn_deadline->toIso8601String() : null,
            'players' => $playersData,
            'scores' => $scoresMap,
            'team_scores' => $teamScores,
            'my_hand' => $myHand,
        ], 200);
    }

    /**
     * Submit playing a tile.
     */
    public function play(Request $request, int $id)
    {
        $request->validate([
            'tile' => 'required|array|size:2',
            'tile.0' => 'required|integer|min:0|max:6',
            'tile.1' => 'required|integer|min:0|max:6',
            'side' => 'required|string|in:left,right,start',
        ]);

        $userId = $request->user()->id;
        $success = $this->matchService->playTile($id, $userId, $request->tile, $request->side);

        if (!$success) {
            return response()->json(['message' => 'Invalid move or not your turn.'], 400);
        }

        return response()->json(['message' => 'Move completed successfully.'], 200);
    }

    /**
     * Submit drawing a tile from the boneyard.
     */
    public function draw(Request $request, int $id)
    {
        $userId = $request->user()->id;
        $drawnTile = $this->matchService->drawTile($id, $userId);

        if (!$drawnTile) {
            return response()->json(['message' => 'Cannot draw. Not your turn, hand contains playable tiles, or boneyard is empty.'], 400);
        }

        return response()->json([
            'message' => 'Tile drawn successfully.',
            'tile' => $drawnTile
        ], 200);
    }

    /**
     * Submit passing the turn.
     */
    public function pass(Request $request, int $id)
    {
        $userId = $request->user()->id;
        $success = $this->matchService->passTurn($id, $userId);

        if (!$success) {
            return response()->json(['message' => 'Cannot pass. Not your turn, hand contains playable tiles, or boneyard has tiles remaining.'], 400);
        }

        return response()->json(['message' => 'Passed turn successfully.'], 200);
    }

    /**
     * Report player disconnect.
     */
    public function reportDisconnect(Request $request, int $id, ReconnectionManager $reconnectionManager)
    {
        $request->validate([
            'player_id' => 'required|integer|exists:users,id',
        ]);

        // Verify player is actually in the match
        $match = MatchModel::findOrFail($id);
        $isPlayer = $match->players()->where('user_id', $request->player_id)->exists();
        if (!$isPlayer) {
            return response()->json(['message' => 'Player not in this match.'], 400);
        }

        $reconnectionManager->disconnectUser($id, $request->player_id);

        return response()->json(['message' => 'Disconnect logged. Match paused.'], 200);
    }

    /**
     * Report player reconnect.
     */
    public function reportReconnect(Request $request, int $id, ReconnectionManager $reconnectionManager)
    {
        $userId = $request->user()->id;

        // Verify player is actually in the match
        $match = MatchModel::findOrFail($id);
        $isPlayer = $match->players()->where('user_id', $userId)->exists();
        if (!$isPlayer) {
            return response()->json(['message' => 'Unauthorized. Not in match.'], 403);
        }

        $reconnectionManager->reconnectUser($id, $userId);

        return response()->json(['message' => 'Reconnected successfully.'], 200);
    }
}
