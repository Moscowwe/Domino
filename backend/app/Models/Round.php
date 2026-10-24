<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\MatchModel;

class Round extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'match_id',
        'round_number',
        'status',
        'board_state',
        'left_end',
        'right_end',
        'boneyard',
        'current_turn_player_id',
        'turn_deadline',
        'winner_id',
        'started_at',
    ];

    protected $casts = [
        'round_number' => 'integer',
        'board_state' => 'array',
        'left_end' => 'integer',
        'right_end' => 'integer',
        'boneyard' => 'array',
        'turn_deadline' => 'datetime',
        'started_at' => 'datetime',
    ];

    /**
     * Get the match configuration context.
     */
    public function match()
    {
        return $this->belongsTo(MatchModel::class, 'match_id');
    }

    /**
     * Get the user who has the active turn.
     */
    public function currentTurnPlayer()
    {
        return $this->belongsTo(User::class, 'current_turn_player_id');
    }

    /**
     * Get the round winner.
     */
    public function winner()
    {
        return $this->belongsTo(User::class, 'winner_id');
    }

    /**
     * Get player hands representing dealt tiles.
     */
    public function hands()
    {
        return $this->hasMany(PlayerHand::class, 'round_id');
    }

    /**
     * Get all moves executed in this round in chronological order.
     */
    public function moves()
    {
        return $this->hasMany(Move::class, 'round_id')->orderBy('move_number');
    }

    /**
     * Get the scores awarded in this round.
     */
    public function scores()
    {
        return $this->hasMany(RoundScore::class, 'round_id');
    }
}
