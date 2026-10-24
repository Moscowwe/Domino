<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Users Table
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username', 50)->unique();
            $table->string('email')->unique();
            $table->string('password');
            $table->string('avatar', 100);
            $table->timestamps();
        });

        // 2. Rooms Table
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('code', 6)->unique();
            $table->foreignId('host_id')->constrained('users')->onDelete('cascade');
            $table->string('name', 100)->default('Domino Room');
            $table->integer('players_count')->default(2); // 2 or 4
            $table->integer('target_score')->default(101); // 51, 101, 201, custom
            $table->boolean('is_private')->default(false);
            $table->string('status', 20)->default('lobby'); // lobby, playing, finished
            $table->timestamps();
        });

        // 3. Room Players Table (Lobby seating)
        Schema::create('room_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('rooms')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->integer('slot_index'); // 0 to 3
            $table->boolean('is_ready')->default(false);
            $table->timestamp('joined_at')->useCurrent();
        });

        // 4. Matches Table
        Schema::create('matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->nullable()->constrained('rooms')->onDelete('set null');
            $table->string('mode', 10)->default('1v1'); // 1v1 or 2v2
            $table->integer('target_score');
            $table->string('status', 20)->default('active'); // active, completed, abandoned
            $table->foreignId('winner_id')->nullable()->constrained('users')->onDelete('set null');
            $table->integer('winning_team_index')->nullable(); // 0 or 1
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
        });

        // 5. Teams Table (for 2v2 scoring)
        Schema::create('teams', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('matches')->onDelete('cascade');
            $table->integer('team_index'); // 0 (Team A) or 1 (Team B)
            $table->integer('score')->default(0);
            $table->timestamps();
        });

        // 6. Match Players (Active game seating)
        Schema::create('match_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('matches')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->integer('team_index')->nullable(); // 0 or 1 (for 2v2)
            $table->integer('seat_index'); // 0, 1, 2, 3 clockwise
        });

        // 7. Rounds Table
        Schema::create('rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('matches')->onDelete('cascade');
            $table->integer('round_number');
            $table->string('status', 20)->default('playing'); // playing, completed, blocked
            $table->json('board_state'); // JSON array of active board: [[2,2], [2,5]]
            $table->integer('left_end')->nullable();
            $table->integer('right_end')->nullable();
            $table->json('boneyard'); // JSON list of remaining tiles in boneyard
            $table->foreignId('current_turn_player_id')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('turn_deadline')->nullable();
            $table->foreignId('winner_id')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('started_at')->useCurrent();
        });

        // 8. Player Hands Table
        Schema::create('player_hands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('round_id')->constrained('rounds')->onDelete('cascade');
            $table->foreignId('player_id')->constrained('users')->onDelete('cascade');
            $table->json('hand'); // JSON array of active cards held: [[1,2], [3,4]]
        });

        // 9. Moves Table
        Schema::create('moves', function (Blueprint $table) {
            $table->id();
            $table->foreignId('round_id')->constrained('rounds')->onDelete('cascade');
            $table->foreignId('player_id')->constrained('users')->onDelete('cascade');
            $table->integer('move_number');
            $table->integer('tile_left');
            $table->integer('tile_right');
            $table->string('side', 10); // left, right, start
            $table->timestamp('played_at')->useCurrent();
        });

        // 10. Round Scores
        Schema::create('round_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('round_id')->constrained('rounds')->onDelete('cascade');
            $table->foreignId('player_id')->constrained('users')->onDelete('cascade');
            $table->integer('points_awarded');
        });

        // 11. Chat Messages Table
        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('rooms')->onDelete('cascade');
            $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('cascade'); // Nullable for system messages
            $table->text('message');
            $table->string('type', 10)->default('chat'); // chat, system
            $table->timestamp('created_at')->useCurrent();
        });

        // 12. Statistics Table
        Schema::create('statistics', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained('users')->onDelete('cascade');
            $table->integer('matches_played')->default(0);
            $table->integer('matches_won')->default(0);
            $table->integer('rounds_played')->default(0);
            $table->integer('rounds_won')->default(0);
            $table->integer('total_points')->default(0);
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
        });

        // 13. Reconnect Sessions Table
        Schema::create('reconnect_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->onDelete('cascade');
            $table->foreignId('match_id')->constrained('matches')->onDelete('cascade');
            $table->timestamp('disconnected_at')->useCurrent();
            $table->timestamp('expires_at');
        });

        // 14. Laravel Sanctum personal_access_tokens Table
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('tokenable_type');
            $table->unsignedBigInteger('tokenable_id');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            
            $table->index(['tokenable_type', 'tokenable_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('reconnect_sessions');
        Schema::dropIfExists('statistics');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('round_scores');
        Schema::dropIfExists('moves');
        Schema::dropIfExists('player_hands');
        Schema::dropIfExists('rounds');
        Schema::dropIfExists('match_players');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('matches');
        Schema::dropIfExists('room_players');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('users');
    }
};
