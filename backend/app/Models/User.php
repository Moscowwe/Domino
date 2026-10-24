<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'username',
        'email',
        'password',
        'avatar',
    ];

    /**
     * Default attributes.
     */
    protected $attributes = [
        'avatar' => 'avatar_crown',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the user's statistics record.
     */
    public function statistic()
    {
        return $this->hasOne(Statistic::class, 'user_id');
    }

    /**
     * Get the active room placement for the user in lobby.
     */
    public function roomPlayer()
    {
        return $this->hasOne(RoomPlayer::class, 'user_id');
    }

    /**
     * Get all matches the user participated in.
     */
    public function matchPlayers()
    {
        return $this->hasMany(MatchPlayer::class, 'user_id');
    }
}
