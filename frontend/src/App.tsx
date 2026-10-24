import { useState, useEffect } from 'react';
import { useGameStore } from './store/useGameStore';
import { AuthView } from './features/auth/AuthView';
import { LobbyView } from './features/lobby/LobbyView';
import { RoomView } from './features/room/RoomView';
import { GameBoardView } from './features/game/GameBoardView';
import { ProfileView } from './features/profile/ProfileView';
import { dominoSlicer } from './features/game/utils/dominoSlicer';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Hexagon } from 'lucide-react';
import { AvatarIcon } from './features/auth/AuthView';

type ViewState = 'AUTH' | 'LOBBY' | 'ROOM' | 'BOARD' | 'PROFILE';

// Floating background particle
const Particle = ({ style }: { style: React.CSSProperties }) => (
    <div className="particle w-1 h-1 bg-cyan-400/20 rounded-full" style={style} />
);

function App() {
    const { currentUser, token, setMatch, joinRoomChannel, leaveRoomChannel, leaveGameChannel } = useGameStore();
    const [view, setView] = useState<ViewState>('AUTH');
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [ping, setPing] = useState(38);

    useEffect(() => {
        dominoSlicer.load()
            .then(() => setAssetsLoaded(true))
            .catch(() => setAssetsLoaded(true));
    }, []);

    // Simulate ping fluctuation
    useEffect(() => {
        const iv = setInterval(() => {
            setPing(p => Math.max(12, Math.min(80, p + Math.floor(Math.random() * 9) - 4)));
        }, 4000);
        return () => clearInterval(iv);
    }, []);

    // Sync auth → view
    useEffect(() => {
        if (currentUser && token) { setView('LOBBY'); }
        else { setView('AUTH'); }
    }, [currentUser, token]);

    // Global navigation & broadcast handlers
    useEffect(() => {
        const handleNavigate = (e: any) => { setView(e.detail as ViewState); };

        const handleGameStarting = (e: any) => {
            const matchId = e.detail as number;
            const { activeRoom, leaveRoomChannel, joinGameChannel } = useGameStore.getState();
            if (activeRoom) {
                leaveRoomChannel(activeRoom.code);
            }

            // Clear selected room, ready flags (inside room), and chat messages
            useGameStore.setState({ activeRoom: null, chatMessages: [] });

            setMatch({
                match_id: matchId,
                mode: '1v1',
                status: 'active',
                target_score: 101,
                round_number: 1,
                round_status: 'playing',
                board: [],
                left_end: null,
                right_end: null,
                boneyard_count: 14,
                current_turn_player_id: null,
                turn_deadline: null,
                players: [],
                scores: {},
                team_scores: null
            });

            joinGameChannel(matchId);
            setView('BOARD');
        };

        window.addEventListener('domino:navigate', handleNavigate);
        window.addEventListener('domino:game_starting', handleGameStarting);
        return () => {
            window.removeEventListener('domino:navigate', handleNavigate);
            window.removeEventListener('domino:game_starting', handleGameStarting);
        };
    }, [setMatch]);

    // Channel lifecycle when view changes
    useEffect(() => {
        const { activeRoom, activeMatch } = useGameStore.getState();
        if (view === 'ROOM' && activeRoom) joinRoomChannel(activeRoom.code);
        return () => {
            if (view !== 'ROOM' && activeRoom) leaveRoomChannel(activeRoom.code);
            if (view !== 'BOARD' && activeMatch) leaveGameChannel(activeMatch.match_id);
        };
    }, [view]);

    // ── Loading Screen ─────────────────────────────────────────────────────────
    if (!assetsLoaded) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center bg-[#090B12] relative overflow-hidden">
                {/* Ambient glow orbs */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/5 blur-[100px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-yellow-500/4 blur-[80px] pointer-events-none" />

                <motion.div
                    className="text-center space-y-8 relative z-10"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-3">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                        >
                            <Hexagon className="w-10 h-10 text-cyan-400" strokeWidth={1.5} />
                        </motion.div>
                        <h1 className="text-5xl font-black tracking-widest text-white text-glow-cyan">
                            DOMINO<span className="text-cyan-400">.</span>IO
                        </h1>
                    </div>

                    <p className="text-sm text-slate-500 font-semibold uppercase tracking-[0.3em]">
                        Loading premium assets
                    </p>

                    {/* Animated progress bar */}
                    <div className="w-64 h-[3px] bg-white/5 rounded-full overflow-hidden mx-auto">
                        <motion.div
                            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
                        />
                    </div>
                </motion.div>
            </div>
        );
    }

    // ── Game Board View (Full-screen, no header/footer) ────────────────────────
    if (view === 'BOARD') {
        return (
            <div className="min-h-screen bg-[#090B12] relative overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full bg-cyan-500/4 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] rounded-full bg-yellow-400/3 blur-[100px] pointer-events-none" />
                <GameBoardView onViewLobby={() => setView('LOBBY')} />
            </div>
        );
    }

    // ── Standard Shell (with header) ──────────────────────────────────────────
    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden">
            {/* Background ambient glow orbs */}
            <div className="fixed top-0 left-1/4 w-[700px] h-[400px] rounded-full bg-cyan-500/5 blur-[140px] pointer-events-none z-0" />
            <div className="fixed bottom-0 right-1/4 w-[500px] h-[350px] rounded-full bg-yellow-400/4 blur-[120px] pointer-events-none z-0" />

            {/* Floating particles */}
            {[...Array(6)].map((_, i) => (
                <Particle
                    key={i}
                    style={{
                        position: 'fixed',
                        top: `${10 + i * 15}%`,
                        left: `${5 + i * 16}%`,
                        width: i % 2 === 0 ? '3px' : '2px',
                        height: i % 2 === 0 ? '3px' : '2px',
                        animationDuration: `${4 + i * 1.5}s`,
                        animationDelay: `${i * 0.8}s`,
                        zIndex: 0
                    }}
                />
            ))}

            {/* ── PREMIUM HEADER ───────────────────────────────────────────── */}
            <header className="relative z-10 border-b border-white/[0.05]" style={{ background: 'rgba(9,11,18,0.7)', backdropFilter: 'blur(20px)' }}>
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    {/* Left: Logo */}
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                            <Hexagon className="w-4 h-4 text-cyan-400" strokeWidth={2} />
                        </div>
                        <span className="text-base font-black tracking-[0.15em] text-white">
                            DOMINO<span className="text-cyan-400">.</span>IO
                        </span>
                    </div>

                    {/* Right: Status + user chip */}
                    <div className="flex items-center gap-4">
                        {/* System status */}
                        <div className="hidden md:flex items-center gap-1.5 text-[11px] font-bold tracking-wider">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                            <span className="text-slate-400">ONLINE</span>
                        </div>

                        {/* Ping indicator */}
                        {currentUser && (
                            <div className="hidden sm:flex items-center gap-1 bg-white/5 border border-white/8 rounded-lg px-2.5 py-1">
                                <Wifi className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] font-bold text-slate-400 font-mono">{ping}ms</span>
                            </div>
                        )}

                        {/* User chip */}
                        {currentUser && (
                            <button
                                onClick={() => setView('PROFILE')}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl px-3 py-1.5 transition-all duration-150 active:scale-95"
                            >
                                <AvatarIcon id={currentUser.avatar} className="w-5 h-5" />
                                <span className="text-xs font-bold text-white hidden sm:block max-w-[100px] truncate">
                                    {currentUser.username}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
            <main className="flex-grow relative z-10">
                <AnimatePresence mode="wait">
                    {view === 'AUTH' && (
                        <motion.div key="auth"
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                        >
                            <AuthView />
                        </motion.div>
                    )}
                    {view === 'LOBBY' && (
                        <motion.div key="lobby"
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                        >
                            <LobbyView onViewProfile={() => setView('PROFILE')} />
                        </motion.div>
                    )}
                    {view === 'ROOM' && (
                        <motion.div key="room"
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                        >
                            <RoomView onViewLobby={() => setView('LOBBY')} />
                        </motion.div>
                    )}
                    {view === 'PROFILE' && (
                        <motion.div key="profile"
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                        >
                            <ProfileView onViewLobby={() => setView('LOBBY')} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* ── FOOTER ───────────────────────────────────────────────────── */}
            <footer className="relative z-10 border-t border-white/[0.04] py-3">
                    <p className="text-center text-[11px] text-slate-600 font-medium">
                        © 2026 DOMINO.IO — Realtime Multiplayer · All rights reserved
                    </p>
                </footer>
        </div>
    );
}

export default App;
