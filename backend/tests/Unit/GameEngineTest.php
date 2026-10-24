<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use App\Services\GameEngine;

class GameEngineTest extends TestCase
{
    private GameEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = new GameEngine();
    }

    /**
     * Test that a standard set has 28 dominoes.
     */
    public function test_domino_set_generation(): void
    {
        $set = $this->engine->generateSet();
        $this->assertCount(28, $set);
        
        // Check uniqueness
        $serialized = array_map(function($tile) {
            sort($tile);
            return implode('|', $tile);
        }, $set);
        $this->assertCount(28, array_unique($serialized));
    }

    /**
     * Test shuffling and dealing for 1v1 (2 players) and 2v2 (4 players).
     */
    public function test_dealing_mechanics(): void
    {
        // 1. 2-player deal
        $deal2 = $this->engine->deal(2);
        $this->assertCount(2, $deal2['hands']);
        $this->assertCount(7, $deal2['hands'][0]);
        $this->assertCount(7, $deal2['hands'][1]);
        $this->assertCount(14, $deal2['boneyard']);

        // 2. 4-player deal
        $deal4 = $this->engine->deal(4);
        $this->assertCount(4, $deal4['hands']);
        $this->assertCount(7, $deal4['hands'][0]);
        $this->assertCount(7, $deal4['hands'][1]);
        $this->assertCount(7, $deal4['hands'][2]);
        $this->assertCount(7, $deal4['hands'][3]);
        $this->assertEmpty($deal4['boneyard']);
    }

    /**
     * Test starting player determination based on double possession.
     */
    public function test_starter_determination(): void
    {
        // Player 1 holds [0,0], should start
        $hands1 = [
            0 => [[1, 2], [3, 4], [5, 6]],
            1 => [[0, 0], [1, 1], [2, 2]]
        ];
        $this->assertEquals(1, $this->engine->determineStarter($hands1));

        // No [0,0] held, Player 0 holds [1,1] (next lowest double), should start
        $hands2 = [
            0 => [[1, 1], [3, 4], [5, 6]],
            1 => [[2, 2], [3, 3], [4, 4]]
        ];
        $this->assertEquals(0, $this->engine->determineStarter($hands2));

        // No doubles at all, should select user holding tile of lowest sum
        $hands3 = [
            0 => [[3, 4], [5, 6]], // sums: 7, 11
            1 => [[1, 2], [4, 5]]  // sums: 3, 9
        ];
        $this->assertEquals(1, $this->engine->determineStarter($hands3));
    }

    /**
     * Test valid play moves, rotation, and ends matching.
     */
    public function test_move_validation_and_board_expansion(): void
    {
        $hand = [[0, 0], [1, 2], [2, 5]];
        $board = [];

        // 1. Play first tile (starts with [0,0] on empty board)
        $result = $this->engine->validateAndPlay($board, $hand, [0, 0], 'start', true);
        $this->assertNotNull($result);
        $this->assertEquals([[0, 0]], $result['new_board']);
        $this->assertCount(2, $result['new_hand']);
        $this->assertEquals(0, $result['left_end']);
        $this->assertEquals(0, $result['right_end']);

        // Update state
        $board = $result['new_board'];
        $hand = $result['new_hand']; // Hand now has: [1,2], [2,5]

        // 2. Try an invalid play on the left end (0) with [2,5] (doesn't contain 0)
        $invalidResult = $this->engine->validateAndPlay($board, $hand, [2, 5], 'left');
        $this->assertNull($invalidResult);

        // 3. Play [1,2] on left end - should fail because it doesn't match 0
        $invalidResult2 = $this->engine->validateAndPlay($board, $hand, [1, 2], 'left');
        $this->assertNull($invalidResult2);

        // Suppose board is actually [[0,2]] (left=0, right=2)
        $board = [[0, 2]];
        
        // Play [1,2] on the RIGHT end (2)
        $result = $this->engine->validateAndPlay($board, $hand, [1, 2], 'right');
        $this->assertNotNull($result);
        $this->assertEquals([[0, 2], [2, 1]], $result['new_board']); // Rotated so 2 matches 2, leaving 1 on right
        $this->assertEquals(0, $result['left_end']);
        $this->assertEquals(1, $result['right_end']);
    }

    /**
     * Test blocked game evaluation.
     */
    public function test_game_blocking(): void
    {
        $leftEnd = 4;
        $rightEnd = 3;
        $boneyard = [];

        // Nobody can play because nobody has 3 or 4
        $handsBlocked = [
            0 => [[1, 2], [5, 6]],
            1 => [[0, 0], [1, 1]]
        ];
        
        $this->assertTrue($this->engine->isGameBlocked($handsBlocked, $leftEnd, $rightEnd, $boneyard));

        // Player 0 can play because they have a 3
        $handsPlayable = [
            0 => [[3, 6], [5, 6]],
            1 => [[0, 0], [1, 1]]
        ];
        $this->assertFalse($this->engine->isGameBlocked($handsPlayable, $leftEnd, $rightEnd, $boneyard));

        // Boneyard not empty, so not blocked
        $this->assertFalse($this->engine->isGameBlocked($handsBlocked, $leftEnd, $rightEnd, [[3, 5]]));
    }
}
