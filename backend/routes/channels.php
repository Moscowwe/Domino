<?php

use App\Models\MatchModel;
use App\Models\Room;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Presence channel for rooms
Broadcast::channel('room.{code}', function ($user, $code) {
    $room = Room::where('code', $code)->first();
    if (!$room) {
        return false;
    }
    
    // Check if player has joined the room
    $isMember = $room->players()->where('user_id', $user->id)->exists();
    if ($isMember) {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'avatar' => $user->avatar
        ];
    }
    return false;
});

// Private channel for matches
Broadcast::channel('game.{matchId}', function ($user, $matchId) {
    $match = MatchModel::find($matchId);
    if (!$match) {
        return false;
    }
    
    // Check if player is in the match
    return $match->players()->where('user_id', $user->id)->exists();
});
