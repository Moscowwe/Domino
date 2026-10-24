<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\MatchModel;

class Room extends Model
{
    protected $fillable = [
        'code',
        'host_id',
        'name',
        'players_count',
        'target_score',
        'is_private',
        'status',
    ];

    protected $casts = [
        'is_private' => 'boolean',
        'players_count' => 'integer',
        'target_score' => 'integer',
    ];

    /**
     * Get the host user who owns the room.
     */
    public function host()
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    /**
     * Get all players registered in the lobby seat slots.
     */
    public function players()
    {
        return $this->hasMany(RoomPlayer::class, 'room_id')->orderBy('slot_index');
    }

    /**
     * Get matches spawned from this room.
     */
    public function matches()
    {
        return $this->hasMany(MatchModel::class, 'room_id');
    }
}
