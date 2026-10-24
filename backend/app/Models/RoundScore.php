<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoundScore extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'round_id',
        'player_id',
        'points_awarded',
    ];

    protected $casts = [
        'points_awarded' => 'integer',
    ];

    /**
     * Get the round mapping.
     */
    public function round()
    {
        return $this->belongsTo(Round::class, 'round_id');
    }

    /**
     * Get the player who won the points.
     */
    public function player()
    {
        return $this->belongsTo(User::class, 'player_id');
    }
}
