import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { computeAutoZoom } from '../../utils/layoutSolver';

interface CameraContainerProps {
    children: React.ReactNode;
    /** Optional AABB of the solved chain — drives automatic zoom-to-fit */
    chainBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
}

export const CameraContainer: React.FC<CameraContainerProps> = ({ children, chainBounds }) => {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const panStart = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Pinch-to-zoom state for mobile
    const touchStartDist = useRef<number | null>(null);
    const touchStartZoom = useRef<number>(1);

    // Smooth auto-zoom: lerp current zoom toward target over ~300ms at 60fps
    const zoomLerpRef = useRef<number | null>(null);
    const userZoomedRef = useRef(false); // flag: user manually zoomed, skip auto

    useEffect(() => {
        if (!chainBounds || userZoomedRef.current) return;
        const container = containerRef.current;
        if (!container) return;

        const { width, height } = container.getBoundingClientRect();
        const targetZoom = computeAutoZoom(
            chainBounds.minX, chainBounds.maxX,
            chainBounds.minY, chainBounds.maxY,
            width, height,
            80 // padding in logical px
        );

        // Cancel any in-progress lerp
        if (zoomLerpRef.current !== null) cancelAnimationFrame(zoomLerpRef.current);

        let startZoom = zoom;
        let startTime: number | null = null;
        const DURATION = 320; // ms

        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const t = Math.min((timestamp - startTime) / DURATION, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            setZoom(startZoom + (targetZoom - startZoom) * eased);
            if (t < 1) {
                zoomLerpRef.current = requestAnimationFrame(step);
            } else {
                zoomLerpRef.current = null;
            }
        };

        zoomLerpRef.current = requestAnimationFrame(step);
        return () => { if (zoomLerpRef.current !== null) cancelAnimationFrame(zoomLerpRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chainBounds]);
    const ZOOM_MIN = 0.35;
    const ZOOM_MAX = 2.0;
    const PAN_LIMIT = 600;

    const handleZoomIn = () => { userZoomedRef.current = true; setZoom(z => Math.min(ZOOM_MAX, z + 0.15)); };
    const handleZoomOut = () => { userZoomedRef.current = true; setZoom(z => Math.max(ZOOM_MIN, z - 0.15)); };
    const handleReset = () => {
        userZoomedRef.current = false; // re-enable auto-zoom on manual reset
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    // Keep pan within logical bounds
    const clampPan = (val: number) => Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, val));

    // Mouse pan events
    const handleMouseDown = (e: React.MouseEvent) => {
        // Only trigger on left-click drag
        if (e.button !== 0) return;
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY };
        panStart.current = { x: pan.x, y: pan.y };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPan({
            x: clampPan(panStart.current.x + dx),
            y: clampPan(panStart.current.y + dy)
        });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Mousewheel Zoom
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        setZoom(z => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
    };

    // Touch events for mobile support (pinch-to-zoom + pan)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            setIsDragging(true);
            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panStart.current = { x: pan.x, y: pan.y };
            touchStartDist.current = null;
        } else if (e.touches.length === 2) {
            setIsDragging(false); // Disable panning
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchStartDist.current = Math.sqrt(dx * dx + dy * dy);
            touchStartZoom.current = zoom;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - dragStart.current.x;
            const dy = e.touches[0].clientY - dragStart.current.y;
            setPan({
                x: clampPan(panStart.current.x + dx),
                y: clampPan(panStart.current.y + dy)
            });
        } else if (e.touches.length === 2 && touchStartDist.current !== null) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const scale = dist / touchStartDist.current;
            setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, touchStartZoom.current * scale)));
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        touchStartDist.current = null;
    };

    // Attach global listeners for mouseup and mousemove to guarantee smooth tracking
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div 
            ref={containerRef}
            className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none' }}
        >
            {/* Viewport transformation node */}
            <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center'
                }}
            >
                <div className="pointer-events-auto">
                    {children}
                </div>
            </div>

            {/* Camera Floating Controls HUD */}
            <div className="absolute right-4 bottom-4 flex flex-col space-y-2 z-30 pointer-events-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-lg">
                <button 
                    onClick={handleZoomIn}
                    title="Zoom In"
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                    <ZoomIn className="w-4 h-4" />
                </button>
                <button 
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                    <ZoomOut className="w-4 h-4" />
                </button>
                <button 
                    onClick={handleReset}
                    title="Recenter Camera"
                    className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-cyan-400 transition-colors cursor-pointer"
                >
                    <Maximize2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
