<?php

namespace App\Services;

use App\Models\Round;
use App\Models\PlayerHand;
use App\Models\MatchModel;
use Illuminate\Support\Facades\Log;

class BotManager
{
    /**
     * Calculate and execute the best move for a bot-controlled player.
     */
    public function executeBotMove(int $matchId, int $userId)
    {
        $match = MatchModel::findOrFail($matchId);
        $round = $match->rounds()->where('status', 'playing')->first();
        if (!$round || $round->current_turn_player_id !== $userId) {
            return;
        }

        $handModel = PlayerHand::where('round_id', $round->id)->where('player_id', $userId)->first();
        if (!$handModel) {
            return;
        }

        $hand = $handModel->hand;
        $leftEnd = $round->left_end;
        $rightEnd = $round->right_end;

        // 1. Identify playable tiles and prioritize doubles / high-value
        $playableOptions = []; // Array of ['tile' => [x,y], 'side' => 'left'|'right'|'start']

        if (empty($round->board_state)) {
            // First move of round
            $isFirstOfMatch = ($round->round_number === 1);
            
            // Check if anyone holds [0,0]
            $someoneHoldsZero = false;
            if ($isFirstOfMatch) {
                $engine = app(GameEngine::class);
                $allHands = PlayerHand::where('round_id', $round->id)->get();
                foreach ($allHands as $h) {
                    if ($engine->hasTile($h->hand, [0, 0])) {
                        $someoneHoldsZero = true;
                        break;
                    }
                }
            }

            if ($isFirstOfMatch && $someoneHoldsZero) {
                // Must play [0,0] (only if someone holds it)
                $engine = app(GameEngine::class);
                if ($engine->hasTile($hand, [0, 0])) {
                    $playableOptions[] = ['tile' => [0, 0], 'side' => 'start'];
                }
            } else {
                // Any tile is playable. Let's list all tiles in hand
                foreach ($hand as $tile) {
                    $playableOptions[] = ['tile' => $tile, 'side' => 'start'];
                }
            }
        } else {
            // Board has tiles. Check each tile in hand
            foreach ($hand as $tile) {
                $canLeft = ($tile[0] === $leftEnd || $tile[1] === $leftEnd);
                $canRight = ($tile[0] === $rightEnd || $tile[1] === $rightEnd);

                if ($canLeft) {
                    $playableOptions[] = ['tile' => $tile, 'side' => 'left'];
                }
                if ($canRight) {
                    $playableOptions[] = ['tile' => $tile, 'side' => 'right'];
                }
            }
        }

        // 2. Execute decision based on options
        if (!empty($playableOptions)) {
            // Apply Heuristic:
            // Sort by:
            // 1. Is Double (double tiles first)
            // 2. Sum of dots (highest value first)
            usort($playableOptions, function ($a, $b) {
                $t1 = $a['tile'];
                $t2 = $b['tile'];
                $isDouble1 = ($t1[0] === $t1[1]) ? 1 : 0;
                $isDouble2 = ($t2[0] === $t2[1]) ? 1 : 0;

                if ($isDouble1 !== $isDouble2) {
                    return $isDouble2 <=> $isDouble1; // Double comes first
                }

                $sum1 = $t1[0] + $t1[1];
                $sum2 = $t2[0] + $t2[1];
                return $sum2 <=> $sum1; // Higher sum first
            });

            // Pick the best option
            $bestMove = $playableOptions[0];

            // Execute move
            $matchService = app(MatchService::class);
            $matchService->playTile($matchId, $userId, $bestMove['tile'], $bestMove['side']);
        } else {
            // No moves available, draw or pass
            $matchService = app(MatchService::class);
            if (!empty($round->boneyard)) {
                // Draw tile (will auto-play if playable, or rotate turn)
                $matchService->drawTile($matchId, $userId);
            } else {
                // Pass turn
                $matchService->passTurn($matchId, $userId);
            }
        }
    }
}
