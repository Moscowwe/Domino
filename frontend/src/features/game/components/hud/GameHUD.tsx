import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw } from 'lucide-react';

interface GameHUDProps {
    mode: '1v1' | '2v2';
    targetScore: number;
    roundNumber: number;
    boneyardCount: number;
    scores: Record<number, number>;
    teamScores?: Record<string, number>;
    players: { id: number; username: string; seat_index: number }[];
    status: string;
    onResetCamera?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
    mode,
    targetScore,
    roundNumber,
    boneyardCount,
    scores,
    teamScores,
    players,
    status,
    onResetCamera
}) => {
    const [ping, setPing] = useState(38);

    // Simulate mild network latency fluctuations for aesthetic realism
    useEffect(() => {
        const interval = setInterval(() => {
            setPing(p => Math.max(15, Math.min(85, p + Math.floor(Math.random() * 9) - 4)));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Helper to get score for a player
    const getPlayerScore = (playerId: number) => scores[playerId] || 0;

    return (
        <div className="w-full flex flex-col md:flex-row justify-between items-center px-6 py-3.5 bg-zinc-950/70 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl space-y-4 md:space-y-0 select-none">
            {/* 1. Score Details Panel */}
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Scoreboard (Target: {targetScore})</span>
                <div className="flex items-center space-x-4 mt-1.5">
                    {mode === '1v1' ? (
                        players.map((p, idx) => (
                            <div key={p.id} className="flex items-center space-x-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-indigo-400' : 'bg-cyan-400'}`} />
                                <span className="text-xs text-zinc-400 font-medium">{p.username}:</span>
                                <span className="text-sm font-black text-white">{getPlayerScore(p.id)}</span>
                            </div>
                        ))
                    ) : (
                        <>
                            <div className="flex items-center space-x-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                <span className="text-xs text-zinc-400 font-medium">Team 1 (Seat 1&3):</span>
                                <span className="text-sm font-black text-white">{teamScores?.['0'] || 0}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                <span className="text-xs text-zinc-400 font-medium">Team 2 (Seat 2&4):</span>
                                <span className="text-sm font-black text-white">{teamScores?.['1'] || 0}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 2. Match Info Badges */}
            <div className="flex items-center space-x-6 bg-zinc-900/40 px-5 py-2 rounded-xl border border-white/5">
                <div className="text-center">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Round</span>
                    <span className="text-base font-black text-cyan-400 font-mono">{roundNumber}</span>
                </div>
                <div className="w-[1px] h-6 bg-white/5 self-center" />
                <div className="text-center">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Boneyard</span>
                    <span className="text-base font-black text-indigo-400 font-mono">{boneyardCount}</span>
                </div>
                <div className="w-[1px] h-6 bg-white/5 self-center" />
                <div className="text-center">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Status</span>
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">{status}</span>
                </div>
            </div>

            {/* 3. Utility Actions & Latency HUD */}
            <div className="flex items-center space-x-4">
                {onResetCamera && (
                    <button
                        onClick={onResetCamera}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reset View</span>
                    </button>
                )}

                <div className="flex items-center space-x-2 bg-white/2 border border-white/5 rounded-lg px-3 py-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-zinc-400 font-mono font-bold">{ping}ms</span>
                </div>
            </div>
        </div>
    );
};
