import React from 'react';
import { motion } from 'framer-motion';
import { AvatarIcon } from '../../../auth/AuthView';
import { dominoSlicer } from '../../utils/dominoSlicer';
import { WifiOff, Trophy } from 'lucide-react';

interface OpponentPlayer {
    id: number;
    username: string;
    avatar: string;
    tile_count: number;
    is_connected: boolean;
    is_bot?: boolean;
}

interface OpponentHandProps {
    player: OpponentPlayer;
    isActiveTurn: boolean;
    secondsLeft?: number;
    position?: 'top' | 'left' | 'right' | 'sidebar';
    score?: number;
    targetScore?: number;
    isTeammate?: boolean;
}

export const OpponentHand: React.FC<OpponentHandProps> = React.memo(({
    player,
    isActiveTurn,
    secondsLeft = 25,
    position = 'top',
    score = 0,
    targetScore,
    isTeammate = false
}) => {
    const backUrl = dominoSlicer.getBackUrl();
    const tileDisplayCount = Math.min(10, player.tile_count);

    if (position === 'sidebar') {
        return (
            <motion.div
                className="w-full glass-panel rounded-2xl p-2.5 flex flex-col items-center gap-2 border transition-all duration-300 relative overflow-hidden"
                style={{
                    background: isActiveTurn 
                        ? (isTeammate ? 'rgba(0,229,255,0.12)' : 'rgba(234,179,8,0.12)')
                        : 'rgba(255,255,255,0.04)',
                    borderColor: isActiveTurn 
                        ? (isTeammate ? 'rgba(0,229,255,0.5)' : 'rgba(234,179,8,0.5)')
                        : 'rgba(255,255,255,0.08)',
                    boxShadow: isActiveTurn 
                        ? (isTeammate ? '0 0 20px rgba(0,229,255,0.2)' : '0 0 20px rgba(234,179,8,0.2)')
                        : 'none'
                }}
                animate={isActiveTurn ? {
                    boxShadow: [
                        '0 0 10px rgba(234,179,8,0.1)',
                        '0 0 22px rgba(234,179,8,0.3)',
                        '0 0 10px rgba(234,179,8,0.1)'
                    ]
                } : {}}
                transition={{ duration: 1.8, repeat: Infinity }}
            >
                {/* Top row: Avatar + Name & Status */}
                <div className="flex items-center gap-2 w-full">
                    {/* Avatar with active timer */}
                    <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                            isActiveTurn
                                ? (isTeammate ? 'bg-cyan-500/20 border-cyan-500/40' : 'bg-yellow-500/20 border-yellow-500/40')
                                : 'bg-white/6 border-white/10'
                        }`}>
                            <AvatarIcon id={player.avatar} className="w-5 h-5" />
                        </div>
                        {/* Active timer badge */}
                        {isActiveTurn && player.is_connected && (
                            <motion.div
                                className={`absolute -top-1.5 -left-1.5 ${isTeammate ? 'bg-cyan-400' : 'bg-yellow-400'} text-black font-black text-[8px] px-1 py-0.2 rounded-full border border-black z-10`}
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                            >
                                {secondsLeft}s
                            </motion.div>
                        )}
                    </div>

                    <div className="text-left flex-1 min-w-0">
                        <div className="font-bold text-[11px] text-white truncate">
                            {player.username}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[7.5px] font-black ${
                                isTeammate 
                                    ? 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30' 
                                    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                            } border px-1 rounded`}>
                                {isTeammate ? 'TEAMMATE' : 'RIVAL · خصم'}
                            </span>
                            <span className={`text-[9px] font-bold ${player.is_connected ? 'text-emerald-400' : 'text-red-400'}`}>
                                {player.tile_count}T
                            </span>
                        </div>
                    </div>
                </div>

                {/* Score pill */}
                <div className={`w-full flex items-center justify-between px-2 py-1 rounded-xl ${
                    isTeammate 
                        ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' 
                        : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                } border font-mono text-xs font-black`}>
                    <div className="flex items-center gap-1">
                        <Trophy className={`w-3 h-3 ${isTeammate ? 'text-cyan-400' : 'text-yellow-400'}`} />
                        <span>{score}</span>
                    </div>
                    {targetScore && <span className="text-[9px] opacity-75">/{targetScore}</span>}
                </div>

                {/* Facedown tiles row */}
                {player.tile_count > 0 && (
                    <div className="flex items-center justify-center w-full pt-0.5">
                        {Array.from({ length: tileDisplayCount }).map((_, idx) => (
                            <div
                                key={idx}
                                className="relative rounded-sm overflow-hidden shadow-md"
                                style={{
                                    width: '13px',
                                    height: '26px',
                                    marginLeft: idx === 0 ? 0 : '-6px',
                                    zIndex: idx,
                                    background: 'rgba(9,11,18,0.9)',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}
                            >
                                {backUrl && (
                                    <img src={backUrl} alt="tile" className="w-full h-full object-cover scale-[1.05]" />
                                )}
                            </div>
                        ))}
                        {player.tile_count > 10 && (
                            <span className="text-[8px] text-slate-500 font-bold ml-1">+{player.tile_count - 10}</span>
                        )}
                    </div>
                )}
            </motion.div>
        );
    }

    return (
        <div className={`flex ${position === 'top' ? 'flex-col items-center gap-2.5' : 'flex-row items-center gap-3'}`}>
            {/* Profile Card */}
            <motion.div
                className="relative flex items-center gap-3 rounded-2xl px-4 py-2.5 border transition-all duration-300"
                style={{
                    background: isActiveTurn 
                        ? (isTeammate ? 'rgba(0,229,255,0.1)' : 'rgba(234,179,8,0.08)')
                        : (isTeammate ? 'rgba(0,229,255,0.04)' : 'rgba(255,255,255,0.04)'),
                    borderColor: isActiveTurn 
                        ? (isTeammate ? 'rgba(0,229,255,0.45)' : 'rgba(234,179,8,0.45)')
                        : (isTeammate ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.07)'),
                    backdropFilter: 'blur(16px)',
                    boxShadow: isActiveTurn 
                        ? (isTeammate ? '0 0 20px rgba(0,229,255,0.15)' : '0 0 20px rgba(234,179,8,0.15)')
                        : '0 4px 16px rgba(0,0,0,0.3)'
                }}
                animate={isActiveTurn ? {
                    boxShadow: [
                        '0 0 10px rgba(0,229,255,0.1)',
                        '0 0 20px rgba(0,229,255,0.25)',
                        '0 0 10px rgba(0,229,255,0.1)'
                    ]
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
            >
                {/* Active pulse ring */}
                {isActiveTurn && (
                    <motion.div
                        className={`absolute inset-0 rounded-2xl border ${isTeammate ? 'border-cyan-400/50' : 'border-yellow-400/50'} pointer-events-none`}
                        animate={{ opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                    />
                )}

                {/* Avatar with timer overlay */}
                <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                        isActiveTurn
                            ? (isTeammate ? 'bg-cyan-500/15 border-cyan-500/40' : 'bg-yellow-500/15 border-yellow-500/40')
                            : (isTeammate ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-white/6 border-white/10')
                    }`}>
                        <AvatarIcon id={player.avatar} className="w-6 h-6" />
                    </div>

                    {/* Connection dot */}
                    <div
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#090B12]"
                        style={{ background: player.is_connected ? '#34D399' : '#FF5A5F' }}
                    />

                    {/* Active timer badge */}
                    {isActiveTurn && player.is_connected && (
                        <motion.div
                            className={`absolute -top-2 -left-2 ${isTeammate ? 'bg-cyan-500 text-black' : 'bg-yellow-400 text-black'} font-black text-[9px] px-1.5 py-0.5 rounded-full border border-[#090B12] z-10 leading-tight`}
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                        >
                            {secondsLeft}s
                        </motion.div>
                    )}
                </div>

                <div className="text-left min-w-[65px]">
                    <div className="font-bold text-xs text-white flex items-center gap-1.5 flex-wrap">
                        <span className="truncate max-w-[80px]">{player.username}</span>
                        {isTeammate ? (
                            <span className="text-[8px] font-black text-cyan-300 bg-cyan-500/20 border border-cyan-500/40 px-1 rounded tracking-wider">TEAMMATE</span>
                        ) : player.is_bot ? (
                            <span className="text-[8px] font-black text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1 rounded tracking-wider">BOT</span>
                        ) : null}
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-1.5">
                        <span className={`font-bold ${player.is_connected ? 'text-emerald-400' : 'text-red-400'}`}>
                            {player.tile_count} tiles
                        </span>
                        {!player.is_connected && <WifiOff className="w-2.5 h-2.5 text-red-400" />}
                    </div>
                </div>

                {/* Score Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${
                    isTeammate
                        ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                        : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.15)]'
                } border font-mono font-black text-xs shrink-0`}>
                    <Trophy className={`w-3.5 h-3.5 ${isTeammate ? 'text-cyan-400' : 'text-yellow-400'}`} />
                    <span className="text-white font-black">{score}</span>
                    {targetScore ? (
                        <span className={`text-[10px] ${isTeammate ? 'text-cyan-400' : 'text-yellow-400'} font-bold`}>/ {targetScore} pts</span>
                    ) : (
                        <span className="text-[9px] opacity-80 font-semibold">pts</span>
                    )}
                </div>

                {/* Thinking dots */}
                {isActiveTurn && (
                    <div className="flex items-center gap-0.5 ml-1">
                        {[0, 1, 2].map(i => (
                            <motion.div
                                key={i}
                                className="w-1 h-1 rounded-full bg-cyan-400"
                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                            />
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Facedown tile stack */}
            {player.tile_count > 0 && (
                <div className={`flex items-center ${position === 'top' ? 'justify-center' : ''}`}
                    style={{ gap: '-10px' }}>
                    {Array.from({ length: tileDisplayCount }).map((_, idx) => (
                        <motion.div
                            key={idx}
                            className="relative rounded-sm overflow-hidden shadow-lg"
                            style={{
                                width: '18px',
                                height: '36px',
                                marginLeft: idx === 0 ? 0 : '-8px',
                                zIndex: idx,
                                background: 'rgba(9,11,18,0.9)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                boxShadow: '2px 2px 6px rgba(0,0,0,0.6)'
                            }}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                        >
                            {backUrl && (
                                <img src={backUrl} alt="tile back" className="w-full h-full object-cover scale-[1.05] pointer-events-none" />
                            )}
                        </motion.div>
                    ))}
                    {player.tile_count > 10 && (
                        <div className="text-[10px] text-slate-500 font-bold pl-2">+{player.tile_count - 10}</div>
                    )}
                </div>
            )}
        </div>
    );
});

OpponentHand.displayName = 'OpponentHand';
