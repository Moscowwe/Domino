<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerHand extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'round_id',
        'player_id',
        'hand',
    ];

    protected $casts = [
        'hand' => 'array', // Array cast for tile structures: [[0,0], [1,2]]
    ];

    /**
     * Get the round context.
     */
    public function round()
    {
        return $this->belongsTo(Round::class, 'round_id');
    }

    /**
     * Get the player's user profile.
     */
    public function player()
    {
        return $this->belongsTo(User::class, 'player_id');
    }
}
