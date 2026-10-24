<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'room_id',
        'user_id',
        'message',
        'type',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    /**
     * Get the room mapping.
     */
    public function room()
    {
        return $this->belongsTo(Room::class, 'room_id');
    }

    /**
     * Get the user who sent the message (null for system notices).
     */
    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
