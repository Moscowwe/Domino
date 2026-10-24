<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test successful user registration.
     */
    public function test_user_can_register_successfully(): void
    {
        $response = $this->postJson('/api/register', [
            'username' => 'testuser',
            'email' => 'test@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.username', 'testuser')
            ->assertJsonPath('user.avatar', 'avatar_crown'); // Fallback default avatar

        $this->assertDatabaseHas('users', [
            'username' => 'testuser',
            'email' => 'test@example.com'
        ]);

        $this->assertDatabaseHas('statistics', [
            'user_id' => $response->json('user.id'),
            'matches_played' => 0
        ]);
    }

    /**
     * Test registration validation failures.
     */
    public function test_registration_validation_fails_for_missing_fields(): void
    {
        // Mismatched confirmation password
        $response = $this->postJson('/api/register', [
            'username' => 'testuser',
            'email' => 'test@example.com',
            'password' => 'password123',
            'password_confirmation' => 'different_password',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);

        // Duplicate email
        User::create([
            'username' => 'already_taken',
            'email' => 'duplicate@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $response2 = $this->postJson('/api/register', [
            'username' => 'newuser',
            'email' => 'duplicate@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response2->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    /**
     * Test successful login.
     */
    public function test_user_can_login_successfully(): void
    {
        $user = User::create([
            'username' => 'loginuser',
            'email' => 'login@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.username', 'loginuser');
    }

    /**
     * Test login validation / credentials failures.
     */
    public function test_login_fails_with_invalid_credentials(): void
    {
        $user = User::create([
            'username' => 'loginuser',
            'email' => 'login@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'login@example.com',
            'password' => 'wrong_password'
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    /**
     * Test authenticated user logout.
     */
    public function test_user_can_logout_successfully(): void
    {
        $user = User::create([
            'username' => 'logoutuser',
            'email' => 'logout@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        $response = $this->withHeaders(['Authorization' => "Bearer $token"])
            ->postJson('/api/logout');

        $response->assertStatus(200)
            ->assertJsonFragment(['message' => 'Logged out successfully']);
    }

    /**
     * Test unauthorized access to protected profile endpoints.
     */
    public function test_unauthorized_access_is_blocked(): void
    {
        $response = $this->getJson('/api/profile');

        $response->assertStatus(401);
    }
}
