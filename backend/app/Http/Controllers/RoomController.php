<?php

namespace App\Http\Controllers;

use App\Events\RoomUpdated;
use App\Events\GameStarting;
use App\Events\ChatMessageSent;
use App\Models\Room;
use App\Models\RoomPlayer;
use App\Models\MatchModel;
use App\Models\MatchPlayer;
use App\Models\Team;
use App\Models\User;
use App\Models\ChatMessage;
use App\Services\MatchService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class RoomController extends Controller
{
    /**
     * Create a new room lobby.
     */
    public function create(Request $request)
    {
        $request->validate([
            'players_count' => 'required|integer|in:2,4',
            'target_score' => 'required|integer|min:10|max:500',
            'is_private' => 'required|boolean',
            'name' => 'nullable|string|max:100',
        ]);

        $user = $request->user();

        // If user is already in a room, leave it
        $this->cleanupUserLobby($user);

        // Generate unique 6-char code
        do {
            $code = strtoupper(Str::random(6));
        } while (Room::where('code', $code)->exists());

        $room = Room::create([
            'code' => $code,
            'host_id' => $user->id,
            'name' => $request->name ?? ($user->username . "'s Room"),
            'players_count' => $request->players_count,
            'target_score' => $request->target_score,
            'is_private' => $request->is_private,
            'status' => 'lobby',
        ]);

        // Place host in slot 0
        RoomPlayer::create([
            'room_id' => $room->id,
            'user_id' => $user->id,
            'slot_index' => 0,
            'is_ready' => true, // Host is ready by default
        ]);

        $roomState = $this->serializeRoom($room->id);
        
        return response()->json($roomState, 201);
    }

    /**
     * Join an existing room via code.
     */
    public function join(Request $request)
    {
        $request->validate([
            'code' => 'required|string|size:6',
        ]);

        $user = $request->user();
        $code = strtoupper($request->code);

        $room = Room::where('code', $code)->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        if ($room->status !== 'lobby') {
            return response()->json(['message' => 'Room is already in an active game.'], 400);
        }

        // Check if player is already in this room
        $existing = RoomPlayer::where('room_id', $room->id)->where('user_id', $user->id)->first();
        if ($existing) {
            return response()->json($this->serializeRoom($room->id), 200);
        }

        // Clean user from other rooms
        $this->cleanupUserLobby($user);

        // Seating count check
        $currentPlayersCount = $room->players()->count();
        if ($currentPlayersCount >= $room->players_count) {
            return response()->json(['message' => 'Room is full.'], 400);
        }

        // Find first unoccupied slot index
        $occupiedSlots = $room->players()->pluck('slot_index')->toArray();
        $targetSlot = 0;
        for ($i = 0; $i < $room->players_count; $i++) {
            if (!in_array($i, $occupiedSlots)) {
                $targetSlot = $i;
                break;
            }
        }

        RoomPlayer::create([
            'room_id' => $room->id,
            'user_id' => $user->id,
            'slot_index' => $targetSlot,
            'is_ready' => false,
        ]);

        $roomState = $this->serializeRoom($room->id);

        // Broadcast to WebSocket presence channel
        broadcast(new RoomUpdated($room->code, $roomState))->toOthers();

        return response()->json($roomState, 200);
    }

    /**
     * Fetch current room details.
     */
    public function show(string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        return response()->json($this->serializeRoom($room->id), 200);
    }

    /**
     * Update room settings (host only).
     */
    public function updateSettings(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        if ($room->host_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized. Only host can edit settings.'], 403);
        }

        $request->validate([
            'players_count' => 'required|integer|in:2,4',
            'target_score' => 'required|integer|min:10|max:500',
            'is_private' => 'required|boolean',
        ]);

        // If shrinking player slot index, make sure there are no players currently sitting in slots to be deleted
        $currentCount = $room->players()->count();
        if ($request->players_count < $currentCount) {
            return response()->json(['message' => 'Cannot decrease capacity. Remove players first.'], 400);
        }

        $room->update([
            'players_count' => $request->players_count,
            'target_score' => $request->target_score,
            'is_private' => $request->is_private,
        ]);

        $roomState = $this->serializeRoom($room->id);
        broadcast(new RoomUpdated($room->code, $roomState))->toOthers();

        return response()->json($roomState, 200);
    }

    /**
     * Toggle readiness of a player.
     */
    public function toggleReady(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $player = RoomPlayer::where('room_id', $room->id)->where('user_id', $request->user()->id)->first();
        if (!$player) {
            return response()->json(['message' => 'Player not in this room.'], 400);
        }

        // Host is always ready
        if ($room->host_id === $request->user()->id) {
            $player->update(['is_ready' => true]);
        } else {
            $player->update(['is_ready' => !$player->is_ready]);
        }

        $roomState = $this->serializeRoom($room->id);
        broadcast(new RoomUpdated($room->code, $roomState))->toOthers();

        return response()->json($roomState, 200);
    }

    /**
     * Leave a room.
     */
    public function leave(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $this->cleanupUserLobby($request->user());

        $roomPlayers = RoomPlayer::where('room_id', $room->id)->get();

        if ($roomPlayers->isEmpty()) {
            $room->delete();
            return response()->json(['message' => 'Left room. Room disbanded.'], 200);
        }

        // If the leaving player was the host, designate a new host
        if ($room->host_id === $request->user()->id) {
            $nextPlayer = $roomPlayers->sortBy('slot_index')->first();
            $room->update([
                'host_id' => $nextPlayer->user_id
            ]);
            // Host is forced to be ready
            $nextPlayer->update(['is_ready' => true]);
        }

        $roomState = $this->serializeRoom($room->id);
        broadcast(new RoomUpdated($room->code, $roomState))->toOthers();

        return response()->json(['message' => 'Left room successfully.'], 200);
    }

    /**
     * Start an instant 1v1 match with a bot.
     */
    public function startBotMatch(Request $request, MatchService $matchService)
    {
        $user = $request->user();

        // 1. Leave any existing room
        $this->cleanupUserLobby($user);

        // 2. Create the Bot User if it doesn't exist
        $botUser = User::firstOrCreate(
            ['email' => 'bot@domino.io'],
            [
                'username' => 'Domino AI',
                'password' => bcrypt(Str::random(16)),
                'avatar' => 'avatar_zap'
            ]
        );

        // 3. Create a private Room and setup match transactionally
        $result = DB::transaction(function () use ($user, $botUser) {
            $room = Room::create([
                'code' => strtoupper(Str::random(6)),
                'host_id' => $user->id,
                'name' => 'AI Training',
                'players_count' => 2,
                'target_score' => 101,
                'is_private' => true,
                'status' => 'playing',
            ]);

            $match = MatchModel::create([
                'room_id' => $room->id,
                'mode' => '1v1',
                'target_score' => $room->target_score,
                'status' => 'active',
            ]);

            // Seating: human is 0, bot is 1
            MatchPlayer::create([
                'match_id' => $match->id,
                'user_id' => $user->id,
                'seat_index' => 0,
            ]);

            MatchPlayer::create([
                'match_id' => $match->id,
                'user_id' => $botUser->id,
                'seat_index' => 1,
            ]);

            return ['room' => $room, 'match' => $match];
        });

        $room = $result['room'];
        $match = $result['match'];

        // 4. Mark the bot user as bot-controlled in Cache
        Cache::put("match:{$match->id}:bot:{$botUser->id}", true, now()->addHours(2));

        // 5. Initialize first round
        $matchService->initializeNewRound($match);

        // 6. Explicitly trigger bot in case bot drew [0,0] and must start
        $matchService->triggerBotIfApplicable($match->id);

        return response()->json([
            'match_id' => $match->id,
            'room_code' => $room->code,
        ], 200);
    }

    /**
     * Start the match (host only).
     */
    public function startMatch(Request $request, string $code, MatchService $matchService)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        if ($room->host_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized. Only host can start game.'], 403);
        }

        $players = RoomPlayer::where('room_id', $room->id)->get();
        if ($players->count() !== $room->players_count) {
            return response()->json(['message' => 'Cannot start match. Room is not full.'], 400);
        }

        // Check if all players are ready
        foreach ($players as $p) {
            if (!$p->is_ready) {
                return response()->json(['message' => 'Cannot start match. Not all players are ready.'], 400);
            }
        }

        // Lock room and setup match transactionally
        $match = DB::transaction(function () use ($room, $players) {
            $room->update(['status' => 'playing']);

            $match = MatchModel::create([
                'room_id' => $room->id,
                'mode' => $room->players_count === 2 ? '1v1' : '2v2',
                'target_score' => $room->target_score,
                'status' => 'active',
            ]);

            // Seating: order by slot index
            $sortedPlayers = $players->sortBy('slot_index')->values();
            foreach ($sortedPlayers as $seatIndex => $rp) {
                // Team index calculation: slot 0 and 2 belong to Team 0, slot 1 and 3 belong to Team 1
                $teamIndex = ($room->players_count === 4) ? ($seatIndex % 2) : null;

                MatchPlayer::create([
                    'match_id' => $match->id,
                    'user_id' => $rp->user_id,
                    'team_index' => $teamIndex,
                    'seat_index' => $seatIndex,
                ]);
            }

            // Create teams if 2v2
            if ($room->players_count === 4) {
                Team::create(['match_id' => $match->id, 'team_index' => 0, 'score' => 0]);
                Team::create(['match_id' => $match->id, 'team_index' => 1, 'score' => 0]);
            }

            return $match;
        });

        // Initialize first round of match via service
        $matchService->initializeNewRound($match);

        // Broadcast starting match ID
        broadcast(new GameStarting($room->code, $match->id))->toOthers();

        return response()->json(['match_id' => $match->id], 200);
    }

    /**
     * List all public active rooms in lobby.
     */
    public function listPublic()
    {
        $rooms = Room::where('is_private', false)
            ->where('status', 'lobby')
            ->with(['host'])
            ->withCount('players as current_players_count')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($r) {
                return [
                    'code' => $r->code,
                    'name' => $r->name,
                    'players_count' => $r->players_count,
                    'joined_count' => $r->current_players_count,
                    'target_score' => $r->target_score,
                    'host' => $r->host->username,
                ];
            });

        return response()->json(['rooms' => $rooms], 200);
    }

    // Helper functions

    private function cleanupUserLobby($user)
    {
        $playerRecords = RoomPlayer::where('user_id', $user->id)->get();
        foreach ($playerRecords as $rp) {
            $roomId = $rp->room_id;
            $rp->delete();

            $room = Room::find($roomId);
            if ($room) {
                $remaining = RoomPlayer::where('room_id', $room->id)->get();
                if ($remaining->isEmpty()) {
                    $room->delete();
                } else {
                    if ($room->host_id === $user->id) {
                        $nextPlayer = $remaining->sortBy('slot_index')->first();
                        $room->update(['host_id' => $nextPlayer->user_id]);
                        $nextPlayer->update(['is_ready' => true]);
                    }
                    $roomState = $this->serializeRoom($room->id);
                    broadcast(new RoomUpdated($room->code, $roomState))->toOthers();
                }
            }
        }
    }

    private function serializeRoom($roomId)
    {
        $room = Room::with(['host', 'players.user'])->find($roomId);
        if (!$room) return null;

        return [
            'id' => $room->id,
            'code' => $room->code,
            'host_id' => $room->host_id,
            'name' => $room->name,
            'players_count' => $room->players_count,
            'target_score' => $room->target_score,
            'is_private' => $room->is_private,
            'status' => $room->status,
            'players' => $room->players->map(function ($rp) {
                return [
                    'id' => $rp->user->id,
                    'username' => $rp->user->username,
                    'avatar' => $rp->user->avatar,
                    'slot_index' => $rp->slot_index,
                    'is_ready' => $rp->is_ready,
                ];
            })
        ];
    }

    /**
     * Send chat message in lobby.
     */
    public function sendChat(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();
        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        $request->validate([
            'message' => 'required|string|max:500'
        ]);

        $user = $request->user();

        // Chat message timestamped
        $msg = ChatMessage::create([
            'room_id' => $room->id,
            'user_id' => $user->id,
            'message' => $request->message,
            'type' => 'chat'
        ]);

        $payload = [
            'username' => $user->username,
            'avatar' => $user->avatar,
            'message' => $request->message,
            'type' => 'chat',
            'timestamp' => now()->toIso8601String()
        ];

        broadcast(new ChatMessageSent($room->code, $payload))->toOthers();

        return response()->json($payload, 200);
    }

    /**
     * Kick a player from the room lobby (host only).
     */
    public function kickPlayer(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        if ($room->host_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized. Only host can kick players.'], 403);
        }

        $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $kickUser = $request->user_id;

        if ($kickUser === $room->host_id) {
            return response()->json(['message' => 'Host cannot kick themselves.'], 400);
        }

        $player = RoomPlayer::where('room_id', $room->id)->where('user_id', $kickUser)->first();
        if (!$player) {
            return response()->json(['message' => 'Player not in this room.'], 400);
        }

        $player->delete();

        $roomState = $this->serializeRoom($room->id);
        broadcast(new RoomUpdated($room->code, $roomState))->toOthers();

        return response()->json($roomState, 200);
    }

    /**
     * Close and disband a room lobby (host only).
     */
    public function closeRoom(Request $request, string $code)
    {
        $room = Room::where('code', strtoupper($code))->first();

        if (!$room) {
            return response()->json(['message' => 'Room not found.'], 404);
        }

        if ($room->host_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized. Only host can close room.'], 403);
        }

        broadcast(new RoomUpdated($room->code, ['status' => 'disbanded']))->toOthers();

        $room->delete();

        return response()->json(['message' => 'Room closed and disbanded successfully.'], 200);
    }
}
