<?php

namespace App\Http\Controllers;

use App\Models\MatchPlayer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    /**
     * Display the authenticated user's profile details & statistics.
     */
    public function show(Request $request)
    {
        $user = $request->user();
        
        // Load statistics
        $stats = $user->statistic()->first();

        // Build match history
        $matches = MatchPlayer::where('user_id', $user->id)
            ->with(['match.players.user', 'match.winner'])
            ->get()
            ->map(function ($playerJoin) use ($user) {
                $m = $playerJoin->match;
                if (!$m) return null;

                // Determine result string
                $result = 'lost';
                if ($m->status === 'completed') {
                    if ($m->mode === '1v1') {
                        $result = ($m->winner_id === $user->id) ? 'won' : 'lost';
                    } else {
                        // 2v2: Check if winner team index matches this player's team index
                        $result = ($m->winning_team_index === $playerJoin->team_index) ? 'won' : 'lost';
                    }
                } elseif ($m->status === 'abandoned') {
                    $result = 'abandoned';
                }

                // Identify opponent name(s)
                $opponents = $m->players
                    ->filter(fn($p) => $p->user_id !== $user->id)
                    ->map(fn($p) => $p->user->username)
                    ->values()
                    ->toArray();

                return [
                    'match_id' => $m->id,
                    'mode' => $m->mode,
                    'target_score' => $m->target_score,
                    'result' => $result,
                    'winner' => $m->winner ? $m->winner->username : ($m->winning_team_index !== null ? "Team " . ($m->winning_team_index + 1) : null),
                    'opponents' => implode(', ', $opponents),
                    'played_at' => $m->started_at ? $m->started_at->toIso8601String() : null
                ];
            })
            ->filter()
            ->values()
            ->toArray();

        return response()->json([
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'avatar' => $user->avatar,
                'email' => $user->email,
                'stats' => $stats,
                'history' => $matches
            ]
        ], 200);
    }

    /**
     * Retrieve statistics only.
     */
    public function statistics(Request $request)
    {
        $stats = $request->user()->statistic()->first();
        return response()->json(['stats' => $stats], 200);
    }

    /**
     * Upload custom profile avatar.
     */
    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar_file' => 'required|image|mimes:jpeg,png,jpg,gif,svg|max:2048',
        ]);

        $user = $request->user();

        if ($request->hasFile('avatar_file')) {
            $file = $request->file('avatar_file');
            $path = $file->store('avatars', 'public');
            
            // Delete old uploaded avatar if any
            if ($user->avatar && str_starts_with($user->avatar, 'storage/avatars/')) {
                Storage::disk('public')->delete(str_replace('storage/', '', $user->avatar));
            }

            $user->update([
                'avatar' => 'storage/' . $path
            ]);
        }

        return response()->json([
            'message' => 'Avatar uploaded successfully.',
            'avatar' => $user->avatar
        ], 200);
    }
}
