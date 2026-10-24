<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Move extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'round_id',
        'player_id',
        'move_number',
        'tile_left',
        'tile_right',
        'side',
        'played_at',
    ];

    protected $casts = [
        'move_number' => 'integer',
        'tile_left' => 'integer',
        'tile_right' => 'integer',
        'played_at' => 'datetime',
    ];

    /**
     * Get the round context.
     */
    public function round()
    {
        return $this->belongsTo(Round::class, 'round_id');
    }

    /**
     * Get the player who executed the move.
     */
    public function player()
    {
        return $this->belongsTo(User::class, 'player_id');
    }
}
