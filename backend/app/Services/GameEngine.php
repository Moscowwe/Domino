<?php

namespace App\Services;

class GameEngine
{
    /**
     * Generate a full Double-Six Domino Set (28 unique tiles).
     *
     * @return array
     */
    public function generateSet(): array
    {
        $tiles = [];
        for ($i = 0; $i <= 6; $i++) {
            for ($j = $i; $j <= 6; $j++) {
                $tiles[] = [$i, $j];
            }
        }
        return $tiles;
    }

    public function secureShuffle(array &$array): void
    {
        $count = count($array);
        for ($i = $count - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            $temp = $array[$i];
            $array[$i] = $array[$j];
            $array[$j] = $temp;
        }
    }

    /**
     * Shuffle and deal tiles to players.
     *
     * @param int $playersCount (2 or 4)
     * @return array ['hands' => [seat_index => [[A,B], ...]], 'boneyard' => [[X,Y], ...]]
     */
    public function deal(int $playersCount): array
    {
        $tiles = $this->generateSet();
        $this->secureShuffle($tiles);

        $hands = [];
        for ($i = 0; $i < $playersCount; $i++) {
            $hands[$i] = array_slice($tiles, $i * 7, 7);
        }

        $boneyard = [];
        if ($playersCount === 2) {
            $boneyard = array_slice($tiles, 14);
        }

        return [
            'hands' => $hands,
            'boneyard' => $boneyard
        ];
    }

    /**
     * Find which seat index holds the [0,0] tile to start the first round.
     * If no one holds [0,0] (only possible in 1v1), look for next lowest double:
     * [1,1], [2,2]... up to [6,6]. If no player holds any double, look for the
     * tile with lowest dot sum.
     *
     * @param array $hands Keyed by seat index
     * @return int Seat index of the starting player
     */
    public function determineStarter(array $hands): int
    {
        // 1. Search doubles from 6 down to 0
        for ($doubleVal = 6; $doubleVal >= 0; $doubleVal--) {
            foreach ($hands as $seatIndex => $hand) {
                if ($this->hasTile($hand, [$doubleVal, $doubleVal])) {
                    return $seatIndex;
                }
            }
        }

        // 2. Fallback: Search highest sum tile
        $maxSum = -1;
        $starterSeat = 0;
        foreach ($hands as $seatIndex => $hand) {
            foreach ($hand as $tile) {
                $sum = $tile[0] + $tile[1];
                if ($sum > $maxSum) {
                    $maxSum = $sum;
                    $starterSeat = $seatIndex;
                }
            }
        }

        return $starterSeat;
    }

