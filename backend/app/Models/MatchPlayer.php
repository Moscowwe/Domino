<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\MatchModel;

class MatchPlayer extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'match_id',
        'user_id',
        'team_index',
        'seat_index',
    ];

    protected $casts = [
        'team_index' => 'integer',
        'seat_index' => 'integer',
    ];

    /**
     * Get the match mapping.
     */
    public function match()
    {
        return $this->belongsTo(MatchModel::class, 'match_id');
    }

    /**
     * Get the player's user profile.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
