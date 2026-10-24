<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\MatchModel;

class ReconnectSession extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'match_id',
        'disconnected_at',
        'expires_at',
    ];

    protected $casts = [
        'disconnected_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    /**
     * Get the user context.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Get the match context.
     */
    public function match()
    {
        return $this->belongsTo(MatchModel::class, 'match_id');
    }
}
