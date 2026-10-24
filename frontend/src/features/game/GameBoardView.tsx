import { useState, useEffect, useRef } from 'react';
import { safeParseJson } from '../../utils/api';
import { useGameStore } from '../../store/useGameStore';
import { audio } from '../../utils/audio';
import { useAudioCallbacks } from './hooks/useAudioCallbacks';
import { BoneyardStack } from './components/hud/BoneyardStack';
import { OpponentHand } from './components/players/OpponentHand';
import { PlayerHand } from './components/players/PlayerHand';
import { CameraContainer } from './components/board/CameraContainer';
import { BoardRenderer } from './components/board/BoardRenderer';
import { MatchOverlays } from './components/hud/MatchOverlays';
import { Send, Trophy, Bot, LogOut } from 'lucide-react';
import { AvatarIcon } from '../auth/AuthView';
import { dominoSlicer } from './utils/dominoSlicer';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { DominoTile } from './components/domino/DominoTile';

// Animated SVG timer ring
const TimerRing = ({ seconds, maxSeconds = 25, isMyTurn }: { seconds: number; maxSeconds?: number; isMyTurn: boolean }) => {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(1, seconds / maxSeconds));
    const offset = circumference * (1 - progress);
    const isUrgent = seconds <= 8 && isMyTurn;

    return (
        <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" width="64" height="64" viewBox="0 0 64 64">
                {/* Track */}
                <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                {/* Progress arc */}
                <motion.circle
                    cx="32" cy="32" r={radius}
                    fill="none"
                    stroke={isUrgent ? '#FF5A5F' : isMyTurn ? '#00E5FF' : '#334155'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 0.5, ease: 'linear' }}
                />
            </svg>
            <div className="relative z-10 text-center">
                <div className={`text-base font-black font-mono leading-none ${isUrgent ? 'text-red-400' : isMyTurn ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {seconds}
                </div>
                <div className="text-[8px] text-slate-600 font-bold uppercase">sec</div>
            </div>
        </div>
    );
};

export const GameBoardView = ({ onViewLobby }: { onViewLobby: () => void }) => {
    const { currentUser, token, activeMatch, myHand, chatMessages, setMatch, setMyHand } = useGameStore();
    const [secondsLeft, setSecondsLeft] = useState(25);
    const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
    const [roundResult, setRoundResult] = useState<any | null>(null);
    const [matchResult, setMatchResult] = useState<any | null>(null);
    const [selectedTile, setSelectedTile] = useState<number[] | null>(null);
    const [draggedTile, setDraggedTile] = useState<{ tile: number[], origin: { x: number, y: number } } | null>(null);
    const isDragging = draggedTile !== null;
    const dragX = useMotionValue(0);
    const dragY = useMotionValue(0);
    const [chatText, setChatText] = useState('');
    const [ping, setPing] = useState(42);
    const [chainBounds, setChainBounds] = useState<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
    const [shakeTrigger, setShakeTrigger] = useState(0);

    // Auto-Play when timer expires
    const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

    // Auto-drawing state when player has no matching tiles
    const [isAutoDrawing, setIsAutoDrawing] = useState<boolean>(false);

    // Flying tiles for drawing animation
    const [flyingTiles, setFlyingTiles] = useState<{ id: number }[]>([]);

    // Exit modal state
    const [showExitModal, setShowExitModal] = useState<boolean>(false);

    const handleConfirmExit = () => {
        const { setMatch } = useGameStore.getState();
        setMatch(null);
        useGameStore.setState({ activeRoomCode: null, activeRoom: null });
        setMatchResult(null);
        setRoundResult(null);
        onViewLobby();
    };

    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevTurnIdRef = useRef<number | null>(null);
    const chatEndRef = useRef<HTMLDivElement | null>(null);


    const audioHooks = useAudioCallbacks();

    const fetchGameState = async () => {
        if (!activeMatch || !token) return;
        try {
            const res = await fetch(`/api/matches/${activeMatch.match_id}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            const data = await safeParseJson(res);
            if (res.ok) {
                setMatch(data);
                setMyHand(data.my_hand || []);

                const targetScore = data.target_score || 101;
                const is2v2 = data.mode === '2v2';
                const p1Score = data.scores?.[currentUser?.id || 1] ?? 0;
                const botScore = data.scores?.[999] ?? 0;
                const team0Score = data.team_scores?.['0'] ?? 0;
                const team1Score = data.team_scores?.['1'] ?? 0;
                const isMatchFinished = is2v2
                    ? (data.status === 'completed' || team0Score >= targetScore || team1Score >= targetScore)
                    : (data.status === 'completed' || p1Score >= targetScore || botScore >= targetScore);

                if (isMatchFinished) {
                    if (!matchResult) {
                        const userWon = is2v2 ? (team0Score >= team1Score) : (p1Score >= botScore);
                        const winnerId = userWon ? (currentUser?.id || 1) : 999;
                        const winnerName = is2v2
                            ? (userWon ? 'Your Team (فريقك)' : 'Opponent Team (الخصوم)')
                            : (userWon ? (currentUser?.username || 'You') : 'Domino AI');
                        setRoundResult(null);
                        setMatchResult({
                            winner_id: winnerId,
                            winner_name: winnerName,
                            scores: data.scores,
                            team_scores: data.team_scores,
                            target_score: targetScore,
                            duration_seconds: 180,
                            round_history: data.round_history || []
                        });
                        audioHooks.onMatchWon(userWon);
                    }
                } else if (data.round_result && !roundResult && data.round_status === 'completed') {
                    setRoundResult(data.round_result);
                    audioHooks.onRoundEnded(data.round_result.winner_id === currentUser?.id);
                }
            }
        } catch (err) { console.error('Failed to sync game state:', err); }
    };

    // WebSocket state updates & chat
    useEffect(() => {
        const handleStateUpdate = () => fetchGameState();
        const handleRoundEnded = (e: any) => {
            setRoundResult(e.detail);
            audioHooks.onRoundEnded(e.detail.winner_id === currentUser?.id);
        };
        const handleMatchEnded = (e: any) => {
            setMatchResult(e.detail);
            audioHooks.onMatchWon(e.detail.winner_id === currentUser?.id);
        };

        window.addEventListener('domino:state_updated', handleStateUpdate);
        window.addEventListener('domino:round_ended', handleRoundEnded);
        window.addEventListener('domino:match_ended', handleMatchEnded);

        fetchGameState();
        const pollInterval = setInterval(() => {
            fetchGameState();
        }, 1200);

        if (activeMatch) {
            fetch(`/api/matches/${activeMatch.match_id}/report-reconnect`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('domino:state_updated', handleStateUpdate);
            window.removeEventListener('domino:round_ended', handleRoundEnded);
            window.removeEventListener('domino:match_ended', handleMatchEnded);
        };
    }, [activeMatch?.match_id]);

    // Turn timer
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (!activeMatch || activeMatch.status !== 'active') return;
        const disconnectedPlayer = activeMatch.players.find(p => !p.is_connected);
        if (disconnectedPlayer) return;
        const deadlineStr = activeMatch.turn_deadline;
        if (!deadlineStr) return;

        const updateTimer = () => {
            const now = new Date().getTime();
            const end = new Date(deadlineStr).getTime();
            const diff = Math.ceil((end - now) / 1000);
            if (diff >= 0) {
                setSecondsLeft(diff);
                if (diff <= 5 && diff > 0 && activeMatch.current_turn_player_id === currentUser?.id) audio.playWarning();
            } else {
                setSecondsLeft(0);
                // Turn timed out: Trigger AI Auto-play on user behalf!
                if (activeMatch.current_turn_player_id === currentUser?.id) {
                    setIsAutoPlaying(true);
                }
            }
        };
        updateTimer();
        timerIntervalRef.current = setInterval(updateTimer, 1000);
        return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
    }, [activeMatch?.turn_deadline, activeMatch?.players, activeMatch?.current_turn_player_id, currentUser?.id]);

    // Cancel auto-play immediately when user touches / clicks anywhere on the screen
    useEffect(() => {
        if (!isAutoPlaying) return;
        const handleUserInteraction = () => {
            setIsAutoPlaying(false);
        };
        window.addEventListener('pointerdown', handleUserInteraction, { capture: true });
        window.addEventListener('touchstart', handleUserInteraction, { capture: true });
        return () => {
            window.removeEventListener('pointerdown', handleUserInteraction, { capture: true });
            window.removeEventListener('touchstart', handleUserInteraction, { capture: true });
        };
    }, [isAutoPlaying]);

    // Turn change audio
    useEffect(() => {
        if (activeMatch) {
            const turnId = activeMatch.current_turn_player_id;
            if (turnId !== prevTurnIdRef.current) {
                prevTurnIdRef.current = turnId;
                audioHooks.onTurnChanged(turnId === currentUser?.id);
            }
        }
    }, [activeMatch?.current_turn_player_id, currentUser?.id]);

    // Mandatory Domino Rule: Drawing is strictly automatic and only occurs when player has NO matching tile!
    useEffect(() => {
        if (!activeMatch || activeMatch.status !== 'active' || activeMatch.round_status !== 'in_progress') {
            setIsAutoDrawing(false);
            return;
        }
        const isMyTurn = activeMatch.current_turn_player_id === currentUser?.id;
        if (!isMyTurn) {
            setIsAutoDrawing(false);
            return;
        }

        // If board is empty, first tile is playable
        if (activeMatch.board.length === 0) {
            setIsAutoDrawing(false);
            return;
        }

        const left = activeMatch.left_end;
        const right = activeMatch.right_end;
        if (left === null || right === null) {
            setIsAutoDrawing(false);
            return;
        }

        // Check if player has any matching tile
        const hasMatch = myHand.some(t => t[0] === left || t[1] === left || t[0] === right || t[1] === right);

        if (!hasMatch) {
            if (activeMatch.boneyard_count > 0) {
                setIsAutoDrawing(true);
                const drawTimer = setTimeout(() => {
                    handleDrawTile();
                }, 650);
                return () => clearTimeout(drawTimer);
            } else {
                setIsAutoDrawing(false);
                const passTimer = setTimeout(() => {
                    handlePassTurn();
                }, 800);
                return () => clearTimeout(passTimer);
            }
        } else {
            setIsAutoDrawing(false);
        }
    }, [activeMatch?.current_turn_player_id, activeMatch?.board, activeMatch?.left_end, activeMatch?.right_end, activeMatch?.boneyard_count, myHand, currentUser?.id]);


    // Reconnection timer
    useEffect(() => {
        if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
        if (!activeMatch) return;
        const disconnectedPlayer = activeMatch.players.find(p => !p.is_connected);
        if (!disconnectedPlayer || !disconnectedPlayer.reconnect_deadline) { setReconnectCountdown(null); return; }
        const deadlineStr = disconnectedPlayer.reconnect_deadline;
        const updateReconnectTimer = () => {
            const now = new Date().getTime();
            const end = new Date(deadlineStr).getTime();
            const diff = Math.ceil((end - now) / 1000);
            if (diff >= 0) { setReconnectCountdown(diff); }
            else {
                setReconnectCountdown(0);
                fetch(`/api/matches/${activeMatch.match_id}/report-disconnect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ player_id: disconnectedPlayer.id })
                });
            }
        };
        updateReconnectTimer();
        reconnectIntervalRef.current = setInterval(updateReconnectTimer, 1000);
        return () => { if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current); };
    }, [activeMatch?.players]);

    // Ping simulation
    useEffect(() => {
        const interval = setInterval(() => { setPing(p => Math.max(15, Math.min(75, p + Math.floor(Math.random() * 7) - 3))); }, 4000);
        return () => clearInterval(interval);
    }, []);

    // Scroll chat to bottom
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

    const handlePlayTile = async (tile: number[], side: 'left' | 'right' | 'start') => {
        if (!activeMatch || activeMatch.current_turn_player_id !== currentUser?.id) return;
        
        // --- Optimistic UI Update ---
        const prevMatch = { ...activeMatch };
        const prevHand = [...myHand];
        
        // Remove from hand locally
        const newHand = myHand.filter(t => !(t[0] === tile[0] && t[1] === tile[1]));
        setMyHand(newHand);
        
        // Update board locally
        const newBoard = [...activeMatch.board];
        let newLeftEnd = activeMatch.left_end;
        let newRightEnd = activeMatch.right_end;
        
        let placedTile = [...tile];
        if (side === 'start') {
            newBoard.push(placedTile);
            newLeftEnd = placedTile[0];
            newRightEnd = placedTile[1];
        } else if (side === 'left') {
            if (placedTile[1] !== newLeftEnd) placedTile = [placedTile[1], placedTile[0]];
            newBoard.unshift(placedTile);
            newLeftEnd = placedTile[0];
        } else if (side === 'right') {
            if (placedTile[0] !== newRightEnd) placedTile = [placedTile[1], placedTile[0]];
            newBoard.push(placedTile);
            newRightEnd = placedTile[1];
        }
        
        setMatch({
            ...activeMatch,
            board: newBoard,
            left_end: newLeftEnd,
            right_end: newRightEnd,
            current_turn_player_id: null, // End turn immediately
        });
        
        audioHooks.onTilePlayed(); 
        setSelectedTile(null); 
        setShakeTrigger(Date.now());
        
        try {
            const res = await fetch(`/api/matches/${activeMatch.match_id}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ tile, side })
            });
            if (!res.ok) { 
                // Revert on error
                setMatch(prevMatch);
                setMyHand(prevHand);
                const data = await safeParseJson(res); 
                console.error('Play failed:', data.message);
            } else { 
                fetchGameState(); // Sync authoritative state
            }
        } catch (err) { 
            console.error(err); 
            setMatch(prevMatch);
            setMyHand(prevHand);
        }
    };

    const handleDrawTile = async () => {
        if (!activeMatch || activeMatch.current_turn_player_id !== currentUser?.id) return;
        try {
            // Trigger visual flying tile animation from boneyard to hand
            const animId = Date.now() + Math.random();
            setFlyingTiles(prev => [...prev, { id: animId }]);
            audio.playPlaced();
            setTimeout(() => {
                setFlyingTiles(prev => prev.filter(t => t.id !== animId));
            }, 450);

            const res = await fetch(`/api/matches/${activeMatch.match_id}/draw`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (!res.ok) { 
                const data = await safeParseJson(res); 
                console.error('Cannot draw:', data.message);
            }
            else { audioHooks.onTileDrawn(); fetchGameState(); }
        } catch (err) { console.error(err); }
    };

    const handlePassTurn = async () => {
        if (!activeMatch || activeMatch.current_turn_player_id !== currentUser?.id) return;
        try {
            const res = await fetch(`/api/matches/${activeMatch.match_id}/pass`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            if (!res.ok) { 
                const data = await safeParseJson(res); 
                console.error(data.message || 'Cannot pass.'); 
            }
            else { fetchGameState(); }
        } catch (err) { console.error(err); }
    };

    const handleContinueRound = async () => {
        if (!activeMatch) return;
        const targetScore = activeMatch.target_score || 101;
        const is2v2 = activeMatch.mode === '2v2';
        const p1Score = activeMatch.scores?.[currentUser?.id || 1] ?? 0;
        const botScore = activeMatch.scores?.[999] ?? 0;
        const team0Score = activeMatch.team_scores?.['0'] ?? 0;
        const team1Score = activeMatch.team_scores?.['1'] ?? 0;
        const isMatchFinished = is2v2
            ? (activeMatch.status === 'completed' || team0Score >= targetScore || team1Score >= targetScore)
            : (activeMatch.status === 'completed' || p1Score >= targetScore || botScore >= targetScore);

        if (isMatchFinished) {
            setRoundResult(null);
            const userWon = is2v2 ? (team0Score >= team1Score) : (p1Score >= botScore);
            const winnerId = userWon ? (currentUser?.id || 1) : 999;
            const winnerName = is2v2
                ? (userWon ? 'Your Team (فريقك)' : 'Opponent Team (الخصوم)')
                : (userWon ? (currentUser?.username || 'You') : 'Domino AI');
            setMatchResult({
                winner_id: winnerId,
                winner_name: winnerName,
                scores: activeMatch.scores,
                team_scores: activeMatch.team_scores,
                target_score: targetScore,
                duration_seconds: 180,
                round_history: (activeMatch as any).round_history || []
            });
            audioHooks.onMatchWon(userWon);
            return;
        }

        setRoundResult(null);
        if (token) {
            try {
                const res = await fetch(`/api/matches/${activeMatch.match_id}/next-round`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                });
                const data = await safeParseJson(res);
                if (res.ok) {
                    setMatch(data);
                    setMyHand(data.my_hand || []);
                }
            } catch (err) {
                console.error('Failed to start next round:', err);
            }
        }
    };

    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        const { activeRoomCode } = useGameStore.getState();
        if (!activeRoomCode || !chatText.trim()) return;
        try {
            await fetch(`/api/rooms/${activeRoomCode}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                body: JSON.stringify({ message: chatText })
            });
            setChatText('');
        } catch (err) { console.error('Failed to send message:', err); }
    };

    // Loading state
    if (!activeMatch || !activeMatch.players || !activeMatch.board) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center text-white">
                <motion.div
                    className="text-center space-y-6"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                >
                    <motion.div
                        className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center mx-auto"
                        animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    >
                        <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full" />
                    </motion.div>
                    <div>
                        <h1 className="text-xl font-black text-cyan-400 text-glow-cyan tracking-wider">INITIALIZING GAME TABLE</h1>
                        <p className="text-xs text-slate-600 font-semibold uppercase tracking-[0.2em] mt-2">Syncing match state...</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    const isMyTurn = activeMatch.current_turn_player_id === currentUser?.id;

    // AI Auto-Play execution on player behalf
    useEffect(() => {
        if (!isAutoPlaying || !isMyTurn || !activeMatch || activeMatch.status !== 'active') return;

        const autoTimer = setTimeout(() => {
            const playable = myHand.filter(checkTilePlayable);
            if (playable.length > 0) {
                // Play highest pip playable tile
                const chosen = [...playable].sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]))[0];
                const canLeft = checkTilePlayableOnSide(chosen, activeMatch.left_end);
                const canRight = checkTilePlayableOnSide(chosen, activeMatch.right_end);
                if (activeMatch.board.length === 0) {
                    handlePlayTile(chosen, 'start');
                } else if (canLeft) {
                    handlePlayTile(chosen, 'left');
                } else if (canRight) {
                    handlePlayTile(chosen, 'right');
                }
            } else if (activeMatch.boneyard_count > 0) {
                handleDrawTile();
            } else {
                handlePassTurn();
            }
        }, 850);

        return () => clearTimeout(autoTimer);
    }, [isAutoPlaying, isMyTurn, myHand, activeMatch?.board, activeMatch?.left_end, activeMatch?.right_end, activeMatch?.boneyard_count]);

    const checkTilePlayable = (tile: number[]) => {
        if (!isMyTurn) return false;
        if (activeMatch.board.length === 0) {
            if (activeMatch.round_number === 1) {
                // Find highest double in hand
                let highestDouble = -1;
                for (let i = 6; i >= 0; i--) {
                    if (myHand.some(t => t[0] === i && t[1] === i)) {
                        highestDouble = i;
                        break;
                    }
                }
                
                // If they have a double, force them to play it. Otherwise, they can play anything.
                if (highestDouble !== -1) {
                    return tile[0] === highestDouble && tile[1] === highestDouble;
                }
                return true;
            }
            return true;
        }
        const left = activeMatch.left_end;
        const right = activeMatch.right_end;
        return (left !== null && (tile[0] === left || tile[1] === left)) ||
               (right !== null && (tile[0] === right || tile[1] === right));
    };

    const checkTilePlayableOnSide = (tile: number[] | null, endVal: number | null) => {
        if (!tile || endVal === null) return false;
        return tile[0] === endVal || tile[1] === endVal;
    };

    const handlePointerDownTile = (e: React.PointerEvent, tile: number[]) => {
        setDraggedTile({ tile, origin: { x: e.clientX, y: e.clientY } });
        dragX.set(e.clientX);
        dragY.set(e.clientY);
    };

    useEffect(() => {
        if (!draggedTile) return;

        const handlePointerMove = (e: PointerEvent) => {
            dragX.set(e.clientX);
            dragY.set(e.clientY);
        };

        const handlePointerUp = (e: PointerEvent) => {
            setDraggedTile(null);
            
            const boardContainer = document.getElementById('board-renderer-container');
            if (boardContainer) {
                const rect = boardContainer.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    const dropX = e.clientX - rect.left;
                    const leftEnd = activeMatch?.left_end ?? null;
                    const rightEnd = activeMatch?.right_end ?? null;
                    const canLeft = checkTilePlayableOnSide(draggedTile.tile, leftEnd);
                    const canRight = checkTilePlayableOnSide(draggedTile.tile, rightEnd);

                    if (activeMatch?.board.length === 0) {
                        handlePlayTile(draggedTile.tile, 'start');
                    } else if (canLeft && canRight) {
                        if (dropX < rect.width / 2) handlePlayTile(draggedTile.tile, 'left');
                        else handlePlayTile(draggedTile.tile, 'right');
                    } else if (canLeft) {
                        handlePlayTile(draggedTile.tile, 'left');
                    } else if (canRight) {
                        handlePlayTile(draggedTile.tile, 'right');
                    }
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggedTile, activeMatch, handlePlayTile]);

    const playableTiles = myHand.map(checkTilePlayable);
    const hasPlayableOption = playableTiles.some(Boolean);
    const showPassButton = isMyTurn && !hasPlayableOption && activeMatch.boneyard_count === 0;

    const mySeat = activeMatch.players.find(p => p.id === currentUser?.id);
    const mySeatIndex = mySeat ? mySeat.seat_index : 0;
    const sortedOpponents = activeMatch.players
        .filter(p => p.id !== currentUser?.id)
        .sort((a, b) => {
            const diffA = (a.seat_index - mySeatIndex + 4) % 4;
            const diffB = (b.seat_index - mySeatIndex + 4) % 4;
            return diffA - diffB;
        });
    const topOpponent = sortedOpponents[activeMatch.mode === '1v1' ? 0 : 1];
    const rightOpponent = activeMatch.mode === '2v2' ? sortedOpponents[0] : null;
    const leftOpponent = activeMatch.mode === '2v2' ? sortedOpponents[2] : null;

    return (
        <motion.div 
            className="min-h-screen flex flex-col select-none text-white overflow-hidden relative" 
            style={{ maxHeight: '100vh' }}
            animate={shakeTrigger ? { x: [0, -12, 12, -8, 8, -4, 4, 0], y: [0, -8, 8, -4, 4, 0, 0, 0] } : { x: 0, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
        >
            {/* Impact Shockwave Overlay */}
            <AnimatePresence>
                {shakeTrigger > 0 && (
                    <motion.div
                        key={shakeTrigger}
                        initial={{ opacity: 0.6, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 2 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center"
                    >
                        <div className="w-[800px] h-[800px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.15) 0%, transparent 60%)' }} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── TOP BAR: Opponent + Match Info ───────────────────────────── */}
            <div className="flex items-center justify-between px-4 md:px-6 pt-3 pb-2 gap-4 shrink-0">

                {/* Left: Exit Button & Match metadata */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowExitModal(true)}
                        className="glass-panel px-3.5 py-2 rounded-xl border border-red-500/30 hover:border-red-500/60 bg-red-950/25 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-xs font-black flex items-center gap-2 transition-all active:scale-95 shrink-0 shadow-lg group cursor-pointer"
                        title="خروج من الماتش (Exit)"
                    >
                        <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                        <span className="tracking-wide">خروج (Exit)</span>
                    </button>

                    <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-4">
                        <div className="text-center">
                            <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">Round</div>
                            <div className="text-base font-black text-cyan-400 font-mono leading-tight">{activeMatch.round_number}</div>
                        </div>
                        <div className="w-px h-6 bg-white/8" />
                        <div className="text-center">
                            <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">Mode</div>
                            <div className="text-xs font-black text-white uppercase">{activeMatch.mode}</div>
                        </div>
                        <div className="w-px h-6 bg-white/8" />
                        <div className="text-center">
                            <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">Target</div>
                            <div className="text-xs font-black text-yellow-400">{activeMatch.target_score}pts</div>
                        </div>
                        {((activeMatch.mode === '2v2'
                            ? ((activeMatch.team_scores?.['0'] ?? 0) >= activeMatch.target_score || (activeMatch.team_scores?.['1'] ?? 0) >= activeMatch.target_score)
                            : ((activeMatch.scores[currentUser?.id || 1] ?? 0) >= activeMatch.target_score || (activeMatch.scores[999] ?? 0) >= activeMatch.target_score)) || activeMatch.status === 'completed') && (
                            <>
                                <div className="w-px h-6 bg-white/8" />
                                <div className="text-center">
                                    <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">Status</div>
                                    <div className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1 animate-pulse">
                                        <Trophy className="w-3 h-3 text-yellow-400" />
                                        FINISHED
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Center: Opponent card */}
                {topOpponent && (
                    <div className="flex-1 flex justify-center">
                        <OpponentHand
                            player={topOpponent}
                            isActiveTurn={activeMatch.current_turn_player_id === topOpponent.id}
                            secondsLeft={secondsLeft}
                            position="top"
                            score={activeMatch.mode === '2v2' ? (activeMatch.team_scores?.['0'] ?? 0) : (activeMatch.scores[topOpponent.id] ?? 0)}
                            targetScore={activeMatch.target_score}
                            isTeammate={activeMatch.mode === '2v2' && topOpponent.team_index === mySeat?.team_index}
                        />
                    </div>
                )}

                {/* Right: Scores */}
                <div className="glass-panel rounded-xl px-4 py-2">
                    <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider mb-1.5">Scores</div>
                    <div className="space-y-1">
                        {activeMatch.mode === '1v1' ? (
                            activeMatch.players.map((p, idx) => (
                                <div key={p.id} className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-cyan-400' : 'bg-yellow-400'}`} />
                                    <span className="text-[11px] text-slate-400 truncate max-w-[70px]">{p.username}</span>
                                    <span className="text-xs font-black text-white ml-auto font-mono">{activeMatch.scores[p.id] ?? 0}</span>
                                </div>
                            ))
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                    <span className="text-[11px] text-slate-400">Team 1</span>
                                    <span className="text-xs font-black text-white ml-auto font-mono">{activeMatch.team_scores?.['0'] ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                    <span className="text-[11px] text-slate-400">Team 2</span>
                                    <span className="text-xs font-black text-white ml-auto font-mono">{activeMatch.team_scores?.['1'] ?? 0}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── CENTER: Game Table + Side panels ─────────────────────────── */}
            <div className="flex flex-1 gap-3 px-4 md:px-6 pb-2 min-h-0 overflow-hidden">

                {/* Left Panel: Timer & Left Opponent / Boneyard */}
                <div className="w-[125px] md:w-[155px] flex flex-col gap-3 shrink-0">
                    {/* Timer card */}
                    <motion.div
                        className={`glass-panel rounded-2xl p-3 flex flex-col items-center gap-2 ${
                            isAutoPlaying 
                                ? 'border-amber-400/50 bg-amber-950/20' 
                                : isMyTurn ? 'border-cyan-500/20' : ''
                        }`}
                        animate={isAutoPlaying ? {
                            boxShadow: ['0 0 0 0 rgba(245,158,11,0.2)', '0 0 16px 4px rgba(245,158,11,0.3)', '0 0 0 0 rgba(245,158,11,0.2)']
                        } : isMyTurn ? {
                            boxShadow: ['0 0 0 0 rgba(0,229,255,0.15)', '0 0 16px 4px rgba(0,229,255,0.08)', '0 0 0 0 rgba(0,229,255,0.15)']
                        } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <TimerRing seconds={secondsLeft} isMyTurn={isMyTurn} />
                        <div className={`text-[9px] font-black uppercase tracking-wider text-center flex items-center justify-center gap-1 ${
                            isAutoPlaying 
                                ? 'text-amber-400' 
                                : isMyTurn ? 'text-cyan-400' : 'text-slate-600'
                        }`}>
                            {isAutoPlaying ? (
                                <>
                                    <Bot className="w-3 h-3 text-amber-400 animate-bounce" />
                                    <span>AI AUTO</span>
                                </>
                            ) : isMyTurn ? 'YOUR TURN' : 'WAIT'}
                        </div>
                    </motion.div>

                    {/* 2v2 Left Opponent (Outside Table!) */}
                    {activeMatch.mode === '2v2' && leftOpponent ? (
                        <div className="flex flex-col gap-2">
                            <OpponentHand
                                player={leftOpponent}
                                isActiveTurn={activeMatch.current_turn_player_id === leftOpponent.id}
                                secondsLeft={secondsLeft}
                                position="sidebar"
                                score={activeMatch.team_scores?.['1'] ?? 0}
                                targetScore={activeMatch.target_score}
                            />
                            {showPassButton && (
                                <motion.button
                                    onClick={handlePassTurn}
                                    className="w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-[10px] font-black uppercase tracking-wider"
                                    whileTap={{ scale: 0.95 }}
                                    animate={{ opacity: [1, 0.7, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                    Pass Turn
                                </motion.button>
                            )}
                        </div>
                    ) : (
                        /* 1v1 Boneyard & Action Card */
                        <div className="glass-panel rounded-2xl p-2.5 flex-1 flex flex-col items-center justify-between gap-2 overflow-hidden border border-white/10">
                            <BoneyardStack
                                count={activeMatch.boneyard_count}
                                isDrawing={isAutoDrawing}
                            />

                            {showPassButton && (
                                <motion.button
                                    onClick={handlePassTurn}
                                    className="w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-[10px] font-black uppercase tracking-wider"
                                    whileTap={{ scale: 0.95 }}
                                    animate={{ opacity: [1, 0.7, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                    Pass Turn
                                </motion.button>
                            )}

                            {!showPassButton && (
                                <div className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed px-1">
                                    {isAutoDrawing ? (
                                        <span className="text-cyan-400 animate-pulse font-black">جاري السحب...</span>
                                    ) : isMyTurn ? (
                                        'Play from hand'
                                    ) : (
                                        'Opponent turn'
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── FELT BOARD TABLE (100% Clean Domino Arena!) ───────────── */}
                <div className="flex-1 relative rounded-[28px] felt-table overflow-hidden min-h-0">
                    {/* Board */}
                    <div className="w-full h-full" id="board-renderer-container">
                        <CameraContainer chainBounds={chainBounds}>
                            <BoardRenderer
                                board={activeMatch.board}
                                leftEnd={activeMatch.left_end}
                                rightEnd={activeMatch.right_end}
                                selectedTile={selectedTile}
                                isDraggingTile={isDragging}
                                onPlayTile={handlePlayTile}
                                onBoundsChange={setChainBounds}
                            />
                        </CameraContainer>
                    </div>

                    {/* Turn indicator overlay */}
                    <AnimatePresence>
                        {isMyTurn && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
                            >
                                <div className="badge-cyan text-[10px] px-3 py-1.5 font-black tracking-widest"
                                    style={{ boxShadow: '0 0 20px rgba(0,229,255,0.3)' }}>
                                    ● YOUR TURN
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right Panel: Right Opponent (2v2) & Chat */}
                <div className="w-[125px] md:w-[195px] flex flex-col gap-3 shrink-0">
                    {/* 2v2 Right Opponent (Outside Table!) */}
                    {activeMatch.mode === '2v2' && rightOpponent && (
                        <OpponentHand
                            player={rightOpponent}
                            isActiveTurn={activeMatch.current_turn_player_id === rightOpponent.id}
                            secondsLeft={secondsLeft}
                            position="sidebar"
                            score={activeMatch.team_scores?.['1'] ?? 0}
                            targetScore={activeMatch.target_score}
                        />
                    )}

                    {/* Chat button (mobile) / panel (desktop) */}
                    <div className="glass-panel rounded-2xl p-3 flex flex-col flex-1 min-h-[140px] hidden md:flex">
                        <div className="text-[9px] font-black text-white uppercase tracking-widest mb-2.5 pb-2 border-b border-white/6">Chat</div>
                        <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar text-[10px]">
                            {chatMessages.length === 0 ? (
                                <div className="text-center text-slate-600 mt-6 text-[10px]">No messages</div>
                            ) : (
                                chatMessages.map((msg, idx) => {
                                    const isSystem = msg.type === 'system';
                                    return (
                                        <div key={idx}>
                                            {isSystem ? (
                                                <div className="text-center text-[9px] text-slate-600 italic">{msg.message}</div>
                                            ) : (
                                                <div>
                                                    <span className="font-black text-cyan-400">{msg.username}: </span>
                                                    <span className="text-slate-300">{msg.message}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleSendChat} className="flex gap-1.5 pt-2 border-t border-white/6 mt-2">
                            <input
                                type="text" value={chatText}
                                onChange={e => setChatText(e.target.value)}
                                placeholder="Say something..."
                                className="flex-1 bg-black/40 border border-white/8 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-cyan-400/40"
                            />
                            <button type="submit" className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                                <Send className="w-3 h-3" />
                            </button>
                        </form>
                    </div>

                    {/* Ping indicator */}
                    <div className="glass-panel rounded-xl py-2 px-3 text-center">
                        <div className="text-[9px] text-slate-600 uppercase font-bold">Ping</div>
                        <div className={`text-sm font-black font-mono ${ping < 50 ? 'text-emerald-400' : ping < 100 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {ping}ms
                        </div>
                    </div>
                </div>
            </div>

            {/* ── BOTTOM: Player Hand ──────────────────────────────────────── */}
            <div className="shrink-0 px-4 md:px-6 pb-4 pt-1">
                {/* Local Player Info & Score Status */}
                <div className="flex items-center justify-between mb-2 px-3 py-1.5 rounded-2xl glass-panel max-w-sm mx-auto border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
                    <div className="flex items-center gap-2.5">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center">
                                {currentUser && <AvatarIcon id={currentUser.avatar} className="w-5 h-5" />}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#090B12]" />
                        </div>
                        <div>
                            <div className="font-bold text-xs text-white flex items-center gap-1.5">
                                <span>{currentUser?.username || 'You'}</span>
                                <span className="text-[9px] font-black text-cyan-400 bg-cyan-500/15 border border-cyan-500/25 px-1.5 py-0.5 rounded">YOU</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                                {myHand.length} tiles in hand
                            </div>
                        </div>
                    </div>

                    {/* Human Player Total Score */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono shadow-[0_0_12px_rgba(0,229,255,0.15)]">
                        <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-white text-sm font-black">
                            {activeMatch.mode === '2v2' ? (activeMatch.team_scores?.['0'] ?? 0) : (activeMatch.scores[currentUser?.id || 1] ?? 0)}
                        </span>
                        <span className="text-[10px] text-cyan-400 font-bold">/ {activeMatch.target_score} pts</span>
                    </div>
                </div>

                <PlayerHand
                    hand={myHand}
                    playableTiles={playableTiles}
                    selectedTile={selectedTile}
                    draggedTile={draggedTile?.tile || null}
                    onSelectTile={setSelectedTile}
                    onPointerDown={handlePointerDownTile}
                />
            </div>

            {/* Custom Drag Overlay */}
            {draggedTile && (
                <motion.div
                    className="fixed top-0 left-0 pointer-events-none z-[9999]"
                    style={{
                        x: dragX,
                        y: dragY,
                        // Center the tile on the cursor
                        translateX: '-50%',
                        translateY: '-50%',
                        rotate: (dragX.get() - draggedTile.origin.x) * 0.05 // subtle tilt based on drag distance
                    }}
                >
                    <DominoTile left={draggedTile.tile[0]} right={draggedTile.tile[1]} size="lg" isPlayable={true} />
                </motion.div>
            )}

            {/* Flying Tile Draw Animation */}
            <AnimatePresence>
                {flyingTiles.map(t => (
                    <motion.div
                        key={t.id}
                        initial={{
                            position: 'fixed',
                            left: 70,
                            top: 280,
                            scale: 0.5,
                            rotate: -30,
                            opacity: 0.95,
                            zIndex: 9999
                        }}
                        animate={{
                            left: window.innerWidth / 2,
                            top: window.innerHeight - 90,
                            scale: 1,
                            rotate: 0,
                            opacity: 1
                        }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                        className="pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-cyan-400"
                        style={{ width: 34, height: 68 }}
                    >
                        <img src={dominoSlicer.getBackUrl()} alt="drawn domino" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-cyan-400/20 mix-blend-overlay" />
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* AI Auto-Play Mode Active Banner */}
            <AnimatePresence>
                {isAutoPlaying && (
                    <motion.div
                        initial={{ opacity: 0, y: -25, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -25, scale: 0.95 }}
                        className="fixed top-16 left-1/2 -translate-x-1/2 z-50 glass-panel px-5 py-3 rounded-2xl border border-amber-400/50 bg-amber-950/85 shadow-[0_0_35px_rgba(245,158,11,0.4)] flex items-center gap-4 cursor-pointer select-none"
                        onClick={() => setIsAutoPlaying(false)}
                    >
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                            <Bot className="w-6 h-6 text-amber-400 animate-pulse" />
                        </div>
                        <div>
                            <div className="font-black text-sm text-amber-300 flex items-center gap-2">
                                <span>الـ AI يلعب مكانك تلقائياً</span>
                                <span className="text-[9px] font-bold bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded tracking-wider">AUTO-PLAY</span>
                            </div>
                            <div className="text-[11px] text-slate-300 mt-0.5">
                                المس الشاشة في أي مكان لاستعادة التحكم واللعب بنفسك
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsAutoPlaying(false); }}
                            className="py-1.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all shadow-md active:scale-95 shrink-0"
                        >
                            استعادة اللعب
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <MatchOverlays
                currentUser={currentUser}
                players={activeMatch.players}
                mode={activeMatch.mode as '1v1' | '2v2'}
                reconnectCountdown={reconnectCountdown}
                roundResult={roundResult}
                matchResult={matchResult}
                onContinueRound={handleContinueRound}
                onReturnToLobby={() => {
                    const { setMatch } = useGameStore.getState();
                    setMatch(null);
                    useGameStore.setState({ activeRoomCode: null });
                    setMatchResult(null);
                    onViewLobby();
                }}
            />

            {/* Exit Confirmation Modal */}
            <AnimatePresence>
                {showExitModal && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="glass-panel w-full max-w-sm rounded-3xl p-6 border border-white/10 shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        >
                            {/* Decorative background glow */}
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/15 rounded-full blur-3xl pointer-events-none" />

                            <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
                                <LogOut className="w-7 h-7" />
                            </div>

                            <h3 className="text-xl font-black text-white mb-2">الخروج من الماتش؟</h3>
                            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                هل أنت متأكد من مغادرة الماتش الحالي والعودة إلى اللوبي الرئيسي؟
                            </p>

                            <div className="flex items-center gap-3 w-full">
                                <button
                                    onClick={() => setShowExitModal(false)}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                                >
                                    إلغاء ومتابعة اللعب
                                </button>
                                <button
                                    onClick={handleConfirmExit}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs transition-all active:scale-95 shadow-lg shadow-red-900/30 cursor-pointer"
                                >
                                    تأكيد الخروج
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
