<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return ['message' => 'Domino Multiplayer API Service is Online'];
});
