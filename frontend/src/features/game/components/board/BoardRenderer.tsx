import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { solveBoardLayout } from '../../utils/layoutSolver';
import { dominoSlicer } from '../../utils/dominoSlicer';

interface BoardRendererProps {
    board: number[][]; // [[L, R], [L, R], ...]
    leftEnd: number | null;
    rightEnd: number | null;
    selectedTile: number[] | null;
    isDraggingTile: boolean;
    onPlayTile: (tile: number[], side: 'left' | 'right' | 'start') => void;
    /** Fired after each layout solve with the chain's AABB */
    onBoundsChange?: (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void;
}

export const BoardRenderer: React.FC<BoardRendererProps> = ({
    board,
    leftEnd,
    rightEnd,
    selectedTile,
    isDraggingTile,
    onPlayTile: _onPlayTile,
    onBoundsChange
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [hoveredDropZone] = useState<'left' | 'right' | 'start' | null>(null);

    // Track container dimensions to solve dynamic serpentine boundaries
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setContainerWidth(entry.contentRect.width || 800);
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const { nodes, minX, maxX, minY, maxY, leftDropZone, rightDropZone } = solveBoardLayout(board, containerWidth);

    // Notify parent of the new AABB so CameraContainer can auto-zoom
    useEffect(() => {
        onBoundsChange?.({ minX, maxX, minY, maxY });
    }, [minX, maxX, minY, maxY]);

    // Helper to check if a tile can play on a specific value
    const canPlayOn = (tile: number[] | null, endVal: number | null): boolean => {
        if (!tile || endVal === null) return false;
        return tile[0] === endVal || tile[1] === endVal;
    };

    // Determine drop zone visibility rules
    // Visible only if dragging a tile or if a tile is currently selected
    const showDropZones = isDraggingTile || selectedTile !== null;
    
    const isLeftValid = selectedTile ? canPlayOn(selectedTile, leftEnd) : false;
    const isRightValid = selectedTile ? canPlayOn(selectedTile, rightEnd) : false;

    return (
        <div 
            ref={containerRef}
            id="board-renderer-container"
            className="relative w-[1200px] h-[600px] flex items-center justify-center bg-transparent"
        >
            {/* Absolute Rendered Domino chain */}
            <div className="relative">
                {nodes.map((node) => {
                    const tileUrl = dominoSlicer.getTileUrl(node.tile[0], node.tile[1]);
                    const TILE_W = 34;
                    const TILE_H = 68;
                    return (
                        <motion.div
                            key={`${Math.min(node.tile[0], node.tile[1])}-${Math.max(node.tile[0], node.tile[1])}`}
                            className="absolute rounded shadow-lg shadow-black/40 overflow-hidden"
                            style={{
                                width: TILE_W,
                                height: TILE_H,
                                left: node.x - TILE_W / 2,
                                top: node.y - TILE_H / 2,
                                transformOrigin: 'center center'
                            }}
                            initial={{ scale: 0, opacity: 0, rotate: node.rotation }}
                            animate={{ scale: 1, opacity: 1, rotate: node.rotation }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        >
                            <img 
                                src={tileUrl}
                                alt={`Played [${node.tile[0]}|${node.tile[1]}]`}
                                className="w-full h-full object-cover pointer-events-none"
                            />
                            {/* Inner divider shadow for 3D realism */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                        </motion.div>
                    );
                })}

                {/* Valid Drop Zone layers (Fade In / Out) */}
                <AnimatePresence>
                    {showDropZones && (
                        <>
                            {/* Empty board drop zone in center */}
                            {board.length === 0 && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className={`absolute w-[68px] h-[34px] -ml-[34px] -mt-[17px] rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer z-20 pointer-events-none
                                        ${hoveredDropZone === 'start' 
                                            ? 'bg-cyan-500/25 border-cyan-400 shadow-lg shadow-cyan-500/30 scale-105' 
                                            : 'bg-cyan-950/15 border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-500/10'
                                        }
                                    `}
                                >
                                    <span className="text-[10px] font-bold text-cyan-400 tracking-wider">START</span>
                                </motion.div>
                            )}

                            {/* Left End Drop Zone */}
                            {board.length > 0 && leftDropZone && isLeftValid && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className={`absolute rounded-md border-2 border-dashed flex items-center justify-center transition-all cursor-pointer z-20 pointer-events-none
                                        ${hoveredDropZone === 'left'
                                            ? 'bg-cyan-500/25 border-cyan-400 shadow-lg shadow-cyan-500/30 scale-105'
                                            : 'bg-cyan-950/15 border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-500/10'
                                        }
                                    `}
                                    style={{
                                        width: leftDropZone.width,
                                        height: leftDropZone.height,
                                        left: leftDropZone.x - leftDropZone.width / 2,
                                        top: leftDropZone.y - leftDropZone.height / 2
                                    }}
                                >
                                    <span className="text-[9px] font-black text-cyan-400/80 tracking-widest uppercase">PLAY</span>
                                </motion.div>
                            )}

                            {/* Right End Drop Zone */}
                            {board.length > 0 && rightDropZone && isRightValid && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className={`absolute rounded-md border-2 border-dashed flex items-center justify-center transition-all cursor-pointer z-20 pointer-events-none
                                        ${hoveredDropZone === 'right'
                                            ? 'bg-cyan-500/25 border-cyan-400 shadow-lg shadow-cyan-500/30 scale-105'
                                            : 'bg-cyan-950/15 border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-500/10'
                                        }
                                    `}
                                    style={{
                                        width: rightDropZone.width,
                                        height: rightDropZone.height,
                                        left: rightDropZone.x - rightDropZone.width / 2,
                                        top: rightDropZone.y - rightDropZone.height / 2
                                    }}
                                >
                                    <span className="text-[9px] font-black text-cyan-400/80 tracking-widest uppercase">PLAY</span>
                                </motion.div>
                            )}
                        </>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
