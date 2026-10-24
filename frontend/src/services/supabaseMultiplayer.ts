import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface RoomBroadcastPayload {
    type: 'broadcast';
    event: string;
    payload: any;
}

export class SupabaseMultiplayerService {
    private currentChannel: RealtimeChannel | null = null;
    private roomCode: string | null = null;

    /**
     * Join or create a Supabase Realtime room channel
     */
    public joinRoom(
        roomCode: string,
        player: { id: number; username: string; avatar: string },
        callbacks: {
            onPlayerJoined?: (player: any) => void;
            onPlayerLeft?: (player: any) => void;
            onPresenceSync?: (players: any[]) => void;
            onGameStarted?: (matchData: any) => void;
            onTilePlayed?: (data: { playerId: number; tile: number[]; side: string; board: number[][]; leftEnd: number | null; rightEnd: number | null }) => void;
            onTileDrawn?: (data: { playerId: number; boneyardCount: number; tile?: number[] }) => void;
            onTurnPassed?: (data: { playerId: number; nextPlayerId: number }) => void;
            onChatMessage?: (chat: { username: string; avatar: string; message: string; timestamp: string }) => void;
            onRoundFinished?: (data: any) => void;
            onNextRound?: (data: any) => void;
        }
    ) {
        this.leaveCurrentRoom();

        this.roomCode = roomCode;
        const channelName = `domino_room_${roomCode.toLowerCase()}`;

        const channel = supabase.channel(channelName, {
            config: {
                broadcast: { self: false },
                presence: { key: String(player.id) },
            },
        });

        // ── Presence Events ───────────────────────────────────────────────────
        channel
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel.presenceState();
                const players: any[] = [];
                for (const key in presenceState) {
                    const entries = presenceState[key];
                    if (entries && entries.length > 0) {
                        players.push(entries[0]);
                    }
                }
                callbacks.onPresenceSync?.(players);
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                if (newPresences && newPresences.length > 0) {
                    callbacks.onPlayerJoined?.(newPresences[0]);
                }
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                if (leftPresences && leftPresences.length > 0) {
                    callbacks.onPlayerLeft?.(leftPresences[0]);
                }
            });

        // ── Broadcast Events ──────────────────────────────────────────────────
        channel
            .on('broadcast', { event: 'game_started' }, ({ payload }) => {
                callbacks.onGameStarted?.(payload);
            })
            .on('broadcast', { event: 'tile_played' }, ({ payload }) => {
                callbacks.onTilePlayed?.(payload);
            })
            .on('broadcast', { event: 'tile_drawn' }, ({ payload }) => {
                callbacks.onTileDrawn?.(payload);
            })
            .on('broadcast', { event: 'turn_passed' }, ({ payload }) => {
                callbacks.onTurnPassed?.(payload);
            })
            .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
                callbacks.onChatMessage?.(payload);
            })
            .on('broadcast', { event: 'round_finished' }, ({ payload }) => {
                callbacks.onRoundFinished?.(payload);
            })
            .on('broadcast', { event: 'next_round' }, ({ payload }) => {
                callbacks.onNextRound?.(payload);
            });

        // Subscribe & track presence
        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    id: player.id,
                    username: player.username,
                    avatar: player.avatar,
                    joinedAt: new Date().toISOString(),
                });
            }
        });

        this.currentChannel = channel;
        return channel;
    }

    /**
     * Broadcast an event to all other players in the room
     */
    public async broadcast(event: string, payload: any) {
        if (!this.currentChannel) return;
        await this.currentChannel.send({
            type: 'broadcast',
            event,
            payload,
        });
    }

    /**
     * Get current connected room code
     */
    public getRoomCode(): string | null {
        return this.roomCode;
    }

    /**
     * Leave the current room and cleanup channel
     */
    public leaveCurrentRoom() {
        if (this.currentChannel) {
            this.currentChannel.untrack();
            this.currentChannel.unsubscribe();
            supabase.removeChannel(this.currentChannel);
            this.currentChannel = null;
            this.roomCode = null;
        }
    }
}

export const multiplayerService = new SupabaseMultiplayerService();
