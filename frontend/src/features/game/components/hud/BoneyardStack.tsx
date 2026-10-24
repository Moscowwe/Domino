import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { dominoSlicer } from '../../utils/dominoSlicer';
import { Layers } from 'lucide-react';

interface BoneyardStackProps {
    count: number;
    isDrawing?: boolean;
}

export const BoneyardStack: React.FC<BoneyardStackProps> = ({
    count, isDrawing = false
}) => {
    const backUrl = dominoSlicer.getBackUrl();

    if (count <= 0) {
        return (
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-black/40 border border-white/5 opacity-50 select-none w-full">
                <Layers className="w-5 h-5 text-slate-500 mb-1" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">Boneyard Empty</span>
            </div>
        );
    }

    return (
        <div className={`relative flex flex-col items-center gap-2 select-none p-2.5 rounded-2xl w-full transition-all duration-300 ${
            isDrawing
                ? 'bg-cyan-950/40 border-2 border-cyan-400/60 shadow-[0_0_24px_rgba(0,229,255,0.25)]'
                : 'bg-black/40 border border-white/10 shadow-lg'
        }`}>
            {/* Header: Title + Count */}
            <div className="flex items-center justify-between w-full px-1">
                <div className="flex items-center gap-1.5">
                    <Layers className={`w-3.5 h-3.5 ${isDrawing ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Boneyard
                    </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {count} {count === 1 ? 'tile' : 'tiles'}
                </span>
            </div>

            {/* Tiles standing vertically (بالطول) side-by-side (جنب بعض) */}
            <div className="w-full flex flex-wrap items-center justify-center gap-1 py-1.5 px-0.5 select-none max-h-[140px] overflow-y-auto no-scrollbar pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {Array.from({ length: count }).map((_, idx) => (
                        <motion.div
                            key={`boneyard-tile-${idx}`}
                            layout
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.2, y: -15, rotate: -20 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="relative shrink-0 rounded-[4px] overflow-hidden shadow-md"
                            style={{
                                width: 15,
                                height: 30,
                                background: 'linear-gradient(145deg, #181d28 0%, #0d111a 100%)',
                                border: isDrawing
                                    ? '1px solid rgba(0,229,255,0.6)'
                                    : '1px solid rgba(255,255,255,0.15)',
                                boxShadow: isDrawing
                                    ? '0 2px 6px rgba(0,229,255,0.3)'
                                    : '0 2px 4px rgba(0,0,0,0.4)'
                            }}
                        >
                            {backUrl ? (
                                <img
                                    src={backUrl}
                                    alt="tile"
                                    className="w-full h-full object-cover pointer-events-none"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-between p-0.5">
                                    <div className="w-full h-[45%] rounded-xs bg-white/10" />
                                    <div className="w-2.5 h-[1px] bg-white/20" />
                                    <div className="w-full h-[45%] rounded-xs bg-white/10" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Status indicator */}
            {isDrawing ? (
                <div className="flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[10px] font-black w-full animate-pulse">
                    <span className="text-xs">🔄</span>
                    <span>سحب تلقائي...</span>
                </div>
            ) : (
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider text-center">
                    {count} in pile
                </div>
            )}
        </div>
    );
};
