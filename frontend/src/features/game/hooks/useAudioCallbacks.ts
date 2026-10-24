import { useCallback } from 'react';

export function useAudioCallbacks() {
    const onTilePlayed = useCallback(() => {
        console.log('[AUDIO HOOK] Tile Played Sound Effect');
        // Attach sound resource here in the future
    }, []);

    const onTileDrawn = useCallback(() => {
        console.log('[AUDIO HOOK] Tile Drawn Sound Effect');
        // Attach sound resource here in the future
    }, []);

    const onTurnChanged = useCallback((isMyTurn: boolean) => {
        console.log(`[AUDIO HOOK] Turn Changed Sound Effect. Is my turn? ${isMyTurn}`);
        // Attach sound resource here in the future
    }, []);

    const onRoundEnded = useCallback((isWinner: boolean) => {
        console.log(`[AUDIO HOOK] Round Ended Sound Effect. Did I win? ${isWinner}`);
        // Attach sound resource here in the future
    }, []);

    const onMatchWon = useCallback((isWinner: boolean) => {
        console.log(`[AUDIO HOOK] Match Finished Sound Effect. Did I win? ${isWinner}`);
        // Attach sound resource here in the future
    }, []);

    return {
        onTilePlayed,
        onTileDrawn,
        onTurnChanged,
        onRoundEnded,
        onMatchWon
    };
}
