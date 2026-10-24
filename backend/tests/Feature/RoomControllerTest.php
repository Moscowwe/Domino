<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Room;
use App\Models\RoomPlayer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test public rooms listing and verify eager loading host details.
     */
    public function test_public_rooms_listing_retrieval(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_shield'
        ]);

        $room1 = Room::create([
            'code' => 'ABCD12',
            'host_id' => $host->id,
            'name' => 'Table A',
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create([
            'room_id' => $room1->id,
            'user_id' => $host->id,
            'slot_index' => 0,
            'is_ready' => true
        ]);

        $response = $this->actingAs($guest, 'sanctum')
            ->getJson('/api/rooms/public');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'rooms')
            ->assertJsonFragment([
                'code' => 'ABCD12',
                'name' => 'Table A',
                'players_count' => 2,
                'joined_count' => 1,
                'target_score' => 101,
                'host' => 'host_user'
            ]);
    }

    /**
     * Test room creation.
     */
    public function test_room_creation(): void
    {
        $user = User::create([
            'username' => 'creator',
            'email' => 'creator@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/rooms', [
                'name' => 'My Private Club',
                'players_count' => 4,
                'target_score' => 201,
                'is_private' => true
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('name', 'My Private Club')
            ->assertJsonPath('players_count', 4)
            ->assertJsonPath('target_score', 201)
            ->assertJsonPath('is_private', true)
            ->assertJsonPath('status', 'lobby');

        $this->assertDatabaseHas('rooms', [
            'name' => 'My Private Club',
            'host_id' => $user->id
        ]);

        $this->assertDatabaseHas('room_players', [
            'user_id' => $user->id,
            'slot_index' => 0,
            'is_ready' => true
        ]);
    }

    /**
     * Test joining private rooms by code.
     */
    public function test_join_private_room_by_code(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_crown'
        ]);

        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_shield'
        ]);

        $room = Room::create([
            'code' => 'XYZ987',
            'host_id' => $host->id,
            'name' => 'Secret Room',
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => true,
            'status' => 'lobby'
        ]);

        RoomPlayer::create([
            'room_id' => $room->id,
            'user_id' => $host->id,
            'slot_index' => 0,
            'is_ready' => true
        ]);

        $response = $this->actingAs($guest, 'sanctum')
            ->postJson('/api/rooms/join', [
                'code' => 'XYZ987'
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('code', 'XYZ987')
            ->assertJsonCount(2, 'players');

        $this->assertDatabaseHas('room_players', [
            'room_id' => $room->id,
            'user_id' => $guest->id,
            'slot_index' => 1,
            'is_ready' => false
        ]);
    }

    /**
     * Test join failure for invalid room codes.
     */
    public function test_join_fails_with_invalid_room_code(): void
    {
        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123'),
            'avatar' => 'avatar_shield'
        ]);

        $response = $this->actingAs($guest, 'sanctum')
            ->postJson('/api/rooms/join', [
                'code' => 'NOSUCH'
            ]);

        $response->assertStatus(404)
            ->assertJsonFragment(['message' => 'Room not found.']);
    }

    /**
     * Test join failure when room capacity is full.
     */
    public function test_join_fails_when_room_is_full(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $guest1 = User::create([
            'username' => 'guest1',
            'email' => 'g1@example.com',
            'password' => bcrypt('password123')
        ]);

        $guest2 = User::create([
            'username' => 'guest2',
            'email' => 'g2@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'FULL12',
            'host_id' => $host->id,
            'name' => '1v1 Table',
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0]);
        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $guest1->id, 'slot_index' => 1]);

        $response = $this->actingAs($guest2, 'sanctum')
            ->postJson('/api/rooms/join', [
                'code' => 'FULL12'
            ]);

        $response->assertStatus(400)
            ->assertJsonFragment(['message' => 'Room is full.']);
    }

    /**
     * Test toggling ready state.
     */
    public function test_toggle_ready_status(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'REDY12',
            'host_id' => $host->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0, 'is_ready' => true]);
        $rp = RoomPlayer::create(['room_id' => $room->id, 'user_id' => $guest->id, 'slot_index' => 1, 'is_ready' => false]);

        // Toggle to Ready
        $response = $this->actingAs($guest, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/ready");

        $response->assertStatus(200);
        $this->assertTrue($rp->refresh()->is_ready);

        // Toggle back to Not Ready
        $response2 = $this->actingAs($guest, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/ready");

        $response2->assertStatus(200);
        $this->assertFalse($rp->refresh()->is_ready);
    }

    /**
     * Test host transfer when the active host leaves the room.
     */
    public function test_host_transfer_when_host_leaves(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'TRAF12',
            'host_id' => $host->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0, 'is_ready' => true]);
        $rpGuest = RoomPlayer::create(['room_id' => $room->id, 'user_id' => $guest->id, 'slot_index' => 1, 'is_ready' => false]);

        // Host leaves the room
        $response = $this->actingAs($host, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/leave");

        $response->assertStatus(200);

        // Room is NOT deleted because Guest remains
        $room->refresh();
        $this->assertEquals($guest->id, $room->host_id); // promoted to host
        $this->assertTrue($rpGuest->refresh()->is_ready); // host is ready by default
    }

    /**
     * Test room deletion when all players leave.
     */
    public function test_room_deletion_when_last_leaves(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'DELT12',
            'host_id' => $host->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0, 'is_ready' => true]);

        $response = $this->actingAs($host, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/leave");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('rooms', ['id' => $room->id]);
    }

    /**
     * Test host kicking guest player from the lobby.
     */
    public function test_host_can_kick_guest(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $guest = User::create([
            'username' => 'guest_user',
            'email' => 'guest@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'KICK12',
            'host_id' => $host->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0]);
        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $guest->id, 'slot_index' => 1]);

        // Kick the guest
        $response = $this->actingAs($host, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/kick", [
                'user_id' => $guest->id
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseMissing('room_players', ['room_id' => $room->id, 'user_id' => $guest->id]);
    }

    /**
     * Test host closing and disbanding the room.
     */
    public function test_host_can_close_and_disband_room(): void
    {
        $host = User::create([
            'username' => 'host_user',
            'email' => 'host@example.com',
            'password' => bcrypt('password123')
        ]);

        $room = Room::create([
            'code' => 'CLOS12',
            'host_id' => $host->id,
            'players_count' => 2,
            'target_score' => 101,
            'is_private' => false,
            'status' => 'lobby'
        ]);

        RoomPlayer::create(['room_id' => $room->id, 'user_id' => $host->id, 'slot_index' => 0]);

        $response = $this->actingAs($host, 'sanctum')
            ->postJson("/api/rooms/{$room->code}/close");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('rooms', ['id' => $room->id]);
    }
}
