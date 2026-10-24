import { create } from 'zustand';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { audio } from '../utils/audio';
import { multiplayerService } from '../services/supabaseMultiplayer';

// Declare Pusher globally for Laravel Echo
if (typeof window !== 'undefined') {
    (window as any).Pusher = Pusher;
}

export interface User {
    id: number;
    username: string;
    avatar: string;
    email?: string;
}

export interface RoomPlayer {
    id: number;
    username: string;
    avatar: string;
    slot_index: number;
    is_ready: boolean;
}

export interface Room {
    id: number;
    code: string;
    host_id: number;
    players_count: number;
    target_score: number;
    is_private: boolean;
    status: string;
    players: RoomPlayer[];
}

export interface MatchPlayer {
    id: number;
    username: string;
    avatar: string;
    seat_index: number;
    team_index: number | null;
    tile_count: number;
    is_connected: boolean;
    is_bot: boolean;
    reconnect_deadline: string | null;
}

export interface Match {
    match_id: number;
    mode: string;
    status: string;
    target_score: number;
    round_number: number;
    round_status: string;
    board: number[][];
    left_end: number | null;
    right_end: number | null;
    boneyard_count: number;
    current_turn_player_id: number | null;
    turn_deadline: string | null;
    players: MatchPlayer[];
    scores: Record<number, number>;
    team_scores: Record<number, number> | null;
}

export interface ChatMessage {
    username: string | null;
    avatar: string | null;
    message: string;
    type: 'chat' | 'system';
    timestamp: string;
}

interface GameState {
    // Authentication
    token: string | null;
    currentUser: User | null;
    
    // Active Room/Lobby
    activeRoom: Room | null;
    activeRoomCode: string | null;
    
    // Active Match/Gameplay
    activeMatch: Match | null;
    myHand: number[][]; // Private hand (only visible to this client)
    
    // Chat Panel
    chatMessages: ChatMessage[];

    // Laravel Echo Connection
    echo: Echo<any> | null;

    // Actions
    setAuth: (user: User, token: string) => void;
    clearAuth: () => void;
    updateUserAvatar: (avatar: string) => void;
    setRoom: (room: Room | null) => void;
    setMatch: (match: Match | null) => void;
    setMyHand: (hand: number[][]) => void;
    addChatMessage: (msg: ChatMessage) => void;
    clearChat: () => void;
    
    // Echo Actions
    initEcho: (token: string) => void;
    destroyEcho: () => void;
    joinRoomChannel: (roomCode: string) => void;
    leaveRoomChannel: (roomCode: string) => void;
    joinGameChannel: (matchId: number) => void;
    leaveGameChannel: (matchId: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    token: typeof window !== 'undefined' ? localStorage.getItem('domino_token') : null,
    currentUser: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('domino_user') || 'null') : null,
    activeRoom: null,
    activeRoomCode: null,
    activeMatch: null,
    myHand: [],
    chatMessages: [],
    echo: null,

    setAuth: (user, token) => {
        localStorage.setItem('domino_token', token);
        localStorage.setItem('domino_user', JSON.stringify(user));
        set({ currentUser: user, token });
        get().initEcho(token);
    },

    clearAuth: () => {
        localStorage.removeItem('domino_token');
        localStorage.removeItem('domino_user');
        get().destroyEcho();
        set({ currentUser: null, token: null, activeRoom: null, activeRoomCode: null, activeMatch: null, myHand: [], chatMessages: [] });
    },

    updateUserAvatar: (avatar) => {
        const user = get().currentUser;
        if (user) {
            const updated = { ...user, avatar };
            localStorage.setItem('domino_user', JSON.stringify(updated));
            set({ currentUser: updated });
        }
    },

    setRoom: (activeRoom) => set({ activeRoom, activeRoomCode: activeRoom ? activeRoom.code : get().activeRoomCode }),
    setMatch: (activeMatch) => set({ activeMatch }),
    setMyHand: (myHand) => set({ myHand }),
    
    addChatMessage: (msg) => set((state) => ({ 
        chatMessages: [...state.chatMessages, msg] 
    })),

    clearChat: () => set({ chatMessages: [] }),

    initEcho: (token) => {
        get().destroyEcho();

        try {
            const host = window.location.hostname;
            const wsPort = window.location.port ? parseInt(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80);

            const echoInstance = new Echo({
                broadcaster: 'reverb',
                key: 'domino_reverb_key',
                wsHost: host,
                wsPort: wsPort,
                wssPort: wsPort,
                forceTLS: window.location.protocol === 'https:',
                enabledTransports: ['ws', 'wss'],
                authEndpoint: '/api/broadcasting/auth',
                auth: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            });

            set({ echo: echoInstance });
        } catch (e) {
            console.warn('Echo/Reverb unavailable, using Supabase Realtime:', e);
        }
    },

