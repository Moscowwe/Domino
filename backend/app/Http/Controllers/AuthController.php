<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Statistic;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Register a new user.
     */
    public function register(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:50|unique:users,username',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'avatar' => 'nullable|string|max:100',
        ]);

        $user = User::create([
            'username' => $request->username,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'avatar' => $request->avatar ?? 'avatar_crown',
        ]);

        // Initialize user statistics
        Statistic::create([
            'user_id' => $user->id,
            'matches_played' => 0,
            'matches_won' => 0,
            'rounds_played' => 0,
            'rounds_won' => 0,
            'total_points' => 0,
        ]);

        Auth::login($user);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'avatar' => $user->avatar,
            ]
        ], 201);
    }

    /**
     * Login user and issue Sanctum token.
     */
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials provided.'],
            ]);
        }

        Auth::login($user);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'avatar' => $user->avatar,
            ]
        ], 200);
    }

    /**
     * Login as Guest
     */
    public function loginAsGuest(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:40',
            'avatar' => 'nullable|string|max:100',
        ]);

        $baseUsername = preg_replace('/[^a-zA-Z0-9_]/', '', $request->username);
        if (empty($baseUsername)) {
            $baseUsername = 'Guest';
        }

        $username = $baseUsername . '_' . rand(1000, 9999);
        while (User::where('username', $username)->exists()) {
            $username = $baseUsername . '_' . rand(1000, 9999);
        }

        $email = 'guest_' . uniqid() . '@domino.local';
        $password = Hash::make(Str::random(16));

        $user = User::create([
            'username' => $username,
            'email' => $email,
            'password' => $password,
            'avatar' => $request->avatar ?? 'avatar_crown',
        ]);

        Statistic::create([
            'user_id' => $user->id,
            'matches_played' => 0,
            'matches_won' => 0,
            'rounds_played' => 0,
            'rounds_won' => 0,
            'total_points' => 0,
        ]);

        Auth::login($user);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'avatar' => $user->avatar,
            ]
        ], 201);
    }

    /**
     * Logout and destroy tokens.
     */
    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully'
        ], 200);
    }
}
