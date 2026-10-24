import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, AlertTriangle, Trophy } from 'lucide-react';
import { DominoTile } from '../domino/DominoTile';

interface MatchOverlaysProps {
    currentUser: { id: number; username: string } | null;
    players: { id: number; username: string }[];
    mode: '1v1' | '2v2';
    reconnectCountdown: number | null;
    roundResult: any | null;
    matchResult: any | null;
    onContinueRound: () => void;
    onReturnToLobby: () => void;
}

// Animated confetti particle
const ConfettiParticle = ({ x, color }: { x: string; color: string }) => (
    <motion.div
        className="absolute w-2 h-2 rounded-sm"
        style={{ left: x, top: '-10px', background: color }}
        initial={{ y: 0, rotate: 0, opacity: 1 }}
        animate={{ y: '100vh', rotate: 720, opacity: [1, 1, 0] }}
        transition={{ duration: 2.5 + Math.random(), ease: 'easeIn', delay: Math.random() * 0.8 }}
    />
);

export const MatchOverlays: React.FC<MatchOverlaysProps> = ({
    currentUser, players, mode,
    reconnectCountdown, roundResult, matchResult,
    onContinueRound, onReturnToLobby
}) => {
    const confettiColors = ['#00E5FF', '#FFC857', '#FF5A5F', '#34D399', '#A78BFA'];
    const confettiItems = Array.from({ length: 30 }, (_, i) => ({
        x: `${Math.random() * 100}%`,
        color: confettiColors[i % confettiColors.length]
    }));

    return (
        <>
            <AnimatePresence>
                {/* ── 1. DISCONNECTION PAUSE ─────────────────────────────── */}
                {reconnectCountdown !== null && (
                    <motion.div
                        key="reconnect"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md p-8 rounded-[24px] text-center relative overflow-hidden"
                            style={{
                                background: 'rgba(13,18,32,0.95)',
                                border: '1px solid rgba(255,90,95,0.3)',
                                boxShadow: '0 0 60px rgba(255,90,95,0.1), 0 24px 64px rgba(0,0,0,0.8)'
                            }}
                        >
                            {/* Top accent */}
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/70 to-transparent" />

                            <motion.div
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            >
                                <AlertTriangle className="w-14 h-14 text-red-400 mx-auto mb-4" />
                            </motion.div>
                            <h3 className="text-2xl font-black text-white tracking-wide uppercase">MATCH PAUSED</h3>
                            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                                A player disconnected. Waiting for them to reconnect.
                            </p>

                            <div className="mt-6 py-4 px-6 rounded-2xl mx-auto max-w-[200px]"
                                style={{ background: 'rgba(255,90,95,0.08)', border: '1px solid rgba(255,90,95,0.2)' }}>
                                <span className="text-[10px] text-red-500 font-black uppercase tracking-widest block mb-1">Bot takeover in</span>
                                <motion.span
                                    className="text-4xl font-black font-mono text-red-400 block"
                                    animate={{ opacity: [1, 0.5, 1] }}
                                    transition={{ duration: 1, repeat: Infinity }}
                                >
                                    {reconnectCountdown}s
                                </motion.span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* ── 2. ROUND END ──────────────────────────────────────── */}
                {roundResult && (
                    <motion.div
                        key="roundResult"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md px-4 py-6 overflow-y-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.88, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.88, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 280 }}
                            className="w-full max-w-lg p-6 md:p-8 rounded-[28px] relative overflow-hidden text-center"
                            style={{
                                background: 'rgba(13,18,32,0.98)',
                                border: '1px solid rgba(0,229,255,0.25)',
                                boxShadow: '0 0 50px rgba(0,229,255,0.1), 0 24px 64px rgba(0,0,0,0.85)'
                            }}
                        >
                            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
                            >
                                <Award className="w-14 h-14 mx-auto mb-3"
                                    style={{ color: roundResult.winner_id === currentUser?.id ? '#FFC857' : '#00E5FF' }} />
                            </motion.div>

                            <h3 className="text-2xl font-black text-white uppercase tracking-wider">
                                {roundResult.winner_id === currentUser?.id ? '🎉 Round Won!' : 'Round Finished'}
                            </h3>

                            <p className="text-xs text-slate-400 mt-1 mb-5">
                                {roundResult.winner_name || (roundResult.winner_id === currentUser?.id ? 'You' : 'Opponent')} emptied their hand first and won the round!
                            </p>

                            {/* Opponent's Remaining Hand Reveal & Count */}
                            {roundResult.loser_hand && roundResult.loser_hand.length > 0 && (
                                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-left mb-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                                            {roundResult.loser_name || 'Opponent'}'s Remaining Tiles:
                                        </span>
                                        <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                                            {roundResult.loser_hand.length} {roundResult.loser_hand.length === 1 ? 'tile' : 'tiles'} left
                                        </span>
                                    </div>

                                    {/* Tiles row */}
                                    <div className="flex items-center gap-2.5 overflow-x-auto py-2 px-1 scrollbar-none">
                                        {roundResult.loser_hand.map((tile: number[], idx: number) => {
                                            const pips = tile[0] + tile[1];
                                            return (
                                                <div key={idx} className="flex flex-col items-center gap-1 shrink-0">
                                                    <DominoTile left={tile[0]} right={tile[1]} size="sm" isPlayable={true} />
                                                    <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                                                        +{pips}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pip calculation formula */}
                                    <div className="mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between text-xs">
                                        <span className="text-slate-400 font-medium">Pip Count Sum:</span>
                                        <span className="font-mono text-white">
                                            {roundResult.loser_hand.map((t: number[]) => t[0] + t[1]).join(' + ')} = <span className="text-yellow-400 font-black text-sm">+{roundResult.points_awarded} pts</span>
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Outcome summary bar */}
                            <div className="p-4 rounded-xl space-y-2.5 text-left mb-5"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Winning Condition</span>
                                    <span className="text-white font-bold capitalize">{roundResult.reason === 'domino' ? 'Finished Hand (Domino!)' : roundResult.reason?.replace('_', ' ')}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">Points Awarded to Winner</span>
                                    <span className="text-yellow-400 font-black text-base font-mono">+{roundResult.points_awarded} pts</span>
                                </div>
                                {(roundResult.team_scores || roundResult.scores) && (
                                    <div className="flex justify-between items-center text-xs pt-2 border-t border-white/6">
                                        <span className="text-slate-400">Match Score</span>
                                        <span className="text-white font-black font-mono">
                                            {roundResult.team_scores 
                                                ? `فريقك: ${roundResult.team_scores['0'] ?? 0} · الخصوم: ${roundResult.team_scores['1'] ?? 0}`
                                                : `You: ${roundResult.scores['1'] ?? 0} · AI: ${roundResult.scores['999'] ?? 0}`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Check if match target has been achieved */}
                            {((roundResult.team_scores && ((roundResult.team_scores['0'] ?? 0) >= (roundResult.target_score || 101) || (roundResult.team_scores['1'] ?? 0) >= (roundResult.target_score || 101))) ||
                              (roundResult.scores && ((roundResult.scores['1'] ?? 0) >= (roundResult.target_score || 101) || (roundResult.scores['999'] ?? 0) >= (roundResult.target_score || 101))) ||
                              roundResult.is_match_over) ? (
                                <div className="space-y-3">
                                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-2">
                                        <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                                        <span>انتهت الفورة! تم الوصول إلى الحد المطلوب ({roundResult.target_score || 101} نقطة)</span>
                                    </div>
                                    <motion.button
                                        onClick={onContinueRound}
                                        className="w-full py-3.5 text-sm font-black tracking-wide rounded-xl shadow-[0_0_24px_rgba(255,200,87,0.45)] bg-gradient-to-r from-amber-500 to-yellow-400 text-black hover:brightness-110 uppercase"
                                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                    >
                                        🏆 View Match Results (Finished) →
                                    </motion.button>
                                </div>
                            ) : (
                                <motion.button
                                    onClick={onContinueRound}
                                    className="btn-primary w-full py-3.5 text-sm font-black tracking-wide rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                >
                                    Start Next Round →
                                </motion.button>
                            )}
                        </motion.div>
                    </motion.div>
                )}

                {/* ── 3. MATCH END ──────────────────────────────────────── */}
                {matchResult && (
                    <motion.div
                        key="matchResult"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 flex items-center justify-center bg-black/88 backdrop-blur-md px-4 py-8 overflow-y-auto"
                    >
                        {/* Confetti for winner */}
                        {matchResult.winner_id === currentUser?.id && (
                            <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
                                {confettiItems.map((item, i) => (
                                    <ConfettiParticle key={i} x={item.x} color={item.color} />
                                ))}
                            </div>
                        )}

                        <motion.div
                            initial={{ scale: 0.88, opacity: 0, y: 24 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.88, opacity: 0, y: 24 }}
                            transition={{ type: 'spring', damping: 18, stiffness: 240 }}
                            className="relative w-full max-w-lg p-8 rounded-[28px] text-center my-auto overflow-hidden"
                            style={{
                                background: 'rgba(9,11,18,0.98)',
                                border: matchResult.winner_id === currentUser?.id
                                    ? '1px solid rgba(255,200,87,0.3)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                boxShadow: matchResult.winner_id === currentUser?.id
                                    ? '0 0 60px rgba(255,200,87,0.12), 0 24px 80px rgba(0,0,0,0.8)'
                                    : '0 0 40px rgba(0,0,0,0.8)'
                            }}
                        >
                            {/* Top accent */}
                            <div className="absolute top-0 left-0 right-0 h-[2px]"
                                style={{
                                    background: matchResult.winner_id === currentUser?.id
                                        ? 'linear-gradient(90deg, transparent, rgba(255,200,87,0.8), transparent)'
                                        : 'linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent)'
                                }}
                            />

                            <motion.div
                                initial={{ scale: 0, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ type: 'spring', damping: 10, stiffness: 180, delay: 0.15 }}
                            >
                                <Trophy
                                    className="w-16 h-16 mx-auto mb-4"
                                    style={{
                                        color: matchResult.winner_id === currentUser?.id ? '#FFC857' : '#94A3B8',
                                        filter: matchResult.winner_id === currentUser?.id
                                            ? 'drop-shadow(0 0 16px rgba(255,200,87,0.6))'
                                            : 'none'
                                    }}
                                />
                            </motion.div>

                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                                <Trophy className="w-3.5 h-3.5" />
                                <span>MATCH FINISHED · الفورة اكتملت</span>
                            </div>

                            <h3 className="text-3xl font-black uppercase tracking-widest mt-1"
                                style={{
                                    color: matchResult.winner_id === currentUser?.id ? '#FFC857' : '#FFFFFF',
                                    textShadow: matchResult.winner_id === currentUser?.id
                                        ? '0 0 24px rgba(255,200,87,0.5)'
                                        : 'none'
                                }}
                            >
                                {matchResult.winner_id === currentUser?.id ? '🏆 FINISHED - VICTORY!' : '🏁 FINISHED - MATCH OVER'}
                            </h3>

                            <p className="text-amber-200 text-sm mt-2 font-bold">
                                {matchResult.winner_id === currentUser?.id
                                    ? `مبروك الفوز! حسمت الفورة بالوصول إلى ${matchResult.scores?.[currentUser?.id || 1] ?? 0} نقطة (الهدف: ${matchResult.target_score || 101}).`
                                    : `انتهت الفورة! فاز ${matchResult.winner_name || 'Domino AI'} بالوصول لـ ${matchResult.scores?.[999] ?? 0} نقطة.`}
                            </p>

                            {/* Stats grid */}
                            <div className="grid grid-cols-2 gap-3 mt-6">
                                {[
                                    ['Target Score', `${matchResult.target_score || 101} pts`],
                                    ['Final Score', matchResult.team_scores 
                                        ? `فريقك: ${matchResult.team_scores['0'] ?? 0} | الخصوم: ${matchResult.team_scores['1'] ?? 0}`
                                        : `You: ${matchResult.scores?.['1'] ?? 0} | AI: ${matchResult.scores?.['999'] ?? 0}`],
                                    ['Mode', `${mode} Match`],
                                    ['Duration', `${Math.floor((matchResult.duration_seconds || 0) / 60)}m ${(matchResult.duration_seconds || 0) % 60}s`],
                                ].map(([label, val]) => (
                                    <div key={label} className="p-3 rounded-xl text-left"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{label}</div>
                                        <div className="text-xs font-bold text-white mt-0.5">{val}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Round history */}
                            {matchResult.round_history && matchResult.round_history.length > 0 && (
                                <div className="mt-5 text-left">
                                    <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2.5">Round Breakdown</h4>
                                    <div className="max-h-36 overflow-y-auto rounded-xl divide-y no-scrollbar"
                                        style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)' }}>
                                        {matchResult.round_history.map((r: any) => {
                                            const winner = players.find(p => p.id === r.winner_id);
                                            return (
                                                <div key={r.round_number} className="flex justify-between items-center px-4 py-2.5 text-xs"
                                                    style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                                    <span className="text-slate-600 font-mono font-bold">R{r.round_number}</span>
                                                    <span className="text-white font-semibold truncate max-w-[110px]">
                                                        {winner ? winner.username : 'Tie'}
                                                    </span>
                                                    <span className="font-black font-mono text-yellow-400">+{r.points_awarded}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <motion.button
                                onClick={onReturnToLobby}
                                className="w-full mt-6 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all"
                                style={{
                                    background: matchResult.winner_id === currentUser?.id
                                        ? 'linear-gradient(135deg, #E8A800, #FFC857)'
                                        : 'rgba(0,229,255,0.12)',
                                    color: matchResult.winner_id === currentUser?.id ? '#090B12' : '#00E5FF',
                                    border: matchResult.winner_id === currentUser?.id
                                        ? 'none'
                                        : '1px solid rgba(0,229,255,0.25)',
                                    boxShadow: matchResult.winner_id === currentUser?.id
                                        ? '0 0 24px rgba(255,200,87,0.25)'
                                        : '0 0 12px rgba(0,229,255,0.1)'
                                }}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                            >
                                Return to Lobby
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