    destroyEcho: () => {
        const { echo } = get();
        if (echo) {
            try { echo.disconnect(); } catch {}
            set({ echo: null });
        }
    },

    joinRoomChannel: (roomCode) => {
        const { echo, addChatMessage, setRoom, currentUser } = get();

        // Reset chat for room and keep roomCode in activeRoomCode
        set({ chatMessages: [], activeRoomCode: roomCode });

        // Connect Supabase Realtime channel
        if (currentUser) {
            multiplayerService.joinRoom(roomCode, currentUser, {
                onChatMessage: (chat) => {
                    addChatMessage({
                        username: chat.username,
                        avatar: chat.avatar,
                        message: chat.message,
                        type: 'chat',
                        timestamp: chat.timestamp || new Date().toISOString()
                    });
                },
                onPlayerJoined: (p) => {
                    addChatMessage({
                        username: null,
                        avatar: null,
                        message: `${p.username || 'A player'} joined the room.`,
                        type: 'system',
                        timestamp: new Date().toISOString()
                    });
                },
                onGameStarted: (matchData) => {
                    if (matchData) {
                        set({ activeMatch: matchData });
                    }
                }
            });
        }

        if (!echo) return;

        try {
            echo.join(`room.${roomCode}`)
                .here((users: any[]) => {
                    console.log('Players inside lobby:', users);
                })
                .joining((user: any) => {
                    addChatMessage({
                        username: null,
                        avatar: null,
                        message: `${user.username} entered the lobby.`,
                        type: 'system',
                        timestamp: new Date().toISOString()
                    });
                })
                .leaving((user: any) => {
                    addChatMessage({
                        username: null,
                        avatar: null,
                        message: `${user.username} left the lobby.`,
                        type: 'system',
                        timestamp: new Date().toISOString()
                    });
                })
                .listen('.RoomUpdated', (updatedRoom: any) => {
                    if (updatedRoom.status === 'disbanded') {
                        set({ activeRoom: null });
                        window.dispatchEvent(new CustomEvent('domino:navigate', { detail: 'LOBBY' }));
                        alert('The room lobby has been disbanded by the host.');
                        return;
                    }

                    const isStillSeated = updatedRoom.players?.some((p: any) => p.id === currentUser?.id);
                    if (isStillSeated === false) {
                        set({ activeRoom: null });
                        window.dispatchEvent(new CustomEvent('domino:navigate', { detail: 'LOBBY' }));
                        alert('You have been kicked from the lobby by the host.');
                        return;
                    }

                    setRoom(updatedRoom);
                })
                .listen('.GameStarting', (data: { match_id: number }) => {
                    const roomCode = get().activeRoomCode || (get().activeRoom ? get().activeRoom!.code : null);
                    if (roomCode) {
                        get().leaveRoomChannel(roomCode);
                    }
                    set({ activeRoom: null });
                    window.dispatchEvent(new CustomEvent('domino:game_starting', { detail: data.match_id }));
                });
        } catch (e) {
            console.warn('Echo join room failed:', e);
        }
    },

    leaveRoomChannel: (roomCode) => {
        multiplayerService.leaveCurrentRoom();
        const { echo } = get();
        if (echo) {
            try { echo.leave(`room.${roomCode}`); } catch {}
        }
    },

    joinGameChannel: (matchId) => {
        const { echo, setMatch } = get();
        if (!echo) return;

        echo.private(`game.${matchId}`)
            .listen('.GameStateUpdated', (state: Match) => {
                const oldMatch = get().activeMatch;
                const oldBoardLength = oldMatch?.board.length || 0;
                const oldBoneyardCount = oldMatch?.boneyard_count || 0;

                setMatch(state);
                window.dispatchEvent(new CustomEvent('domino:state_updated'));

                // Sound effects transitions
                if (state.board.length > oldBoardLength) {
                    audio.playPlaced();
                } else if (state.boneyard_count < oldBoneyardCount) {
                    audio.playDrawn();
                }
            })
            .listen('.RoundEnded', (data: any) => {
                audio.playRoundWin();
                window.dispatchEvent(new CustomEvent('domino:round_ended', { detail: data }));
            })
            .listen('.MatchEnded', (data: any) => {
                audio.playMatchWin();
                window.dispatchEvent(new CustomEvent('domino:match_ended', { detail: data }));
            });
    },

    leaveGameChannel: (matchId) => {
        const { echo } = get();
        if (echo) {
            echo.leave(`game.${matchId}`);
        }
    }
}));

// Re-init echo if token exists on load
if (typeof window !== 'undefined') {
    const savedToken = localStorage.getItem('domino_token');
    if (savedToken) {
        useGameStore.getState().initEcho(savedToken);
    }
}
