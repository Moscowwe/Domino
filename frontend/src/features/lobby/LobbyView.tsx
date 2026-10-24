import React, { useState } from 'react';
import { safeParseJson } from '../../utils/api';
import { useGameStore } from '../../store/useGameStore';
import { AvatarIcon } from '../auth/AuthView';
import { LogOut, Plus, LogIn, HelpCircle, ChevronRight, Zap, Users, Lock, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const LobbyView = ({ onViewProfile }: { onViewProfile: () => void }) => {
    const { currentUser, token, clearAuth, setRoom } = useGameStore();
    const [joinCode, setJoinCode] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Create Room state
    const [playersCount, setPlayersCount] = useState(2);
    const [targetScore, setTargetScore] = useState(101);
    const [customScore, setCustomScore] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [roomName, setRoomName] = useState('');

    // AI Match mode and target score
    const [aiMode, setAiMode] = useState<'1v1' | '2v2'>('1v1');
    const [aiTargetScore, setAiTargetScore] = useState<number>(101);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleJoinCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode || joinCode.length !== 6) { setError('Room code must be exactly 6 characters.'); return; }
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/rooms/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ code: joinCode })
            });
            const data = await safeParseJson(res);
            if (!res.ok) throw new Error(data.message || 'Room join failed.');
            setRoom(data);
            window.dispatchEvent(new CustomEvent('domino:navigate', { detail: 'ROOM' }));
        } catch (err: any) {
            setError(err.message || 'Failed to join room.');
        } finally { setLoading(false); }
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault(); setError(''); setLoading(true);
        const score = targetScore === 0 ? parseInt(customScore) : targetScore;
        if (isNaN(score) || score < 10 || score > 500) {
            setError('Target score must be between 10 and 500.'); setLoading(false); return;
        }
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ players_count: playersCount, target_score: score, is_private: isPrivate, name: roomName || undefined })
            });
            const data = await safeParseJson(res);
            if (!res.ok) throw new Error(data.message || 'Room creation failed.');
            setRoom(data); setIsCreateOpen(false);
            window.dispatchEvent(new CustomEvent('domino:navigate', { detail: 'ROOM' }));
        } catch (err: any) {
            setError(err.message || 'Failed to create room.');
        } finally { setLoading(false); }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        } catch (err) { console.error('Logout error:', err); }
        finally { clearAuth(); }
    };

    const handlePlayWithAI = async () => {
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/rooms/bot-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ target_score: aiTargetScore, mode: aiMode })
            });
            const data = await safeParseJson(res);
            if (!res.ok) throw new Error(data.message || 'Failed to start AI match.');
            // Go straight to the game board!
            window.dispatchEvent(new CustomEvent('domino:game_starting', { detail: data.match_id }));
        } catch (err: any) {
            setError(err.message || 'Failed to start AI match.');
        } finally { setLoading(false); }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 select-none">

            {/* ── User Profile Bar ──────────────────────────────────────────── */}
            <motion.div
                className="glass-panel rounded-2xl px-5 py-4 mb-8 flex items-center justify-between"
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <button
                    onClick={onViewProfile}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity active:scale-98"
                >
                    <div className="relative">
                        <div className="w-11 h-11 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center">
                            {currentUser && <AvatarIcon id={currentUser.avatar} className="w-6 h-6" />}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#090B12] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-sm text-white">{currentUser?.username}</div>
                        <div className="text-[11px] text-cyan-400 font-semibold">View Profile & Stats →</div>
                    </div>
                </button>

                <div className="flex items-center gap-3">
                    <motion.button
                        onClick={() => setIsCreateOpen(true)}
                        className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    >
                        <Plus className="w-4 h-4" />
                        Host Room
                    </motion.button>
                    <button
                        onClick={handleLogout}
                        className="btn-danger flex items-center gap-1.5 py-2.5 px-4 text-sm rounded-xl"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>

            {/* Error banner */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Main Grid (Focused on AI Match & Private Rooms) ──────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">

                {/* CARD 1: Play with AI */}
                <motion.div
                    className="glass-panel rounded-3xl p-8 relative overflow-hidden flex flex-col justify-between border border-purple-500/20 shadow-[0_0_40px_rgba(168,85,247,0.1)]"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.02 }}
                >
                    <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/20 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none" />
                    
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                                <Zap className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Play vs AI</h3>
                                <span className="text-xs text-purple-300/80 font-medium">1v1 أو فرق 2v2 مع روبوتات ذكية</span>
                            </div>
                        </div>

                        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                            العب ماتش فردي 1 ضد 1 أو ماتش فرق 2 ضد 2 (أنت وزميل AI ضد فريق مكون من 2 AI) بحساب الفورة وقواعد الدومينو الرسمية.
                        </p>

                        {/* Mode Selector (1v1 vs 2v2) */}
                        <div className="mb-4">
                            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                                نظام اللعب / Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setAiMode('1v1')}
                                    className={`py-2 px-3 rounded-2xl border text-center transition-all ${
                                        aiMode === '1v1'
                                            ? 'bg-purple-500/25 border-purple-400 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                                            : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/20'
                                    }`}
                                >
                                    <div className="font-black text-sm">1 ضد 1 (1v1)</div>
                                    <div className="text-[10px] text-purple-300/80 font-medium">أنت ضد الـ AI</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAiMode('2v2')}
                                    className={`py-2 px-3 rounded-2xl border text-center transition-all ${
                                        aiMode === '2v2'
                                            ? 'bg-purple-500/25 border-purple-400 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                                            : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/20'
                                    }`}
                                >
                                    <div className="font-black text-sm">2 ضد 2 (2v2)</div>
                                    <div className="text-[10px] text-purple-300/80 font-medium">أنت وزميل ضد 2 AI</div>
                                </button>
                            </div>
                        </div>

                        {/* الفورة / Target Score selector */}
                        <div className="mb-5">
                            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                                الفورة / Target Score
                            </label>
                            <div className="grid grid-cols-2 gap-2.5">
                                {[
                                    { value: 101, label: '101 pts', desc: 'الفورة السريعة' },
                                    { value: 201, label: '201 pts', desc: 'الفورة الكلاسيكية' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setAiTargetScore(opt.value)}
                                        className={`py-2 px-3 rounded-2xl border text-center transition-all ${
                                            aiTargetScore === opt.value
                                                ? 'bg-purple-500/25 border-purple-400 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                                                : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="font-black text-sm">{opt.label}</div>
                                        <div className="text-[10px] text-purple-300/80 font-medium">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handlePlayWithAI}
                        disabled={loading}
                        className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-sm font-black tracking-wide shadow-[0_0_25px_rgba(147,51,234,0.45)] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.98]"
                    >
                        <Zap className="w-5 h-5" />
                        Start AI Match ({aiMode} · {aiTargetScore} pts)
                    </button>
                </motion.div>

                {/* CARD 2: Join or Host Private Room */}
                <motion.div
                    className="glass-panel rounded-3xl p-8 relative overflow-hidden flex flex-col justify-between border border-cyan-500/20 shadow-[0_0_40px_rgba(0,229,255,0.08)]"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.06 }}
                >
                    <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/15 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none" />

                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.25)]">
                                <LogIn className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Private Room</h3>
                                <span className="text-xs text-cyan-300/80 font-medium">Play with Friends</span>
                            </div>
                        </div>

                        <form onSubmit={handleJoinCodeSubmit} className="space-y-4 mb-4">
                            <input
                                type="text" maxLength={6} value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="ROOM CODE"
                                className="input-dark text-center text-2xl font-black font-mono tracking-[0.4em] uppercase py-3.5 border-white/15 focus:border-cyan-400"
                                style={{ letterSpacing: '0.4em' }}
                            />
                            <button
                                type="submit"
                                disabled={loading || joinCode.length !== 6}
                                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none rounded-xl"
                            >
                                <ChevronRight className="w-4 h-4" />
                                Join Room With Code
                            </button>
                        </form>
                    </div>

                    <div className="pt-2 border-t border-white/8 flex items-center justify-between text-xs text-slate-400">
                        <span>Want to host a new game?</span>
                        <button
                            type="button"
                            onClick={() => setIsCreateOpen(true)}
                            className="text-cyan-400 font-bold hover:underline"
                        >
                            + Create Room
                        </button>
                    </div>
                </motion.div>

                {/* FULL WIDTH: Rules & Mechanics */}
                <motion.div
                    className="md:col-span-2 glass-panel rounded-3xl p-6 border border-white/10"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                >
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center">
                            <HelpCircle className="w-4 h-4 text-yellow-400" />
                        </div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">Official Domino Rules</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
                        <div className="p-3.5 rounded-2xl bg-white/3 border border-white/6">
                            <div className="font-bold text-cyan-400 mb-1">1. Deal & First Move</div>
                            Double-Six set (28 tiles). 7 tiles dealt to each player. In Round 1, the player with the highest double starts the game.
                        </div>
                        <div className="p-3.5 rounded-2xl bg-white/3 border border-white/6">
                            <div className="font-bold text-amber-400 mb-1">2. Must Draw When Blocked</div>
                            In 2-player mode, if you cannot play, you MUST keep drawing from the boneyard until you find a matching tile. Passing is only allowed when the boneyard is empty!
                        </div>
                        <div className="p-3.5 rounded-2xl bg-white/3 border border-white/6">
                            <div className="font-bold text-emerald-400 mb-1">3. Round Victory & Scoring</div>
                            The first player to empty their hand wins the round! All dots remaining in the opponent's hand are counted and awarded to the winner's match score.
                        </div>
                    </div>
                </motion.div>

            </div>

            {/* ── Create Room Modal ─────────────────────────────────────────── */}
            <AnimatePresence>
                {isCreateOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={() => setIsCreateOpen(false)}
                        />

                        <motion.div
                            className="relative w-full max-w-md glass-panel rounded-[24px] overflow-hidden"
                            initial={{ scale: 0.92, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 280 }}
                        >
                            {/* Top accent */}
                            <div className="h-[2px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

                            <div className="p-7">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                                        <Plus className="w-4.5 h-4.5 text-cyan-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-white">Host a New Room</h3>
                                </div>

                                <form onSubmit={handleCreateRoom} className="space-y-5">
                                    {/* Room Name */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Room Name (optional)</label>
                                        <input
                                            type="text" maxLength={50} value={roomName}
                                            onChange={e => setRoomName(e.target.value)}
                                            placeholder="e.g. Friday Night Dominos"
                                            className="input-dark"
                                        />
                                    </div>

                                    {/* Game Mode */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Game Mode</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { val: 2, label: '1 vs 1', sub: '2 players', icon: Zap },
                                                { val: 4, label: '2 vs 2', sub: '4 players (Teams)', icon: Users }
                                            ].map(({ val, label, sub, icon: Icon }) => {
                                                const active = playersCount === val;
                                                return (
                                                    <button
                                                        key={val} type="button"
                                                        onClick={() => setPlayersCount(val)}
                                                        className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
                                                            active
                                                                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_16px_rgba(0,229,255,0.1)]'
                                                                : 'bg-white/3 border-white/8 hover:border-white/14'
                                                        }`}
                                                    >
                                                        <Icon className={`w-4 h-4 mb-2 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
                                                        <div className={`text-sm font-black ${active ? 'text-cyan-300' : 'text-slate-400'}`}>{label}</div>
                                                        <div className="text-[11px] text-slate-600">{sub}</div>
                                                        {active && (
                                                            <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center">
                                                                <div className="w-2 h-2 rounded-full bg-[#090B12]" />
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Target Score */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Score</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[51, 101, 201, 0].map(score => (
                                                <button
                                                    key={score} type="button"
                                                    onClick={() => { setTargetScore(score); setCustomScore(''); }}
                                                    className={`py-2.5 rounded-xl border text-xs font-black transition-all ${
                                                        targetScore === score
                                                            ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                                                            : 'bg-white/3 border-white/8 text-slate-500 hover:border-white/14'
                                                    }`}
                                                >
                                                    {score === 0 ? 'Custom' : score}
                                                </button>
                                            ))}
                                        </div>
                                        {targetScore === 0 && (
                                            <input
                                                type="number" required min={10} max={500}
                                                value={customScore} onChange={e => setCustomScore(e.target.value)}
                                                placeholder="Enter score (10–500)"
                                                className="input-dark mt-2"
                                            />
                                        )}
                                    </div>

                                    {/* Private toggle */}
                                    <div
                                        className="flex items-center justify-between p-3.5 rounded-xl border border-white/7 bg-white/3 cursor-pointer"
                                        onClick={() => setIsPrivate(!isPrivate)}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            {isPrivate ? <Lock className="w-4 h-4 text-yellow-400" /> : <Globe className="w-4 h-4 text-slate-500" />}
                                            <div>
                                                <div className="text-sm font-bold text-white">
                                                    {isPrivate ? 'Private Room' : 'Public Room'}
                                                </div>
                                                <div className="text-[11px] text-slate-500">
                                                    {isPrivate ? 'Only via room code' : 'Listed publicly'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-10 h-5.5 rounded-full border transition-all duration-200 flex items-center ${isPrivate ? 'bg-cyan-500/20 border-cyan-500/40 justify-end' : 'bg-white/6 border-white/10 justify-start'} px-0.5`}>
                                            <div className={`w-4 h-4 rounded-full transition-colors ${isPrivate ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="text-xs text-red-400 font-semibold px-1">{error}</p>
                                    )}

                                    <div className="flex gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsCreateOpen(false)}
                                            className="btn-ghost flex-1 py-3 text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <motion.button
                                            type="submit"
                                            disabled={loading}
                                            className="btn-primary flex-1 py-3 text-sm disabled:opacity-50 disabled:pointer-events-none"
                                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                        >
                                            {loading ? 'Creating...' : 'Create Room'}
                                        </motion.button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
