<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RoomPlayer extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'room_id',
        'user_id',
        'slot_index',
        'is_ready',
        'joined_at',
    ];

    protected $casts = [
        'is_ready' => 'boolean',
        'slot_index' => 'integer',
    ];

    /**
     * Get the room context.
     */
    public function room()
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    /**
     * Get the user profile model.
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
