<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MatchModel extends Model
{
    protected $table = 'matches';

    public $timestamps = false; // We use custom started_at and ended_at timestamps

    protected $fillable = [
        'room_id',
        'mode',
        'target_score',
        'status',
        'winner_id',
        'winning_team_index',
        'started_at',
        'ended_at',
    ];

    protected $casts = [
        'target_score' => 'integer',
        'winning_team_index' => 'integer',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    /**
     * Get the room context.
     */
    public function room()
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    /**
     * Get the winner user profile (for 1v1 matches).
     */
    public function winner()
    {
        return $this->belongsTo(User::class, 'winner_id');
    }

    /**
     * Get all active players mapped to their seats.
     */
    public function players()
    {
        return $this->hasMany(MatchPlayer::class, 'match_id')->orderBy('seat_index');
    }

    /**
     * Get the 2 teams in 2v2 modes.
     */
    public function teams()
    {
        return $this->hasMany(Team::class, 'match_id');
    }

    /**
     * Get all rounds played inside this match.
     */
    public function rounds()
    {
        return $this->hasMany(Round::class, 'match_id');
    }
}
