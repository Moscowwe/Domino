<?php

namespace App\Jobs;

use App\Models\Round;
use App\Services\BotManager;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class TurnTimeoutJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected int $roundId;
    protected int $playerId;

    /**
     * Create a new job instance.
     */
    public function __construct(int $roundId, int $playerId)
    {
        $this->roundId = $roundId;
        $this->playerId = $playerId;
    }

    /**
     * Execute the job.
     */
    public function handle(BotManager $botManager): void
    {
        $round = Round::find($this->roundId);
        if (!$round || $round->status !== 'playing' || $round->current_turn_player_id !== $this->playerId) {
            return;
        }

        // Execute move on behalf of the player using Bot heuristic to prevent state lock
        $botManager->executeBotMove($round->match_id, $this->playerId);
    }
}
