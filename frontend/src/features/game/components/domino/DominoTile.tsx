import React, { useMemo } from 'react';
import { motion, useMotionValue, useVelocity, useTransform } from 'framer-motion';
import { dominoSlicer } from '../../utils/dominoSlicer';

interface DominoTileProps {
    left: number;
    right: number;
    isPlayable?: boolean;
    isSelected?: boolean;
    isDragging?: boolean;
    rotation?: number;
    onClick?: () => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
    sm: { w: 22, h: 44 },
    md: { w: 34, h: 68 },
    lg: { w: 44, h: 88 },
};

export const DominoTile: React.FC<DominoTileProps> = React.memo(({
    left, right,
    isPlayable = false,
    isSelected = false,
    rotation = 0,
    onClick,
    onPointerDown,
    size = 'md'
}) => {
    const tileUrl = dominoSlicer.getTileUrl(left, right);
    const { w, h } = SIZES[size];

    // --- Velocity-based tilt during drag ---
    // Track the x position as a motion value so we can derive velocity from it
    const x = useMotionValue(0);
    const xVelocity = useVelocity(x);
    // Map drag velocity [-800, 800] px/s → tilt [-15°, 15°]
    const tiltRotate = useTransform(xVelocity, [-800, 0, 800], [-15, 0, 15]);

    // Anti-gravity random offsets
    const floatDelay = useMemo(() => Math.random() * -3, []);
    const floatDuration = useMemo(() => 2.5 + Math.random() * 0.8, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isPlayable) return;
        if (onPointerDown) onPointerDown(e);
    };

    return (
        <div
            style={{ width: w, height: h, opacity: isPlayable ? 1 : 0.38, flexShrink: 0 }}
            onPointerDown={handlePointerDown}
            className={`select-none ${isPlayable ? 'touch-none' : ''}`}
        >
            <motion.div
                className="w-full h-full relative rounded-lg overflow-hidden"
                style={{
                    // Compose the layout rotation with the live velocity tilt
                    rotate: isPlayable ? tiltRotate : rotation,
                    cursor: isPlayable ? 'grab' : 'not-allowed',
                }}
                animate={
                    isSelected
                        ? { 
                            y: -20, 
                            scale: 1.12,
                            boxShadow: `0 0 0 2px rgba(255,200,87,0.9), 0 0 20px rgba(255,200,87,0.45), 0 16px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)`
                          }
                        : isPlayable
                            ? {
                                y: [0, -6, 0],
                                scale: 1,
                                boxShadow: [
                                    `0 0 0 1.5px rgba(0,229,255,0.6), 0 0 14px rgba(0,229,255,0.3), 0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2)`,
                                    `0 0 0 1.5px rgba(0,229,255,0.6), 0 0 14px rgba(0,229,255,0.3), 0 14px 22px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)`,
                                    `0 0 0 1.5px rgba(0,229,255,0.6), 0 0 14px rgba(0,229,255,0.3), 0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.2)`
                                ]
                              }
                            : {
                                y: [0, -6, 0],
                                scale: 1,
                                boxShadow: [
                                    `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
                                    `0 12px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)`,
                                    `0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
                                ]
                              }
                }
                // Elastic pick-up snap
                whileTap={isPlayable ? { scale: 1.15, y: -25, boxShadow: `0 0 0 1.5px rgba(0,229,255,1), 0 0 25px rgba(0,229,255,0.6), 0 25px 35px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)` } : {}}
                whileHover={isPlayable && !isSelected ? { y: -10, scale: 1.06, boxShadow: `0 0 0 1.5px rgba(0,229,255,0.8), 0 0 20px rgba(0,229,255,0.5), 0 16px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)` } : {}}
                transition={
                    isSelected 
                        ? { type: 'spring', stiffness: 340, damping: 24 }
                        : { 
                            y: { duration: floatDuration, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
                            boxShadow: { duration: floatDuration, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
                            scale: { type: 'spring', stiffness: 400, damping: 20 },
                            rotate: { type: 'spring', stiffness: 300, damping: 25 }
                          }
                }
                onClick={() => { if (isPlayable && onClick) onClick(); }}
            >
                {tileUrl ? (
                    <>
                        <img
                            src={tileUrl}
                            alt={`Domino [${left}|${right}]`}
                            className="w-full h-full object-cover pointer-events-none"
                            draggable={false}
                        />

                        {/* Premium Liquid Glass / Obsidian Shimmer */}
                        <div
                            className="absolute inset-0 pointer-events-none rounded-lg mix-blend-screen"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 25%, transparent 50%, rgba(255,255,255,0.02) 100%)'
                            }}
                        />
                        <div
                            className="absolute inset-0 pointer-events-none rounded-lg mix-blend-multiply"
                            style={{
                                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.3) 80%, rgba(0,0,0,0.6) 100%)'
                            }}
                        />

                        {/* Playable: animated cyan pulse border */}
                        {isPlayable && !isSelected && (
                            <motion.div
                                className="absolute inset-0 rounded-lg pointer-events-none"
                                style={{ border: '1.5px solid rgba(0,229,255,0.55)' }}
                                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.01, 1] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        )}

                        {/* Selected: gold ring with subtle inner glow */}
                        {isSelected && (
                            <motion.div
                                className="absolute inset-0 rounded-lg pointer-events-none"
                                style={{
                                    border: '2px solid rgba(255,200,87,0.95)',
                                    boxShadow: 'inset 0 0 10px rgba(255,200,87,0.15)'
                                }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.15 }}
                            />
                        )}
                    </>
                ) : (
                    // Fallback: text tile when sprite sheet isn't loaded
                    <div className="w-full h-full bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                        {left}|{right}
                    </div>
                )}
            </motion.div>
        </div>
    );
});

DominoTile.displayName = 'DominoTile';
