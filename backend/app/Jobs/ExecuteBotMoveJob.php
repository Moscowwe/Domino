<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Services\BotManager;

class ExecuteBotMoveJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $matchId;
    public int $userId;

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
    public function handle(BotManager $botManager): void
    {
        // Execute the bot move
        $botManager->executeBotMove($this->matchId, $this->userId);
    }
}
