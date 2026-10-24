// Snake Layout Solver for Domino Chain
// Positions played dominoes in 2D space, turning 90 degrees when approaching responsive container edges.
// Uses center-based coordinates. All sizes in logical px at the board's intrinsic scale.

export interface LayoutNode {
    tile: number[]; // [left, right]
    x: number;      // Center X coordinate
    y: number;      // Center Y coordinate
    width: number;  // Render width
    height: number; // Render height
    rotation: number; // Rotation angle (0, 90, 180, 270)
    isDouble: boolean;
}

const TILE_W = 34; // Width of a vertical domino
const TILE_H = 68; // Height of a vertical domino (2x width)
const SPACING = 4; // Gap between tiles

/**
 * Given the chain AABB and the viewport dimensions, returns a recommended
 * CSS transform scale that fits the chain comfortably on screen.
 * Call this after every board update and lerp your zoom state toward it.
 */
export function computeAutoZoom(
    minX: number, maxX: number, minY: number, maxY: number,
    viewportW: number, viewportH: number,
    padding = 120
): number {
    const chainW = maxX - minX + padding * 2;
    const chainH = maxY - minY + padding * 2;
    if (chainW <= 0 || chainH <= 0) return 1;
    const scaleX = viewportW / chainW;
    const scaleY = viewportH / chainH;
    // Use the more constrained axis, clamp between 0.35 and 1.4
    return Math.min(1.4, Math.max(0.35, Math.min(scaleX, scaleY)));
}

