<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;

// Public endpoints
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/login/guest', [AuthController::class, 'loginAsGuest']);

Route::get('/clear', function () {
    \Illuminate\Support\Facades\Artisan::call('optimize:clear');
    return 'Cache cleared';
});

// Authenticated group (Sanctum)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    // Profile & Stats
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::get('/statistics', [ProfileController::class, 'statistics']);
    Route::post('/profile/avatar', [ProfileController::class, 'uploadAvatar']);

    // Lobby / Rooms
    Route::get('/rooms/public', [RoomController::class, 'listPublic']);
    Route::post('/rooms/bot-match', [RoomController::class, 'startBotMatch']);
    Route::post('/rooms', [RoomController::class, 'create']);
    Route::post('/rooms/join', [RoomController::class, 'join']);
    Route::get('/rooms/{code}', [RoomController::class, 'show']);
    Route::post('/rooms/{code}/settings', [RoomController::class, 'updateSettings']);
    Route::post('/rooms/{code}/ready', [RoomController::class, 'toggleReady']);
    Route::post('/rooms/{code}/leave', [RoomController::class, 'leave']);
    Route::post('/rooms/{code}/start', [RoomController::class, 'startMatch']);
    Route::post('/rooms/{code}/kick', [RoomController::class, 'kickPlayer']);
    Route::post('/rooms/{code}/close', [RoomController::class, 'closeRoom']);
    Route::post('/rooms/{code}/chat', [RoomController::class, 'sendChat']);

    // Gameplay
    Route::get('/matches/{id}', [MatchController::class, 'show']);
    Route::post('/matches/{id}/play', [MatchController::class, 'play']);
    Route::post('/matches/{id}/draw', [MatchController::class, 'draw']);
    Route::post('/matches/{id}/pass', [MatchController::class, 'pass']);
    Route::post('/matches/{id}/report-disconnect', [MatchController::class, 'reportDisconnect']);
    Route::post('/matches/{id}/report-reconnect', [MatchController::class, 'reportReconnect']);
});
