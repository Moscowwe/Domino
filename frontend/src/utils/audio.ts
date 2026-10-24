class AudioManager {
    private ctx: AudioContext | null = null;

    private getCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    /**
     * Woody snap click for domino plays.
     */
    public playPlaced() {
        try {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(160, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.07);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);

            osc.start();
            osc.stop(ctx.currentTime + 0.07);
        } catch (e) {
            console.warn('Audio click playback suppressed by browser policy:', e);
        }
    }

    /**
     * Card sliding swish for boneyard draws.
     */
    public playDrawn() {
        try {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(250, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.12);

            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } catch (e) {
            console.warn('Audio playback suppressed:', e);
        }
    }

    /**
     * Warning beep for low turn time alerts.
     */
    public playWarning() {
        try {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);

            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.08);

            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } catch (e) {
            console.warn('Audio warning playback suppressed:', e);
        }
    }

    /**
     * Bright major chord arpeggio for round wins.
     */
    public playRoundWin() {
        try {
            const ctx = this.getCtx();
            const now = ctx.currentTime;
            const playNote = (freq: number, start: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, start);

                gain.gain.setValueAtTime(0.2, start);
                gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

                osc.start(start);
                osc.stop(start + duration);
            };

            playNote(261.63, now, 0.15); // C4
            playNote(329.63, now + 0.12, 0.15); // E4
            playNote(392.00, now + 0.24, 0.35); // G4
        } catch (e) {
            console.warn('Audio win arpeggio playback suppressed:', e);
        }
    }

    /**
     * Orchestrative scale climb for match victory.
     */
    public playMatchWin() {
        try {
            const ctx = this.getCtx();
            const now = ctx.currentTime;
            const playNote = (freq: number, start: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);

                gain.gain.setValueAtTime(0.2, start);
                gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

                osc.start(start);
                osc.stop(start + duration);
            };

            playNote(392.00, now, 0.15); // G4
            playNote(523.25, now + 0.12, 0.15); // C5
            playNote(659.25, now + 0.24, 0.15); // E5
            playNote(783.99, now + 0.36, 0.55); // G5
        } catch (e) {
            console.warn('Audio victory arpeggio playback suppressed:', e);
        }
    }
}

export const audio = new AudioManager();
