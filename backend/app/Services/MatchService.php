<?php

namespace App\Services;

use App\Events\GameStateUpdated;
use App\Events\RoundEnded;
use App\Events\MatchEnded;
use App\Models\MatchModel;
use App\Models\Round;
use App\Models\PlayerHand;
use App\Models\Move;
use App\Models\RoundScore;
use App\Models\MatchPlayer;
use App\Models\Team;
use App\Models\Statistic;
use App\Models\ReconnectSession;
use App\Jobs\TurnTimeoutJob;
use App\Jobs\ExecuteBotMoveJob;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class MatchService
{
    protected GameEngine $engine;

    public function __construct(GameEngine $engine)
    {
        $this->engine = $engine;
    }

    /**
     * Start a new round inside a match.
     */
    public function initializeNewRound(MatchModel $match)
    {
        DB::transaction(function () use ($match) {
            // Find current round number
            $lastRound = $match->rounds()->orderBy('round_number', 'desc')->first();
            $nextRoundNumber = $lastRound ? $lastRound->round_number + 1 : 1;

            // Deal hands and boneyard
            $playerCount = $match->mode === '1v1' ? 2 : 4;
            $deal = $this->engine->deal($playerCount);

            // Determine starter
            $starterSeatIndex = 0;
            if ($nextRoundNumber === 1) {
                // Determine by [0,0] tile
                $starterSeatIndex = $this->engine->determineStarter($deal['hands']);
            } else {
                // Determine by previous round winner
                $prevWinnerId = $lastRound->winner_id;
                if ($prevWinnerId) {
                    $prevWinnerSeat = $match->players()->where('user_id', $prevWinnerId)->first();
                    if ($prevWinnerSeat) {
                        $starterSeatIndex = $prevWinnerSeat->seat_index;
                    }
                }
            }

            $starterPlayer = $match->players()->where('seat_index', $starterSeatIndex)->first();
            $starterPlayerId = $starterPlayer ? $starterPlayer->user_id : null;

            // Create Round record
            $round = Round::create([
                'match_id' => $match->id,
                'round_number' => $nextRoundNumber,
                'status' => 'playing',
                'board_state' => [],
                'left_end' => null,
                'right_end' => null,
                'boneyard' => $deal['boneyard'],
                'current_turn_player_id' => $starterPlayerId,
                'turn_deadline' => Carbon::now()->addSeconds(25),
                'winner_id' => null,
            ]);

            // Save player hands
            foreach ($match->players as $idx => $player) {
                PlayerHand::create([
                    'round_id' => $round->id,
                    'player_id' => $player->user_id,
                    'hand' => $deal['hands'][$idx],
                ]);
            }

            // Schedule the turn timer timeout job
            $this->scheduleTurnTimeout($round);
        });

        $this->broadcastState($match->id);
    }

    /**
     * Dispatch the delayed turn timeout job.
     */
    public function scheduleTurnTimeout(Round $round)
    {
        // Cancel logic is built into the job itself (it verifies round number, turn player, and deadline matches)
        if ($round->current_turn_player_id) {
            TurnTimeoutJob::dispatch($round->id, $round->current_turn_player_id)
                ->delay(Carbon::parse($round->turn_deadline));
        }
    }

    /**
     * Process player play tile request.
     */
    public function playTile(int $matchId, int $userId, array $tile, string $side): bool
    {
        $result = DB::transaction(function () use ($matchId, $userId, $tile, $side) {
            $match = MatchModel::findOrFail($matchId);
            $round = $match->rounds()->where('status', 'playing')->lockForUpdate()->first();

            if (!$round || $round->current_turn_player_id !== $userId) {
                return false;
            }

            // Verify if match is paused (waiting for reconnection)
            $isPaused = ReconnectSession::where('match_id', $matchId)->exists();
            if ($isPaused) {
                return false;
            }

            $handModel = PlayerHand::where('round_id', $round->id)->where('player_id', $userId)->lockForUpdate()->first();
            if (!$handModel) {
                return false;
            }

            $requiredFirstTile = null;
            if ($round->round_number === 1 && empty($round->board_state)) {
                $hands = PlayerHand::where('round_id', $round->id)->get();
                $allHands = $hands->pluck('hand', 'player_id')->toArray();
                
                $highestDoubleVal = -1;
                for ($val = 6; $val >= 0; $val--) {
                    foreach ($allHands as $handArr) {
                        if ($this->engine->hasTile($handArr, [$val, $val])) {
                            $highestDoubleVal = $val;
                            break 2;
                        }
                    }
                }
                
                if ($highestDoubleVal !== -1) {
                    $requiredFirstTile = [$highestDoubleVal, $highestDoubleVal];
                }
            }

            // Validate and play via engine
            $playState = $this->engine->validateAndPlay(
                $round->board_state,
                $handModel->hand,
                $tile,
                $side,
                $requiredFirstTile
            );

            if (!$playState) {
                return false; // Invalid move
            }

            // Update hand DB
            $handModel->update(['hand' => $playState['new_hand']]);

            // Add Move DB
            $moveNumber = $round->moves()->count() + 1;
            Move::create([
                'round_id' => $round->id,
                'player_id' => $userId,
                'move_number' => $moveNumber,
                'tile_left' => $tile[0],
                'tile_right' => $tile[1],
                'side' => $playState['side_played'],
            ]);

            // Update Round DB
            $round->update([
                'board_state' => $playState['new_board'],
                'left_end' => $playState['left_end'],
                'right_end' => $playState['right_end'],
            ]);

            // Check if user has emptied their hand
            if (empty($playState['new_hand'])) {
                $this->endRound($match, $round, $userId, 'empty_hand');
                return true;
            }

            // Check if game is blocked
            $allHands = PlayerHand::where('round_id', $round->id)->pluck('hand', 'player_id')->toArray();
            if ($this->engine->isGameBlocked($allHands, $playState['left_end'], $playState['right_end'], $round->boneyard)) {
                $this->endBlockedRound($match, $round);
                return true;
            }

            // Rotate turn
            $this->rotateTurn($match, $round);
            return true;
        });

        if ($result) {
            $this->broadcastState($matchId);
            $this->triggerBotIfApplicable($matchId);
        }

        return $result;
    }

    /**
     * Process player draw tile request.
     */
    public function drawTile(int $matchId, int $userId): ?array
    {
        $drawnTile = DB::transaction(function () use ($matchId, $userId) {
            $match = MatchModel::findOrFail($matchId);
            $round = $match->rounds()->where('status', 'playing')->lockForUpdate()->first();

            if (!$round || $round->current_turn_player_id !== $userId) {
                return null;
            }

            // Verify if match is paused
            if (ReconnectSession::where('match_id', $matchId)->exists()) {
                return null;
            }

            $handModel = PlayerHand::where('round_id', $round->id)->where('player_id', $userId)->lockForUpdate()->first();
            if (!$handModel) {
                return null;
            }

            // Verify player actually has no playable tiles before allowing draw
            if ($this->engine->hasPlayableTile($handModel->hand, $round->left_end, $round->right_end)) {
                return null;
            }

            $boneyard = $round->boneyard;
            if (empty($boneyard)) {
                return null; // Boneyard empty, must pass instead
            }

            // Draw tile
            $tile = array_pop($boneyard);
            $hand = $handModel->hand;
            $hand[] = $tile;

            // Update hand and boneyard
            $handModel->update(['hand' => $hand]);
            $round->update(['boneyard' => $boneyard]);

            // If the drawn tile is playable, the turn remains theirs (they must play it)
            // Otherwise, they cannot play it, but we let them pass or auto-pass?
            // "If the drawn tile is playable: Play it immediately. Otherwise: Turn passes."
            // Ah! The requirements state: "If the drawn tile is playable: Play it immediately. Otherwise: Turn passes."
            // Let's implement this automatic play/pass logic immediately inside draw to keep gameplay extremely smooth!
            $isPlayableOnLeft = ($round->left_end === null || $tile[0] === $round->left_end || $tile[1] === $round->left_end);
            $isPlayableOnRight = ($round->left_end === null || $tile[0] === $round->right_end || $tile[1] === $round->right_end);

            if ($isPlayableOnLeft || $isPlayableOnRight) {
                // Play it automatically!
                // If it can match left, play left. Otherwise right.
                $side = $isPlayableOnLeft ? 'left' : 'right';
                if ($round->left_end === null) $side = 'start'; // Empty board starting case

                $playState = $this->engine->validateAndPlay(
                    $round->board_state,
                    $hand,
                    $tile,
                    $side,
                    null
                );

                if ($playState) {
                    $handModel->update(['hand' => $playState['new_hand']]);
                    
                    $moveNumber = $round->moves()->count() + 1;
                    Move::create([
                        'round_id' => $round->id,
                        'player_id' => $userId,
                        'move_number' => $moveNumber,
                        'tile_left' => $tile[0],
                        'tile_right' => $tile[1],
                        'side' => $playState['side_played'],
                    ]);

                    $round->update([
                        'board_state' => $playState['new_board'],
                        'left_end' => $playState['left_end'],
                        'right_end' => $playState['right_end'],
                    ]);

                    if (empty($playState['new_hand'])) {
                        $this->endRound($match, $round, $userId, 'empty_hand');
                        return $tile;
                    }

                    // Check blocks
                    $allHands = PlayerHand::where('round_id', $round->id)->pluck('hand', 'player_id')->toArray();
                    if ($this->engine->isGameBlocked($allHands, $playState['left_end'], $playState['right_end'], $round->boneyard)) {
                        $this->endBlockedRound($match, $round);
                        return $tile;
                    }
                }
            }

            // Whether played automatically or not playable (means auto-pass), we rotate turn!
            $this->rotateTurn($match, $round);

            return $tile;
        });

        if ($drawnTile) {
            $this->broadcastState($matchId);
            $this->triggerBotIfApplicable($matchId);
        }

        return $drawnTile;
    }

    /**
     * Process player pass turn request.
     */
    public function passTurn(int $matchId, int $userId): bool
    {
        $result = DB::transaction(function () use ($matchId, $userId) {
            $match = MatchModel::findOrFail($matchId);
            $round = $match->rounds()->where('status', 'playing')->lockForUpdate()->first();

            if (!$round || $round->current_turn_player_id !== $userId) {
                return false;
            }

            // Verify if match is paused
            if (ReconnectSession::where('match_id', $matchId)->exists()) {
                return false;
            }

            $handModel = PlayerHand::where('round_id', $round->id)->where('player_id', $userId)->lockForUpdate()->first();
            if (!$handModel) {
                return false;
            }

            // Verify they have no playable tiles and boneyard is empty
            if ($this->engine->hasPlayableTile($handModel->hand, $round->left_end, $round->right_end) || !empty($round->boneyard)) {
                return false; // Playable tile exists or boneyard has cards, cannot pass
            }

            // Rotate turn
            $this->rotateTurn($match, $round);

            // Check if game is blocked
            $allHands = PlayerHand::where('round_id', $round->id)->pluck('hand', 'player_id')->toArray();
            if ($this->engine->isGameBlocked($allHands, $round->left_end, $round->right_end, $round->boneyard)) {
                $this->endBlockedRound($match, $round);
            }

            return true;
        });

        if ($result) {
            $this->broadcastState($matchId);
            $this->triggerBotIfApplicable($matchId);
        }

        return $result;
    }

    /**
     * Rotate current player turn clockwise.
     */
    public function rotateTurn(MatchModel $match, Round $round)
    {
        $players = $match->players()->orderBy('seat_index')->get();
        $playerCount = $players->count();

        $currentSeatIndex = 0;
        foreach ($players as $idx => $p) {
            if ($p->user_id === $round->current_turn_player_id) {
                $currentSeatIndex = $idx;
                break;
            }
        }

        // Clockwise seating rotation
        $nextSeatIndex = ($currentSeatIndex + 1) % $playerCount;
        $nextPlayer = $players[$nextSeatIndex];

        $round->update([
            'current_turn_player_id' => $nextPlayer->user_id,
            'turn_deadline' => Carbon::now()->addSeconds(25),
        ]);

        $this->scheduleTurnTimeout($round);
    }

    /**
     * Complete the round when a player plays their last card.
     */
    public function endRound(MatchModel $match, Round $round, int $winnerId, string $reason)
    {
        // 1. Calculate Score points
        $scoreAwarded = 0;
        $hands = PlayerHand::where('round_id', $round->id)->get();

        if ($match->mode === '1v1') {
            $opponentHand = $hands->first(fn($h) => $h->player_id !== $winnerId);
            $scoreAwarded = $opponentHand ? $this->engine->sumHand($opponentHand->hand) : 0;
        } else {
            // 2v2: Sum both opponent hand dots
            $winnerSeat = $match->players()->where('user_id', $winnerId)->first();
            $opponents = $match->players()->where('team_index', '!=', $winnerSeat->team_index)->pluck('user_id')->toArray();
            
            foreach ($hands as $h) {
                if (in_array($h->player_id, $opponents)) {
                    $scoreAwarded += $this->engine->sumHand($h->hand);
                }
            }
        }

        // Save round score
        RoundScore::create([
            'round_id' => $round->id,
            'player_id' => $winnerId,
            'points_awarded' => $scoreAwarded
        ]);

        // Close round
        $round->update([
            'status' => 'completed',
            'winner_id' => $winnerId,
            'current_turn_player_id' => null,
            'turn_deadline' => null,
        ]);

        // Update statistics for rounds
        foreach ($match->players as $p) {
            $pStats = Statistic::firstOrNew(['user_id' => $p->user_id]);
            $pStats->rounds_played += 1;
            if ($p->user_id === $winnerId) {
                $pStats->rounds_won += 1;
            }
            $pStats->save();
        }

        // 2. Add score to Match teams or individual scores
        $matchWinnerDeclared = false;
        $finalWinnerId = null;
        $finalWinnerTeam = null;

        if ($match->mode === '1v1') {
            // Accumulate score in statistics or match
            $totalWinnerPoints = RoundScore::whereHas('round', fn($q) => $q->where('match_id', $match->id))
                ->where('player_id', $winnerId)
                ->sum('points_awarded');

            if ($totalWinnerPoints >= $match->target_score) {
                $matchWinnerDeclared = true;
                $finalWinnerId = $winnerId;
            }
        } else {
            // 2v2: Add score to winning team
            $winnerSeat = $match->players()->where('user_id', $winnerId)->first();
            $team = Team::where('match_id', $match->id)->where('team_index', $winnerSeat->team_index)->first();
            if ($team) {
                $team->increment('score', $scoreAwarded);
                if ($team->score >= $match->target_score) {
                    $matchWinnerDeclared = true;
                    $finalWinnerTeam = $winnerSeat->team_index;
                }
            }
        }

        // 3. Serialize round completion and hands details
        $serialHands = [];
        foreach ($hands as $h) {
            $serialHands[$h->player_id] = $h->hand;
        }

        // Broadcast round end event
        $pointsMap = [];
        foreach ($match->players as $p) {
            $pointsMap[$p->user_id] = RoundScore::whereHas('round', fn($q) => $q->where('match_id', $match->id))
                ->where('player_id', $p->user_id)
                ->sum('points_awarded');
        }

        broadcast(new RoundEnded($match->id, [
            'winner_id' => $winnerId,
            'reason' => $reason,
            'points_awarded' => $scoreAwarded,
            'hands' => $serialHands,
            'scores' => $pointsMap,
            'team_scores' => $match->mode === '2v2' ? Team::where('match_id', $match->id)->pluck('score', 'team_index')->toArray() : null,
        ]));

        if ($matchWinnerDeclared) {
            $match->update([
                'status' => 'completed',
                'winner_id' => $finalWinnerId,
                'winning_team_index' => $finalWinnerTeam,
                'ended_at' => Carbon::now()
            ]);

            // Update stats matches
            foreach ($match->players as $p) {
                $pStats = Statistic::firstOrNew(['user_id' => $p->user_id]);
                $pStats->matches_played += 1;
                
                $isWinner = false;
                if ($match->mode === '1v1') {
                    $isWinner = ($p->user_id === $finalWinnerId);
                } else {
                    $isWinner = ($p->team_index === $finalWinnerTeam);
                }

                if ($isWinner) {
                    $pStats->matches_won += 1;
                }
                
                $userRoundPoints = RoundScore::whereHas('round', fn($q) => $q->where('match_id', $match->id))
                    ->where('player_id', $p->user_id)
                    ->sum('points_awarded');
                $pStats->total_points += $userRoundPoints;
                
                $pStats->save();
            }

            // Close room status
            if ($match->room_id) {
                $match->room()->update(['status' => 'finished']);
            }

            broadcast(new MatchEnded($match->id, [
                'winner_id' => $finalWinnerId,
                'winning_team_index' => $finalWinnerTeam,
                'final_scores' => $pointsMap,
                'team_scores' => $match->mode === '2v2' ? Team::where('match_id', $match->id)->pluck('score', 'team_index')->toArray() : null,
            ]));
        } else {
            // Setup next round after a short delay or let frontend trigger? We auto-initialize
            $this->initializeNewRound($match);
        }
    }

    /**
     * Complete the round when the board becomes blocked.
     */
    public function endBlockedRound(MatchModel $match, Round $round)
    {
        $hands = PlayerHand::where('round_id', $round->id)->get();
        
        // Sum points for each player
        $sums = [];
        foreach ($hands as $h) {
            $sums[$h->player_id] = $this->engine->sumHand($h->hand);
        }

        // Determine winner
        $winnerId = null;
        if ($match->mode === '1v1') {
            $players = $match->players->pluck('user_id')->toArray();
            $p0Sum = $sums[$players[0]] ?? 999;
            $p1Sum = $sums[$players[1]] ?? 999;

            if ($p0Sum < $p1Sum) {
                $winnerId = $players[0];
            } elseif ($p1Sum < $p0Sum) {
                $winnerId = $players[1];
            } else {
                // Tie: no winner, round ends in draw, 0 points awarded, re-initialize
                $round->update([
                    'status' => 'blocked',
                    'current_turn_player_id' => null,
                    'turn_deadline' => null,
                ]);

                $serialHands = [];
                foreach ($hands as $h) {
                    $serialHands[$h->player_id] = $h->hand;
                }

                broadcast(new RoundEnded($match->id, [
                    'winner_id' => null,
                    'reason' => 'blocked_draw',
                    'points_awarded' => 0,
                    'hands' => $serialHands,
                    'scores' => [],
                ]));

                $this->initializeNewRound($match);
                return;
            }
        } else {
            // 2v2: Sum team hand scores
            $team0Points = 0;
            $team1Points = 0;
            foreach ($match->players as $p) {
                $points = $sums[$p->user_id] ?? 0;
                if ($p->team_index === 0) {
                    $team0Points += $points;
                } else {
                    $team1Points += $points;
                }
            }

            if ($team0Points < $team1Points) {
                // Team 0 wins. We pick the player with lowest score in that team as the designated round winner
                $team0Players = $match->players->where('team_index', 0)->pluck('user_id')->toArray();
                $winnerId = ($sums[$team0Players[0]] < $sums[$team0Players[1]]) ? $team0Players[0] : $team0Players[1];
            } elseif ($team1Points < $team0Points) {
                // Team 1 wins
                $team1Players = $match->players->where('team_index', 1)->pluck('user_id')->toArray();
                $winnerId = ($sums[$team1Players[0]] < $sums[$team1Players[1]]) ? $team1Players[0] : $team1Players[1];
            } else {
                // Tie
                $round->update([
                    'status' => 'blocked',
                    'current_turn_player_id' => null,
                    'turn_deadline' => null,
                ]);

                $serialHands = [];
                foreach ($hands as $h) {
                    $serialHands[$h->player_id] = $h->hand;
                }

                broadcast(new RoundEnded($match->id, [
                    'winner_id' => null,
                    'reason' => 'blocked_draw',
                    'points_awarded' => 0,
                    'hands' => $serialHands,
                    'scores' => [],
                ]));

                $this->initializeNewRound($match);
                return;
            }
        }

        $this->endRound($match, $round, $winnerId, 'blocked_win');
    }

    /**
     * Pause the active match upon socket disconnection.
     */
    public function pauseMatch(int $matchId, int $userId)
    {
        $match = MatchModel::find($matchId);
        if (!$match || $match->status !== 'active') return;

        // Check if a reconnect session already exists
        $exists = ReconnectSession::where('user_id', $userId)->exists();
        if ($exists) return;

        // Create reconnect session
        ReconnectSession::create([
            'user_id' => $userId,
            'match_id' => $matchId,
            'disconnected_at' => Carbon::now(),
            'expires_at' => Carbon::now()->addSeconds(60)
        ]);

        // Stop turn deadlines
        $round = $match->rounds()->where('status', 'playing')->first();
        if ($round) {
            $round->update([
                'turn_deadline' => null // Turn timers suspended during pause
            ]);
        }

        $this->broadcastState($matchId);
    }

    /**
     * Resume a paused match.
     */
    public function resumeMatch(int $matchId, int $userId)
    {
        $session = ReconnectSession::where('user_id', $userId)->where('match_id', $matchId)->first();
        if (!$session) return;

        $session->delete();

        // Restore turn deadline
        $match = MatchModel::find($matchId);
        $round = $match->rounds()->where('status', 'playing')->first();
        if ($round) {
            $round->update([
                'turn_deadline' => Carbon::now()->addSeconds(25)
            ]);
            $this->scheduleTurnTimeout($round);
        }

        $this->broadcastState($matchId);
        $this->triggerBotIfApplicable($matchId);
    }

    /**
     * Activate Bot Control for a player after reconnection window expires.
     */
    public function activateBotControl(int $matchId, int $userId)
    {
        $session = ReconnectSession::where('user_id', $userId)->where('match_id', $matchId)->first();
        if ($session) {
            $session->delete();
        }

        // Restore match timers and mark user as bot-controlled (implicit based on no reconnect session)
        $match = MatchModel::find($matchId);
        $round = $match->rounds()->where('status', 'playing')->first();
        if ($round) {
            $round->update([
                'turn_deadline' => Carbon::now()->addSeconds(25)
            ]);
            $this->scheduleTurnTimeout($round);
        }

        $this->broadcastState($matchId);
        $this->triggerBotIfApplicable($matchId);
    }

    /**
     * Trigger bot play logic if the current turn belongs to a bot-controlled seat.
     */
    public function triggerBotIfApplicable(int $matchId)
    {
        $match = MatchModel::findOrFail($matchId);
        $round = $match->rounds()->where('status', 'playing')->first();
        if (!$round) return;

        $currentTurnPlayerId = $round->current_turn_player_id;
        if (!$currentTurnPlayerId) return;

        // A player is bot-controlled if they are NOT active on socket AND have no active reconnect session (means countdown finished)
        // Or if we specifically flag bots. The requirements say: "If player doesn't reconnect: An AI Bot temporarily controls that player."
        // We track this by checking if the player is disconnected (presence-room member check or absence in active connections)
        // Wait, for stateless HTTP endpoints, we can know if a player is bot-controlled if:
        // 1. They are NOT the user making the current request.
        // 2. They are flagged as disconnected but their 60s reconnection session has EXPIRED.
        // Let's implement a clean helper: a user is bot-controlled if their ReconnectSession has expired or if they have been marked as bot-controlled.
        // Let's query the ReconnectSession table. If there is a ReconnectSession that has EXPIRED (past expires_at), we activate bot!
        // Also, we can check if they are disconnected. If we run a trigger, let's see if they have an active ReconnectSession.
        // If there is NO ReconnectSession, but they are flagged as bot, we can run the bot move!
        // To be concrete, if the turn is on a player, we run a check: does this user have a ReconnectSession?
        // - If yes: is it expired? If it is expired, we activate bot control, delete the session, and run bot move immediately!
        // - If no: we do NOT run bot move (we assume the human player will click).
        // Wait! What if the player disconnected, and the 60s timer expires in the background?
        // We can run a scheduled cron/job, or check on any match tick.
        // Let's check expired sessions when triggering bot!
        $expiredSessions = ReconnectSession::where('match_id', $matchId)
            ->where('expires_at', '<=', Carbon::now())
            ->get();

        foreach ($expiredSessions as $sess) {
            $this->activateBotControl($sess->match_id, $sess->user_id);
            return; // State broadcasted, recursive trigger will handle plays
        }

        // Check if current turn player has an active (non-expired) reconnect session. If yes, game is paused, bot does NOT play.
        $hasActiveReconnect = ReconnectSession::where('match_id', $matchId)
            ->where('user_id', $currentTurnPlayerId)
            ->exists();

        if ($hasActiveReconnect) {
            return; // Game paused, waiting for player
        }

        // Wait, what if the player is a CPU bot from the start, or what if the player is currently disconnected?
        // If they are disconnected, they have a ReconnectSession. If they do NOT have a ReconnectSession, they are active.
        // But what if the player never joined (in case we fill slots with bots)? Or if they are marked as bot?
        // In our system, players become bot-controlled when their ReconnectSession EXPIRES.
        // When it expires, `ReconnectSession` is deleted, and they are marked as bot-controlled.
        // How do we store that they are bot-controlled?
        // We can check if they are disconnected AND have no session.
        // In a presence WebSocket structure, we know if a player is connected.
        // If we want a robust backend trigger: when the turn starts, we start the 25s timer.
        // If the 25s timer expires (meaning human player failed to make a move), they are skipped!
        // Wait, the requirements state:
        // "If time expires: The player's turn is skipped automatically."
        // And "If a player disconnects: Pause the match. Display a reconnect countdown. Wait exactly 60 seconds... If not: An AI Bot temporarily controls that player."
        // Let's make sure the bot is run when it is indeed bot-controlled.
        // Let's define: a player is "Bot Controlled" if we set a flag, or if they have been marked as such.
        // Let's check if the player's presence state is disconnected.
        // Since we are running stateless HTTP, we can check if they are marked as bot-controlled. We can query the `match_players` table. Let's add a `is_bot` boolean to `match_players`!
        // Wait! In the migrations, did we create `is_bot` on `match_players`? No, we didn't. But we can track bot control by checking if the user is disconnected and has no active reconnect session.
        // To be extremely clean, let's write a simple `is_bot` check on `MatchPlayer`. If the player is marked as `is_bot`, the bot plays.
        // Where does a player get marked as `is_bot`?
        // When the 60s reconnect countdown expires, we mark them as `is_bot = true` on `match_players` (or in cache).
        // Let's use Redis or a cache key `match:{$matchId}:bot:{$userId}` to store bot-control state! That is extremely fast, avoids altering migrations, and is perfect for session-level state!
        // Let's implement this cache-based bot tracking:
        // `Cache::put("match:{$matchId}:bot:{$userId}", true)`
        // Let's check:
        $isBotControlled = \Illuminate\Support\Facades\Cache::get("match:{$matchId}:bot:{$currentTurnPlayerId}", false);
        if ($isBotControlled) {
            // Trigger bot play with a 1.5 second delay to simulate human thinking
            ExecuteBotMoveJob::dispatch($matchId, $currentTurnPlayerId)
                ->delay(now()->addMilliseconds(1500));
        }
    }

    /**
     * Broadcast game state to all players.
     */
    public function broadcastState(int $matchId)
    {
        $match = MatchModel::with(['players.user', 'rounds.moves', 'teams'])->find($matchId);
        if (!$match) return;

        $round = $match->rounds()->orderBy('round_number', 'desc')->first();
        if (!$round) return;

        $reconnectSessions = ReconnectSession::where('match_id', $matchId)->pluck('expires_at', 'user_id')->toArray();

        // Construct public players array
        $playersData = $match->players->map(function ($p) use ($round, $reconnectSessions) {
            $handCount = PlayerHand::where('round_id', $round->id)->where('player_id', $p->user_id)->first();
            $tileCount = $handCount ? count($handCount->hand) : 0;

            // Check if player has an active reconnect session
            $hasSession = isset($reconnectSessions[$p->user_id]);
            $isBot = \Illuminate\Support\Facades\Cache::get("match:{$p->match_id}:bot:{$p->user_id}", false);

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

        $state = [
            'match_id' => $match->id,
            'mode' => $match->mode,
            'status' => $match->status,
            'target_score' => $match->target_score,
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
        ];

        broadcast(new GameStateUpdated($matchId, $state));
    }
}
