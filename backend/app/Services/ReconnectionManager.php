<?php

namespace App\Services;

use App\Models\ReconnectSession;
use App\Jobs\BotTakeoverJob;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class ReconnectionManager
{
    protected MatchService $matchService;

    public function __construct(MatchService $matchService)
    {
        $this->matchService = $matchService;
    }

    /**
     * Mark a user as disconnected, pause match, start 60s countdown.
     */
    public function disconnectUser(int $matchId, int $userId)
    {
        // 1. Pause match using match service
        $this->matchService->pauseMatch($matchId, $userId);

        // 2. Schedule bot takeover after 60 seconds
        BotTakeoverJob::dispatch($matchId, $userId)->delay(Carbon::now()->addSeconds(60));
    }

    /**
     * Handle user reconnection (hot takeover).
     */
    public function reconnectUser(int $matchId, int $userId)
    {
        $session = ReconnectSession::where('match_id', $matchId)
            ->where('user_id', $userId)
            ->first();

        if ($session) {
            // Reconnected within 60s window: resume match and clear session
            $this->matchService->resumeMatch($matchId, $userId);
        } else {
            // Reconnected after bot took control: deactivate bot and resume human control
            $isBot = Cache::get("match:{$matchId}:bot:{$userId}", false);
            if ($isBot) {
                Cache::forget("match:{$matchId}:bot:{$userId}");
                
                // Broadcast updated state (showing human is connected & bot deactivated)
                $this->matchService->broadcastState($matchId);
            }
        }
    }
}
