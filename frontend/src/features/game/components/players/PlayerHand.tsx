import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DominoTile } from '../domino/DominoTile';

interface PlayerHandProps {
    hand: number[][];       // [[L, R], ...]
    playableTiles: boolean[];
    selectedTile: number[] | null;
    draggedTile: number[] | null;
    onSelectTile: (tile: number[] | null) => void;
    onPointerDown: (e: React.PointerEvent, tile: number[]) => void;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
    hand, playableTiles, selectedTile, draggedTile, onSelectTile, onPointerDown
}) => {
    const isTileSelected = (tile: number[]) =>
        selectedTile !== null && selectedTile[0] === tile[0] && selectedTile[1] === tile[1];

    const hasAnyPlayable = playableTiles.some(Boolean);

    return (
        <div className="w-full flex flex-col items-center">
            {/* Status hint */}
            <AnimatePresence>
                {hand.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600"
                    >
                        {hasAnyPlayable
                            ? <span className="text-cyan-400/80">Tap or drag a glowing tile to play</span>
                            : <span className="text-slate-600">No playable tiles — draw from the pile</span>
                        }
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hand tray */}
            <div
                className="w-full max-w-4xl overflow-x-auto no-scrollbar px-4"
                style={{
                    background: 'rgba(0,0,0,0.25)',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '20px 20px 0 0',
                    paddingTop: '12px',
                    paddingBottom: '8px',
                }}
            >
                <motion.div layout className="flex items-end justify-center gap-2 md:gap-3 min-h-[90px]">
                    <AnimatePresence mode="popLayout">
                    {hand.length === 0 ? (
                        <motion.div key="empty" exit={{ opacity: 0 }} className="text-xs text-slate-600 italic py-6">Your hand is empty</motion.div>
                    ) : (
                        hand.map((tile, idx) => {
                            const isPlayable = playableTiles[idx] ?? false;
                            const isSelected = isTileSelected(tile);
                            const isBeingDragged = draggedTile && draggedTile[0] === tile[0] && draggedTile[1] === tile[1];

                            return (
                                <motion.div
                                    key={`${tile[0]}-${tile[1]}`} // Unique tile signature for layout animations
                                    layout
                                    initial={{ scale: 0.6, y: 60, opacity: 0 }}
                                    animate={{ scale: 1, y: 0, opacity: 1 }}
                                    exit={{ scale: 0.5, y: -40, opacity: 0 }}
                                    transition={{ 
                                        layout: { type: 'spring', stiffness: 220, damping: 18, bounce: 0.4 },
                                        type: 'spring', stiffness: 260, damping: 22, delay: idx * 0.03 
                                    }}
                                    style={{
                                        // Fan-arc effect: slight rotation toward center
                                        transform: `rotate(${(idx - (hand.length - 1) / 2) * 1.5}deg)`,
                                        opacity: isBeingDragged ? 0 : 1
                                    }}
                                >
                                    <DominoTile
                                        left={tile[0]}
                                        right={tile[1]}
                                        isPlayable={isPlayable}
                                        isSelected={isSelected}
                                        onClick={() => {
                                            if (!isPlayable) return;
                                            if (isSelected) onSelectTile(null);
                                            else onSelectTile(tile);
                                        }}
                                        onPointerDown={(e) => {
                                            if (!isPlayable) return;
                                            onPointerDown(e, tile);
                                        }}
                                        size="lg"
                                    />
                                </motion.div>
                            );
                        })
                    )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
};