export function solveBoardLayout(
    board: number[][],
    _containerWidth?: number
): { nodes: LayoutNode[]; minX: number; maxX: number; minY: number; maxY: number; leftDropZone?: any; rightDropZone?: any } {
    if (!board || board.length === 0) {
        return { nodes: [], minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    const nodes: LayoutNode[] = new Array(board.length);
    
    // Boundary where the initial horizontal chain turns 90 degrees Down (only once)
    const boundaryX = 260;

    // We start laying out from the middle of the board chain to keep it centered
    const midIdx = Math.floor(board.length / 2);
    
    // Place middle tile at (0, 0)
    const midTile = board[midIdx];
    const isMidDouble = midTile[0] === midTile[1];
    
    let midRot = isMidDouble ? 0 : -90;
    if (!isMidDouble && midTile[0] > midTile[1]) {
        midRot += 180;
    }

    nodes[midIdx] = {
        tile: midTile,
        x: 0,
        y: 0,
        width: isMidDouble ? TILE_W : TILE_H,
        height: isMidDouble ? TILE_H : TILE_W,
        rotation: midRot,
        isDouble: isMidDouble
    };

    // Branch state tracker
    interface BranchState {
        x: number;
        y: number;
        dir: number; // 0 = Right, 1 = Down, 2 = Left
        prevNode: LayoutNode;
        stepCount: number;
    }

    // Branch 1: Right Branch (from midIdx + 1 to board.length - 1)
    let rightState: BranchState = {
        x: nodes[midIdx].x,
        y: nodes[midIdx].y,
        dir: 0, // Default grow Right
        prevNode: nodes[midIdx],
        stepCount: 0
    };

    for (let i = midIdx + 1; i < board.length; i++) {
        const tile = board[i];
        const nextNode = calculateNextNode(tile, rightState, boundaryX, true);
        nodes[i] = nextNode;
        
        rightState.x = nextNode.x;
        rightState.y = nextNode.y;
        rightState.prevNode = nextNode;
    }

    // Branch 2: Left Branch (from midIdx - 1 down to 0)
    let leftState: BranchState = {
        x: nodes[midIdx].x,
        y: nodes[midIdx].y,
        dir: 2, // Default grow Left
        prevNode: nodes[midIdx],
        stepCount: 0
    };

    for (let i = midIdx - 1; i >= 0; i--) {
        const tile = board[i];
        const nextNode = calculateNextNode(tile, leftState, boundaryX, false);
        nodes[i] = nextNode;

        leftState.x = nextNode.x;
        leftState.y = nextNode.y;
        leftState.prevNode = nextNode;
    }

    // Calculate bounding box of the layout
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    nodes.forEach(n => {
        const hw = n.width / 2;
        const hh = n.height / 2;
        minX = Math.min(minX, n.x - hw);
        maxX = Math.max(maxX, n.x + hw);
        minY = Math.min(minY, n.y - hh);
        maxY = Math.max(maxY, n.y + hh);
    });

    // Calculate drop zone positions adjacent to the open ends
    let leftDropZone = null;
    let rightDropZone = null;

    if (nodes.length > 0) {
        const leftNode = nodes[0];
        const rightNode = nodes[nodes.length - 1];

        // Left drop zone offset
        const leftIsHoriz = leftState.dir === 0 || leftState.dir === 2;
        const leftDSize = leftIsHoriz ? leftNode.width : leftNode.height;
        const leftDist = (leftDSize + TILE_H) / 2 + SPACING;
        leftDropZone = {
            x: leftNode.x + (leftState.dir === 0 ? leftDist : leftState.dir === 2 ? -leftDist : 0),
            y: leftNode.y + (leftState.dir === 1 ? leftDist : 0),
            width: leftIsHoriz ? TILE_H : TILE_W,
            height: leftIsHoriz ? TILE_W : TILE_H,
            side: 'left' as const
        };

        // Right drop zone offset
        const rightIsHoriz = rightState.dir === 0 || rightState.dir === 2;
        const rightDSize = rightIsHoriz ? rightNode.width : rightNode.height;
        const rightDist = (rightDSize + TILE_H) / 2 + SPACING;
        rightDropZone = {
            x: rightNode.x + (rightState.dir === 0 ? rightDist : rightState.dir === 2 ? -rightDist : 0),
            y: rightNode.y + (rightState.dir === 1 ? rightDist : 0),
            width: rightIsHoriz ? TILE_H : TILE_W,
            height: rightIsHoriz ? TILE_W : TILE_H,
            side: 'right' as const
        };
    }

    return {
        nodes,
        minX,
        maxX,
        minY,
        maxY,
        leftDropZone,
        rightDropZone
    };
}

// Computes the next layout node given a branch state and bounds
function calculateNextNode(
    tile: number[],
    state: { x: number; y: number; dir: number; prevNode: LayoutNode; stepCount: number },
    boundaryX: number,
    isRightBranch: boolean
): LayoutNode {
    const isDbl = tile[0] === tile[1];
    const prev = state.prevNode;
    const oldDir = state.dir;

    let newDir = oldDir;

    // Single 90-degree corner turn: once turned down (1), it continues going down
    if (isRightBranch) {
        if (oldDir === 0) {
            const nextW = isDbl ? TILE_W : TILE_H;
            if (prev.x + prev.width / 2 + SPACING + nextW > boundaryX) {
                newDir = 1; // Turn down 90 degrees
                state.stepCount = 0;
            }
        }
    } else {
        if (oldDir === 2) {
            const nextW = isDbl ? TILE_W : TILE_H;
            if (prev.x - prev.width / 2 - SPACING - nextW < -boundaryX) {
                newDir = 1; // Turn down 90 degrees
                state.stepCount = 0;
            }
        }
    }

    state.dir = newDir;

    // Dimension for the new tile
    const nextWidth = (newDir === 0 || newDir === 2) 
        ? (isDbl ? TILE_W : TILE_H) 
        : (isDbl ? TILE_H : TILE_W);
    const nextHeight = (newDir === 0 || newDir === 2) 
        ? (isDbl ? TILE_H : TILE_W) 
        : (isDbl ? TILE_W : TILE_H);

    let nx = prev.x;
    let ny = prev.y;

    if (oldDir === newDir) {
        // Continuing straight in the same direction
        if (newDir === 0) {
            nx = prev.x + (prev.width + nextWidth) / 2 + SPACING;
            ny = prev.y;
        } else if (newDir === 2) {
            nx = prev.x - (prev.width + nextWidth) / 2 - SPACING;
            ny = prev.y;
        } else if (newDir === 1) {
            nx = prev.x;
            ny = prev.y + (prev.height + nextHeight) / 2 + SPACING;
        }
    } else if ((oldDir === 0 || oldDir === 2) && newDir === 1) {
        // Turned horizontal to Down
        nx = oldDir === 0
            ? (prev.isDouble ? prev.x : prev.x + TILE_W / 2)
            : (prev.isDouble ? prev.x : prev.x - TILE_W / 2);
        ny = prev.y + (prev.height / 2) + SPACING + (nextHeight / 2);
    }

    // Determine correct rotation to ensure matching numbers face each other
    let rot = 0;
    if (isDbl) {
        rot = (newDir === 0 || newDir === 2) ? 0 : 90;
    } else {
        if (isRightBranch) {
            if (newDir === 0) rot = -90; // Grow Right: Top goes Left
            else if (newDir === 1) rot = 0; // Grow Down: Top goes Top
        } else {
            if (newDir === 2) rot = -90; // Grow Left: Bottom goes Right
            else if (newDir === 1) rot = 180; // Grow Down: Bottom goes Top
        }
        
        // Correct for domino spritesheet always having the smaller number on Top
        if (tile[0] > tile[1]) {
            rot += 180;
        }
    }

    state.stepCount++;

    return {
        tile,
        x: nx,
        y: ny,
        width: nextWidth,
        height: nextHeight,
        rotation: rot,
        isDouble: isDbl
    };
}
