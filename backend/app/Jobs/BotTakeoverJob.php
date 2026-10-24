<?php

namespace App\Jobs;

use App\Models\ReconnectSession;
use App\Services\MatchService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;

class BotTakeoverJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected int $matchId;
    protected int $userId;

    /**
     * Create a new job instance.
     */
    public function __construct(int $matchId, int $userId)
    {
        $this->matchId = $matchId;
        $this->userId = $userId;
    }

    /**
     * Execute the job.
     */
    public function handle(MatchService $matchService): void
    {
        $session = ReconnectSession::where('match_id', $this->matchId)
            ->where('user_id', $this->userId)
            ->first();

        if ($session) {
            // 60-second window expired without player re-connecting.
            // Activate CPU Bot control.
            Cache::put("match:{$this->matchId}:bot:{$this->userId}", true);

            // Clean up pause session
            $session->delete();

            // Resume game play loop
            $matchService->activateBotControl($this->matchId, $this->userId);
        }
    }
}