    /**
     * Check if a hand contains a specific tile (order-independent).
     */
    public function hasTile(array $hand, array $tile): bool
    {
        foreach ($hand as $t) {
            if ($this->tilesEqual($t, $tile)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Compare two tiles (order-independent).
     */
    public function tilesEqual(array $t1, array $t2): bool
    {
        return ($t1[0] == $t2[0] && $t1[1] == $t2[1]) || ($t1[0] == $t2[1] && $t1[1] == $t2[0]);
    }

    /**
     * Check if the player has any playable tile.
     *
     * @param array $hand
     * @param int|null $leftEnd
     * @param int|null $rightEnd
     * @return bool
     */
    public function hasPlayableTile(array $hand, ?int $leftEnd, ?int $rightEnd): bool
    {
        // If board is empty, any tile in hand is playable
        if ($leftEnd === null || $rightEnd === null) {
            return true;
        }

        foreach ($hand as $tile) {
            if ($tile[0] === $leftEnd || $tile[1] === $leftEnd || $tile[0] === $rightEnd || $tile[1] === $rightEnd) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate and apply a move to the board state.
     *
     * @param array $board Current board state array of tiles, e.g. [[1,2], [2,3]]
     * @param array $hand Current player hand
     * @param array $tile Tile to play, e.g. [3,4]
     * @param string $side 'left', 'right', or 'start'
     * @param array|null $requiredFirstTile If set, the played tile must exactly match this tile (for match start)
     * @return array|null Returns ['new_board' => array, 'new_hand' => array, 'left_end' => int, 'right_end' => int, 'side_played' => string] or null if invalid
     */
    public function validateAndPlay(array $board, array $hand, array $tile, string $side, ?array $requiredFirstTile = null): ?array
    {
        // 1. Verify tile possession
        if (!$this->hasTile($hand, $tile)) {
            return null;
        }

        // Standardize tile orientation: keep $tile[0] <= $tile[1] for identification, but we rotate upon placement
        $matchedTile = null;
        $handIndex = -1;
        foreach ($hand as $idx => $t) {
            if ($this->tilesEqual($t, $tile)) {
                $matchedTile = $t;
                $handIndex = $idx;
                break;
            }
        }

        if ($matchedTile === null) {
            return null;
        }

        // 2. Handle empty board (first move of the round)
        if (empty($board)) {
            // If it's the very first round/turn of the match, it must be the required highest double
            if ($requiredFirstTile !== null && !$this->tilesEqual($tile, $requiredFirstTile)) {
                return null;
            }

            // Remove from hand
            unset($hand[$handIndex]);
            $hand = array_values($hand);

            $placedTile = [$tile[0], $tile[1]]; // Starting tile orientation doesn't matter, typically kept standard
            return [
                'new_board' => [$placedTile],
                'new_hand' => $hand,
                'left_end' => $placedTile[0],
                'right_end' => $placedTile[1],
                'side_played' => 'start'
            ];
        }

        $leftEnd = $board[0][0];
        $rightEnd = $board[count($board) - 1][1];

        // 3. Play on LEFT
        if ($side === 'left') {
            if ($tile[0] === $leftEnd) {
                $placedTile = [$tile[1], $tile[0]]; // Rotate so outer end is $tile[1]
            } elseif ($tile[1] === $leftEnd) {
                $placedTile = [$tile[0], $tile[1]]; // Keep orientation so outer end is $tile[0]
            } else {
                return null; // Invalid match
            }

            // Remove from hand
            unset($hand[$handIndex]);
            $hand = array_values($hand);

            // Prepend to board
            array_unshift($board, $placedTile);

            return [
                'new_board' => $board,
                'new_hand' => $hand,
                'left_end' => $placedTile[0],
                'right_end' => $rightEnd,
                'side_played' => 'left'
            ];
        }

        // 4. Play on RIGHT
        if ($side === 'right') {
            if ($tile[0] === $rightEnd) {
                $placedTile = [$tile[0], $tile[1]]; // Keep orientation so outer end is $tile[1]
            } elseif ($tile[1] === $rightEnd) {
                $placedTile = [$tile[1], $tile[0]]; // Rotate so outer end is $tile[0]
            } else {
                return null; // Invalid match
            }

            // Remove from hand
            unset($hand[$handIndex]);
            $hand = array_values($hand);

            // Append to board
            $board[] = $placedTile;

            return [
                'new_board' => $board,
                'new_hand' => $hand,
                'left_end' => $leftEnd,
                'right_end' => $placedTile[1],
                'side_played' => 'right'
            ];
        }

        return null;
    }

    /**
     * Calculate total points (dots) in a hand.
     */
    public function sumHand(array $hand): int
    {
        $sum = 0;
        foreach ($hand as $tile) {
            $sum += $tile[0] + $tile[1];
        }
        return $sum;
    }

    /**
     * Check if the game is blocked (no player has a playable tile, and boneyard is empty).
     */
    public function isGameBlocked(array $hands, ?int $leftEnd, ?int $rightEnd, array $boneyard): bool
    {
        // If boneyard still has tiles, players can draw, so not blocked
        if (!empty($boneyard)) {
            return false;
        }

        // Check if ANY player can make a move
        foreach ($hands as $hand) {
            if ($this->hasPlayableTile($hand, $leftEnd, $rightEnd)) {
                return false;
            }
        }

        return true;
    }
}
