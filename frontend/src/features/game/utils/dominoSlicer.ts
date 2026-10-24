// Domino Slicing and Caching Utility
// Slices the high-res 5000x5000px sprite sheet into 28 individual ivory domino assets.

const GRID_SPECS = {
    cols: [
        { start: 66, width: 559 },
        { start: 705, width: 559 },
        { start: 1343, width: 559 },
        { start: 1982, width: 559 },
        { start: 2621, width: 559 },
        { start: 3259, width: 559 },
        { start: 3898, width: 559 }
    ],
    rows: [
        { start: 77, height: 1118 },
        { start: 1274, height: 1118 },
        { start: 2471, height: 1118 },
        { start: 3668, height: 1118 }
    ]
};

const TILE_COORDS: Record<string, { row: number; col: number }> = {
    // Row 0
    "0-0": { row: 0, col: 0 },
    "0-1": { row: 0, col: 1 },
    "0-2": { row: 0, col: 2 },
    "0-3": { row: 0, col: 3 },
    "0-4": { row: 0, col: 4 },
    "0-5": { row: 0, col: 5 },
    "0-6": { row: 0, col: 6 },
    // Row 1
    "1-1": { row: 1, col: 0 },
    "1-2": { row: 1, col: 1 },
    "1-3": { row: 1, col: 2 },
    "1-4": { row: 1, col: 3 },
    "1-5": { row: 1, col: 4 },
    "1-6": { row: 1, col: 5 },
    "2-2": { row: 1, col: 6 },
    // Row 2
    "2-3": { row: 2, col: 0 },
    "2-4": { row: 2, col: 1 },
    "2-5": { row: 2, col: 2 },
    "2-6": { row: 2, col: 3 },
    "3-3": { row: 2, col: 4 },
    "3-4": { row: 2, col: 5 },
    "3-5": { row: 2, col: 6 },
    // Row 3
    "3-6": { row: 3, col: 0 },
    "4-4": { row: 3, col: 1 },
    "4-5": { row: 3, col: 2 },
    "4-6": { row: 3, col: 3 },
    "5-5": { row: 3, col: 4 },
    "5-6": { row: 3, col: 5 },
    "6-6": { row: 3, col: 6 }
};

class DominoSlicer {
    private cache: Record<string, string> = {};
    private isLoaded = false;
    private loadPromise: Promise<void> | null = null;
    private backCacheUrl: string = "";

    public load(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.src = '/domino_vectors.jpg';
            img.onload = () => {
                try {
                    this.sliceAll(img);
                    this.isLoaded = true;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = () => {
                reject(new Error('Failed to load domino vector image.'));
            };
        });

        return this.loadPromise;
    }

    private sliceAll(spriteImg: HTMLImageElement) {
        const renderWidth = 84;
        const renderHeight = 168;

        const canvas = document.createElement('canvas');
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) throw new Error('Could not get 2D canvas context');

        // Slice each of the 28 face-up tiles
        Object.entries(TILE_COORDS).forEach(([key, coords]) => {
            ctx.clearRect(0, 0, renderWidth, renderHeight);
            
            const colSpec = GRID_SPECS.cols[coords.col];
            const rowSpec = GRID_SPECS.rows[coords.row];

            ctx.drawImage(
                spriteImg,
                colSpec.start, rowSpec.start, colSpec.width, rowSpec.height, // Source crop
                0, 0, renderWidth, renderHeight // Destination fit
            );

            this.cache[key] = canvas.toDataURL('image/png');
        });

        // Slice a tile back: Crop the blank half of [0, 0] tile (Row 0, Col 0 white side)
        // and construct a textured card back with a subtle frame.
        ctx.clearRect(0, 0, renderWidth, renderHeight);
        
        const col0 = GRID_SPECS.cols[0];
        const row0 = GRID_SPECS.rows[0];

        // Draw top half
        ctx.drawImage(
            spriteImg,
            col0.start, row0.start, col0.width, row0.height / 2,
            0, 0, renderWidth, renderHeight / 2
        );
        // Draw bottom half
        ctx.drawImage(
            spriteImg,
            col0.start, row0.start + row0.height / 2, col0.width, row0.height / 2,
            0, renderHeight / 2, renderWidth, renderHeight / 2
        );

        // Add a premium dark gray/carbon inner border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, renderWidth - 4, renderHeight - 4);

        // Draw a central divider line
        ctx.beginPath();
        ctx.moveTo(4, renderHeight / 2);
        ctx.lineTo(renderWidth - 4, renderHeight / 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw a decorative diamond in the center
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.moveTo(renderWidth / 2, renderHeight / 2 - 10);
        ctx.lineTo(renderWidth / 2 + 10, renderHeight / 2);
        ctx.lineTo(renderWidth / 2, renderHeight / 2 + 10);
        ctx.lineTo(renderWidth / 2 - 10, renderHeight / 2);
        ctx.closePath();
        ctx.fill();

        this.backCacheUrl = canvas.toDataURL('image/png');
    }

    public getTileUrl(left: number, right: number): string {
        const sortedKey = left <= right ? `${left}-${right}` : `${right}-${left}`;
        return this.cache[sortedKey] || '';
    }

    public getBackUrl(): string {
        return this.backCacheUrl;
    }

    public ready(): boolean {
        return this.isLoaded;
    }
}

export const dominoSlicer = new DominoSlicer();
