import React, { useState, useEffect, useRef } from 'react';
import { safeParseJson } from '../../utils/api';
import { useGameStore } from '../../store/useGameStore';
import type { ChatMessage } from '../../store/useGameStore';
import { AvatarIcon } from '../auth/AuthView';
import { Copy, Check, Play, Send, ArrowLeft, Crown, Shield, Wifi, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const RoomView = ({ onViewLobby }: { onViewLobby: () => void }) => {
    const { currentUser, token, activeRoom, chatMessages, addChatMessage } = useGameStore();
    const [copied, setCopied] = useState(false);
    const [msgText, setMsgText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Host Settings Edit state
    const [playersCount, setPlayersCount] = useState(2);
    const [targetScore, setTargetScore] = useState(101);
    const [isPrivate, setIsPrivate] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);

    const isHost = activeRoom?.host_id === currentUser?.id;
    const allPlayersReady = activeRoom?.players.every(p => p.is_ready) && activeRoom?.players.length === activeRoom?.players_count;

    useEffect(() => {
        if (activeRoom) {
            setPlayersCount(activeRoom.players_count);
            setTargetScore(activeRoom.target_score);
            setIsPrivate(activeRoom.is_private);
        }
    }, [activeRoom?.id]);

    // WebSocket Chat Broadcasts
    useEffect(() => {
        const { echo, addChatMessage } = useGameStore.getState();
        if (!echo || !activeRoom) return;
        echo.join(`room.${activeRoom.code}`).listen('.ChatMessageSent', (msg: ChatMessage) => { addChatMessage(msg); });
    }, [activeRoom?.code]);

    // Scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleCopyCode = () => {
        if (!activeRoom) return;
        navigator.clipboard.writeText(activeRoom.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleToggleReady = async () => {
        if (!activeRoom) return;
        try {
            const res = await fetch(`/api/rooms/${activeRoom.code}/ready`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error('Toggle ready failed.');
        } catch (err) { console.error(err); }
    };

    const handleLeaveRoom = async () => {
        if (!activeRoom) return;
        try {
            await fetch(`/api/rooms/${activeRoom.code}/leave`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
        } catch (err) { console.error(err); }
        finally { onViewLobby(); }
    };

    const handleUpdateSettings = async (newPlayersCount: number, newScore: number, newPriv: boolean) => {
        if (!activeRoom || !isHost) return;
        try {
            await fetch(`/api/rooms/${activeRoom.code}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ players_count: newPlayersCount, target_score: newScore, is_private: newPriv })
            });
        } catch (err) { console.error('Settings update failed:', err); }
    };

    const handleKickPlayer = async (userId: number) => {
        if (!activeRoom || !isHost) return;
        try {
            const res = await fetch(`/api/rooms/${activeRoom.code}/kick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (!res.ok) { const d = await safeParseJson(res); alert(d.message || 'Kick failed.'); }
        } catch (err) { console.error(err); }
    };

    const handleCloseRoom = async () => {
        if (!activeRoom || !isHost) return;
        if (!confirm('Disband this room?')) return;
        try {
            const res = await fetch(`/api/rooms/${activeRoom.code}/close`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (res.ok) { useGameStore.setState({ activeRoom: null }); onViewLobby(); }
        } catch (err) { console.error(err); }
    };

    const handleStartMatch = async () => {
        if (!activeRoom || !isHost) return;
        if (!allPlayersReady) { setError('Cannot start: not all players are ready or lobby is not full.'); return; }
        setError(''); setLoading(true);
        try {
            const res = await fetch(`/api/rooms/${activeRoom.code}/start`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            const data = await safeParseJson(res);
            if (!res.ok) throw new Error(data.message || 'Failed to start game.');

            // Unsubscribe the host from the room channel
            const { leaveRoomChannel } = useGameStore.getState();
            leaveRoomChannel(activeRoom.code);

            // Cleanly clear room state, keep activeRoomCode, and dispatch unified event
            useGameStore.setState({ activeRoomCode: activeRoom.code, activeRoom: null });
            window.dispatchEvent(new CustomEvent('domino:game_starting', { detail: data.match_id }));
        } catch (err: any) {
            setError(err.message || 'Failed to start game.');
            setLoading(false);
        }
    };

    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!msgText.trim() || !activeRoom) return;
        const txt = msgText; setMsgText('');
        try {
            const res = await fetch(`/api/rooms/${activeRoom.code}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ message: txt })
            });
            const data = await safeParseJson(res);
            if (res.ok) addChatMessage(data);
        } catch (err) { console.error('Chat failed:', err); }
    };

    const seats = Array.from({ length: activeRoom?.players_count || 2 }, (_, i) => {
        const player = activeRoom?.players.find(p => p.slot_index === i);
        return { slotIndex: i, player };
    });

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 select-none">

            {/* ── Top Bar ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleLeaveRoom}
                        className="btn-ghost flex items-center gap-2 text-sm py-2 px-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Leave
                    </button>
                    {isHost && (
                        <button
                            onClick={handleCloseRoom}
                            className="btn-danger flex items-center gap-2 text-sm py-2 px-4 rounded-xl"
                        >
                            Close Room
                        </button>
                    )}
                </div>

                {/* Room Code chip */}
                <motion.button
                    onClick={handleCopyCode}
                    className="flex items-center gap-3 glass-panel-cyan rounded-xl px-5 py-2.5 transition-all active:scale-95"
                    whileHover={{ scale: 1.02 }}
                >
                    <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Room Code</div>
                        <div className="font-mono font-black text-xl text-cyan-400 tracking-[0.25em] text-glow-cyan leading-tight">
                            {activeRoom?.code}
                        </div>
                    </div>
                    <motion.div animate={{ scale: copied ? 1.2 : 1 }} transition={{ type: 'spring', stiffness: 400 }}>
                        {copied
                            ? <Check className="w-4 h-4 text-emerald-400" />
                            : <Copy className="w-4 h-4 text-slate-400" />
                        }
                    </motion.div>
                </motion.button>
            </div>

            {/* ── Main Grid ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* CENTER: Player Slots ─────────────────────────────────────── */}
                <div className="lg:col-span-8 space-y-5">
                    <div className="flex items-center gap-2.5 mb-1">
                        <Users className="w-4 h-4 text-slate-500" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Player Slots</h3>
                        <span className="badge-cyan">{activeRoom?.players.length}/{activeRoom?.players_count}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {seats.map((seat, i) => {
                            const p = seat.player;
                            const isEmpty = !p;
                            const isMe = p?.id === currentUser?.id;
                            const isHostPlayer = p?.id === activeRoom?.host_id;

                            return (
                                <motion.div
                                    key={seat.slotIndex}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06, duration: 0.3 }}
                                    className={`relative rounded-2xl border p-5 min-h-[140px] flex flex-col justify-between transition-all duration-300 ${
                                        isEmpty
                                            ? 'border-dashed border-white/10 bg-white/2'
                                            : isMe
                                                ? 'border-cyan-500/25 bg-cyan-500/5'
                                                : 'glass-panel'
                                    }`}
                                >
                                    {/* Slot indicator */}
                                    <div className="absolute top-3 right-3 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                        Seat {seat.slotIndex + 1}
                                    </div>

                                    {isEmpty ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 py-4">
                                            <motion.div
                                                className="w-12 h-12 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center"
                                                animate={{ opacity: [0.4, 0.8, 0.4] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            >
                                                <div className="w-3 h-3 rounded-full bg-white/10" />
                                            </motion.div>
                                            <div className="text-center">
                                                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Waiting for player</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Player info */}
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                                                        isHostPlayer
                                                            ? 'bg-yellow-500/10 border-yellow-500/30'
                                                            : 'bg-white/6 border-white/10'
                                                    }`}>
                                                        <AvatarIcon id={p.avatar} className="w-7 h-7" />
                                                    </div>
                                                    {/* Ready indicator */}
                                                    <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#090B12] ${
                                                        p.is_ready ? 'bg-emerald-400' : 'bg-slate-600'
                                                    }`} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-bold text-white truncate">{p.username}</span>
                                                        {isHostPlayer && (
                                                            <span className="badge-gold flex items-center gap-1">
                                                                <Crown className="w-2.5 h-2.5" /> Host
                                                            </span>
                                                        )}
                                                        {isMe && !isHostPlayer && (
                                                            <span className="badge-cyan">You</span>
                                                        )}
                                                    </div>
                                                    <div className={`text-xs font-bold mt-0.5 ${
                                                        p.is_ready ? 'text-emerald-400' : 'text-slate-500'
                                                    }`}>
                                                        {p.is_ready ? '● Ready to play' : '○ Not ready'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action row */}
                                            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-white/6">
                                                {isMe ? (
                                                    isHostPlayer ? (
                                                        <span className="text-[11px] text-slate-600 italic">Host is always ready</span>
                                                    ) : (
                                                        <motion.button
                                                            onClick={handleToggleReady}
                                                            className={`text-xs font-bold px-4 py-1.5 rounded-lg border transition-all ${
                                                                p.is_ready
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15'
                                                                    : 'bg-white/6 border-white/12 text-slate-300 hover:text-white hover:bg-white/10'
                                                            }`}
                                                            whileTap={{ scale: 0.95 }}
                                                        >
                                                            {p.is_ready ? '✓ Ready' : 'Toggle Ready'}
                                                        </motion.button>
                                                    )
                                                ) : (
                                                    isHost && (
                                                        <motion.button
                                                            onClick={() => handleKickPlayer(p.id)}
                                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-all"
                                                            whileTap={{ scale: 0.95 }}
                                                        >
                                                            Kick
                                                        </motion.button>
                                                    )
                                                )}
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Ready status banner */}
                    <AnimatePresence>
                        {allPlayersReady && (
                            <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                                className="rounded-xl px-5 py-3.5 flex items-center justify-between"
                                style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)' }}
                            >
                                <div className="flex items-center gap-2">
                                    <motion.div
                                        className="w-2.5 h-2.5 rounded-full bg-emerald-400"
                                        animate={{ opacity: [1, 0.3, 1] }}
                                        transition={{ duration: 1.2, repeat: Infinity }}
                                    />
                                    <span className="text-sm font-bold text-emerald-300">All players ready!</span>
                                    {isHost && <span className="text-xs text-emerald-500 ml-1">Press Start Match to begin.</span>}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* RIGHT SIDEBAR: Settings + Chat ─────────────────────────── */}
                <div className="lg:col-span-4 space-y-5">

                    {/* Lobby Rules / Settings panel */}
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="w-4 h-4 text-slate-500" />
                            <h4 className="text-xs font-black text-white uppercase tracking-widest">Lobby Rules</h4>
                        </div>

                        {isHost ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Game Mode</label>
                                    <select
                                        value={playersCount}
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            setPlayersCount(val);
                                            handleUpdateSettings(val, targetScore, isPrivate);
                                        }}
                                        className="input-dark text-sm py-2.5"
                                        style={{ background: 'rgba(9,11,18,0.7)' }}
                                    >
                                        <option value={2}>1 vs 1 Match</option>
                                        <option value={4}>2 vs 2 Teams</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Score</label>
                                    <select
                                        value={targetScore}
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            setTargetScore(val);
                                            handleUpdateSettings(playersCount, val, isPrivate);
                                        }}
                                        className="input-dark text-sm py-2.5"
                                        style={{ background: 'rgba(9,11,18,0.7)' }}
                                    >
                                        <option value={51}>51 Points</option>
                                        <option value={101}>101 Points</option>
                                        <option value={201}>201 Points</option>
                                    </select>
                                </div>

                                <div
                                    className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/7 bg-white/2 cursor-pointer"
                                    onClick={() => {
                                        const val = !isPrivate;
                                        setIsPrivate(val);
                                        handleUpdateSettings(playersCount, targetScore, val);
                                    }}
                                >
                                    <span className="text-xs font-semibold text-slate-400">Private Room</span>
                                    <div className={`w-9 h-5 rounded-full transition-all duration-200 flex items-center px-0.5 ${isPrivate ? 'bg-cyan-500/30 justify-end' : 'bg-white/8 justify-start'}`}>
                                        <div className={`w-3.5 h-3.5 rounded-full transition-colors ${isPrivate ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.p
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="text-xs text-red-400 font-semibold bg-red-500/8 border border-red-500/20 rounded-lg p-2.5"
                                        >
                                            {error}
                                        </motion.p>
                                    )}
                                </AnimatePresence>

                                <motion.button
                                    onClick={handleStartMatch}
                                    disabled={loading || !allPlayersReady}
                                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black tracking-wide transition-all ${
                                        allPlayersReady
                                            ? 'btn-primary'
                                            : 'bg-white/4 border border-white/8 text-slate-600 cursor-not-allowed'
                                    }`}
                                    whileHover={allPlayersReady ? { scale: 1.02 } : {}}
                                    whileTap={allPlayersReady ? { scale: 0.97 } : {}}
                                >
                                    <Play className="w-4 h-4" />
                                    {loading ? 'Starting...' : 'Start Match'}
                                </motion.button>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {[
                                    ['Lobby Host', activeRoom?.players.find(p => p.id === activeRoom.host_id)?.username],
                                    ['Capacity', `${activeRoom?.players_count} Players`],
                                    ['Target Score', `${activeRoom?.target_score} Points`],
                                    ['Visibility', activeRoom?.is_private ? 'Private' : 'Public'],
                                ].map(([label, val]) => (
                                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-white/5">
                                        <span className="text-xs text-slate-500 font-semibold">{label}</span>
                                        <span className="text-xs text-white font-bold">{val}</span>
                                    </div>
                                ))}

                                <div className="mt-3 px-3 py-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15 flex items-center gap-2.5">
                                    <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
                                    <span className="text-xs text-slate-400">Waiting for host to start the match...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat panel */}
                    <div className="glass-panel rounded-2xl p-5 flex flex-col h-72">
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-3 pb-2 border-b border-white/6">
                            Room Chat
                        </h4>

                        <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-0.5 text-xs no-scrollbar">
                            {chatMessages.length === 0 ? (
                                <div className="text-center text-slate-600 mt-8 text-xs">No messages yet. Say hello!</div>
                            ) : (
                                chatMessages.map((msg, idx) => {
                                    const isSystem = msg.type === 'system';
                                    return (
                                        <div key={idx}>
                                            {isSystem ? (
                                                <div className="text-center text-[10px] text-slate-600 italic py-0.5">{msg.message}</div>
                                            ) : (
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="text-[10px] font-black text-cyan-400">{msg.username}</span>
                                                        <span className="text-[9px] text-slate-600">
                                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div className="bg-white/4 border border-white/6 rounded-lg px-2.5 py-1.5 text-slate-300 break-words">
                                                        {msg.message}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-white/6">
                            <input
                                type="text" value={msgText}
                                onChange={e => setMsgText(e.target.value)}
                                placeholder="Type a message..."
                                className="input-dark flex-1 py-2 text-xs"
                            />
                            <motion.button
                                type="submit"
                                className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 hover:bg-cyan-500/25 transition-colors"
                                whileTap={{ scale: 0.9 }}
                            >
                                <Send className="w-3.5 h-3.5" />
                            </motion.button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
