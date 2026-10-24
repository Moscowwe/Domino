<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Statistic extends Model
{
    public $timestamps = false;

    protected $primaryKey = 'user_id';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'matches_played',
        'matches_won',
        'rounds_played',
        'rounds_won',
        'total_points',
        'updated_at',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'matches_played' => 'integer',
        'matches_won' => 'integer',
        'rounds_played' => 'integer',
        'rounds_won' => 'integer',
        'total_points' => 'integer',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the user association.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
