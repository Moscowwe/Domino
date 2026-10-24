<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\MatchModel;

class Team extends Model
{
    protected $fillable = [
        'match_id',
        'team_index',
        'score',
    ];

    protected $casts = [
        'team_index' => 'integer',
        'score' => 'integer',
    ];

    /**
     * Get the match mapping.
     */
    public function match()
    {
        return $this->belongsTo(MatchModel::class, 'match_id');
    }
}
