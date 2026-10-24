/**
 * Client-Side In-Browser Domino Engine & Fetch Interceptor
 * Allows playing offline, against AI (1v1 & 2v2), and hosting on Vercel without a backend!
 */

interface MatchState {
  match_id: number;
  mode: string;
  status: string;
  target_score: number;
  round_number: number;
  round_status: string;
  board: number[][];
  left_end: number | null;
  right_end: number | null;
  boneyard: number[][];
  current_turn_player_id: number | null;
  turn_deadline: string | null;
  players: any[];
  scores: Record<number, number>;
  team_scores: Record<number, number> | null;
  hands: Record<number, number[][]>;
  winner_id: number | null;
  winning_team_index: number | null;
  last_round_result: any | null;
  round_history?: Array<{ round_number: number; winner_id: number; points_awarded: number }>;
}

const ALL_DOMINOES: number[][] = [
  [0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6],
  [1,1], [1,2], [1,3], [1,4], [1,5], [1,6],
  [2,2], [2,3], [2,4], [2,5], [2,6],
  [3,3], [3,4], [3,5], [3,6],
  [4,4], [4,5], [4,6],
  [5,5], [5,6],
  [6,6]
];

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let activeMatchState: MatchState | null = null;
let rooms: Record<string, any> = {};

let currentGuestUser = {
  id: 1,
  username: 'Guest_Player',
  avatar: 'avatar_crown',
  email: 'guest@domino.io'
};

function findPlayableTile(hand: number[][], left: number | null, right: number | null): { tile: number[], side: 'left' | 'right' | 'start' } | null {
  if (left === null && right === null) {
    let chosen = hand[0];
    for (let d = 6; d >= 0; d--) {
      const found = hand.find(t => t[0] === d && t[1] === d);
      if (found) {
        chosen = found;
        break;
      }
    }
    return { tile: chosen, side: 'start' };
  }

  for (const tile of hand) {
    if (left !== null && (tile[0] === left || tile[1] === left)) {
      return { tile, side: 'left' };
    }
    if (right !== null && (tile[0] === right || tile[1] === right)) {
      return { tile, side: 'right' };
    }
  }
  return null;
}

function getNextPlayerId(currentId: number): number {
  if (!activeMatchState) return 1;
  if (activeMatchState.mode === '1v1') {
    return currentId === 1 ? 999 : 1;
  }
  const currPlayer = activeMatchState.players.find(p => p.id === currentId);
  const currSeat = currPlayer ? currPlayer.seat_index : 0;
  const nextSeat = (currSeat + 1) % 4;
  const nextPlayer = activeMatchState.players.find(p => p.seat_index === nextSeat);
  return nextPlayer ? nextPlayer.id : 1;
}

function createNewBotMatch(targetScore: number = 101, mode: '1v1' | '2v2' = '1v1'): MatchState {
  const shuffled = shuffle(ALL_DOMINOES);

  if (mode === '2v2') {
    const p1Hand = shuffled.slice(0, 7);
    const rival1Hand = shuffled.slice(7, 14);
    const partnerHand = shuffled.slice(14, 21);
    const rival2Hand = shuffled.slice(21, 28);
    const boneyard: number[][] = [];

    const hands: Record<number, number[][]> = {
      1: p1Hand,
      998: rival1Hand,
      997: partnerHand,
      999: rival2Hand
    };

    let starterId = 1;
    for (let d = 6; d >= 0; d--) {
      if (p1Hand.some(t => t[0] === d && t[1] === d)) { starterId = 1; break; }
      if (rival1Hand.some(t => t[0] === d && t[1] === d)) { starterId = 998; break; }
      if (partnerHand.some(t => t[0] === d && t[1] === d)) { starterId = 997; break; }
      if (rival2Hand.some(t => t[0] === d && t[1] === d)) { starterId = 999; break; }
    }

    const deadline = new Date(Date.now() + 30000).toISOString();

    activeMatchState = {
      match_id: 1,
      mode: '2v2',
      status: 'active',
      target_score: targetScore,
      round_number: 1,
      round_status: 'in_progress',
      board: [],
      left_end: null,
      right_end: null,
      boneyard,
      current_turn_player_id: starterId,
      turn_deadline: deadline,
      players: [
        {
          id: 1,
          username: currentGuestUser.username,
          avatar: currentGuestUser.avatar,
          seat_index: 0,
          team_index: 0,
          tile_count: 7,
          is_connected: true,
          is_bot: false,
          reconnect_deadline: null
        },
        {
          id: 998,
          username: 'Domino AI 1',
          avatar: 'avatar_fire',
          seat_index: 1,
          team_index: 1,
          tile_count: 7,
          is_connected: true,
          is_bot: true,
          reconnect_deadline: null
        },
        {
          id: 997,
          username: 'Domino Partner',
          avatar: 'avatar_shield',
          seat_index: 2,
          team_index: 0,
          tile_count: 7,
          is_connected: true,
          is_bot: true,
          reconnect_deadline: null
        },
        {
          id: 999,
          username: 'Domino AI 2',
          avatar: 'avatar_zap',
          seat_index: 3,
          team_index: 1,
          tile_count: 7,
          is_connected: true,
          is_bot: true,
          reconnect_deadline: null
        }
      ],
      scores: { 1: 0, 998: 0, 997: 0, 999: 0 },
      team_scores: { 0: 0, 1: 0 },
      hands,
      winner_id: null,
      winning_team_index: null,
      last_round_result: null,
      round_history: []
    };

    if (starterId !== 1) {
      setTimeout(() => executeBotTurn(starterId), 1000);
    }

    return activeMatchState;
  }

  // 1v1 Mode
  const playerHand = shuffled.slice(0, 7);
  const botHand = shuffled.slice(7, 14);
  const boneyard = shuffled.slice(14);

  let starterId = 1;
  for (let d = 6; d >= 0; d--) {
    if (playerHand.some(t => t[0] === d && t[1] === d)) { starterId = 1; break; }
    if (botHand.some(t => t[0] === d && t[1] === d)) { starterId = 999; break; }
  }

  const deadline = new Date(Date.now() + 30000).toISOString();

  activeMatchState = {
    match_id: 1,
    mode: '1v1',
    status: 'active',
    target_score: targetScore,
    round_number: 1,
    round_status: 'in_progress',
    board: [],
    left_end: null,
    right_end: null,
    boneyard,
    current_turn_player_id: starterId,
    turn_deadline: deadline,
    players: [
      {
        id: 1,
        username: currentGuestUser.username,
        avatar: currentGuestUser.avatar,
        seat_index: 0,
        team_index: null,
        tile_count: 7,
        is_connected: true,
        is_bot: false,
        reconnect_deadline: null
      },
      {
        id: 999,
        username: 'Domino AI',
        avatar: 'avatar_zap',
        seat_index: 1,
        team_index: null,
        tile_count: 7,
        is_connected: true,
        is_bot: true,
        reconnect_deadline: null
      }
    ],
    scores: { 1: 0, 999: 0 },
    team_scores: null,
    hands: {
      1: playerHand,
      999: botHand
    },
    winner_id: null,
    winning_team_index: null,
    last_round_result: null,
    round_history: []
  };

  if (starterId === 999) {
    setTimeout(() => executeBotTurn(999), 1000);
  }

  return activeMatchState;
}

function startNextRound(): MatchState | null {
  if (!activeMatchState) return null;

  const isFinished = activeMatchState.status === 'completed' ||
    (activeMatchState.mode === '2v2'
      ? ((activeMatchState.team_scores?.[0] || 0) >= activeMatchState.target_score || (activeMatchState.team_scores?.[1] || 0) >= activeMatchState.target_score)
      : Object.values(activeMatchState.scores).some(sc => sc >= activeMatchState!.target_score));

  if (isFinished) {
    activeMatchState.status = 'completed';
    return activeMatchState;
  }

  const shuffled = shuffle(ALL_DOMINOES);
  const prevWinner = activeMatchState.winner_id || 1;
  const deadline = new Date(Date.now() + 30000).toISOString();

  activeMatchState.round_number += 1;
  activeMatchState.round_status = 'in_progress';
  activeMatchState.status = 'active';
  activeMatchState.board = [];
  activeMatchState.left_end = null;
  activeMatchState.right_end = null;
  activeMatchState.current_turn_player_id = prevWinner;
  activeMatchState.turn_deadline = deadline;
  activeMatchState.last_round_result = null;

  if (activeMatchState.mode === '2v2') {
    activeMatchState.boneyard = [];
    activeMatchState.hands = {
      1: shuffled.slice(0, 7),
      998: shuffled.slice(7, 14),
      997: shuffled.slice(14, 21),
      999: shuffled.slice(21, 28)
    };
    activeMatchState.players.forEach(p => { p.tile_count = 7; });
  } else {
    activeMatchState.boneyard = shuffled.slice(14);
    activeMatchState.hands = {
      1: shuffled.slice(0, 7),
      999: shuffled.slice(7, 14)
    };
    activeMatchState.players.forEach(p => { p.tile_count = 7; });
  }

  if (prevWinner !== 1) {
    setTimeout(() => executeBotTurn(prevWinner), 1000);
  }

  return activeMatchState;
}

function checkIfGameBlocked() {
  if (!activeMatchState || activeMatchState.round_status !== 'in_progress') return;
  if (activeMatchState.boneyard.length > 0) return;

  const left = activeMatchState.left_end;
  const right = activeMatchState.right_end;

  const anyCanPlay = activeMatchState.players.some(p => {
    const hand = activeMatchState!.hands[p.id] || [];
    return findPlayableTile(hand, left, right) !== null;
  });

  if (!anyCanPlay) {
    endRoundBlocked();
  }
}

function endRoundBlocked() {
  if (!activeMatchState) return;

  if (activeMatchState.mode === '2v2') {
    const team0Hands = [...(activeMatchState.hands[1] || []), ...(activeMatchState.hands[997] || [])];
    const team1Hands = [...(activeMatchState.hands[998] || []), ...(activeMatchState.hands[999] || [])];
    const pts0 = team0Hands.reduce((acc, t) => acc + t[0] + t[1], 0);
    const pts1 = team1Hands.reduce((acc, t) => acc + t[0] + t[1], 0);

    let winTeam = 0;
    let pointsAwarded = 0;
    let loserHand: number[][] = [];

    if (pts0 < pts1) {
      winTeam = 0;
      pointsAwarded = pts1;
      loserHand = team1Hands;
    } else if (pts1 < pts0) {
      winTeam = 1;
      pointsAwarded = pts0;
      loserHand = team0Hands;
    } else {
      winTeam = 0;
      pointsAwarded = 0;
      loserHand = [];
    }

    const winnerPlayer = activeMatchState.players.find(p => p.team_index === winTeam);
    const winnerId = winnerPlayer ? winnerPlayer.id : 1;

    if (!activeMatchState.team_scores) activeMatchState.team_scores = { 0: 0, 1: 0 };
    activeMatchState.team_scores[winTeam] = (activeMatchState.team_scores[winTeam] || 0) + pointsAwarded;
    activeMatchState.scores[winnerId] = (activeMatchState.scores[winnerId] || 0) + pointsAwarded;
    activeMatchState.round_status = 'completed';
    activeMatchState.winner_id = winnerId;
    activeMatchState.current_turn_player_id = null;
    activeMatchState.turn_deadline = null;

    if (activeMatchState.team_scores[winTeam] >= activeMatchState.target_score) {
      activeMatchState.status = 'completed';
      activeMatchState.winning_team_index = winTeam;
    }

    if (!activeMatchState.round_history) activeMatchState.round_history = [];
    activeMatchState.round_history.push({
      round_number: activeMatchState.round_number,
      winner_id: winnerId,
      points_awarded: pointsAwarded
    });

    activeMatchState.last_round_result = {
      winner_id: winnerId,
      winner_name: winTeam === 0 ? 'Your Team (فريقك)' : 'Opponent Team (الخصوم)',
      reason: 'blocked_table',
      loser_hand: [...loserHand],
      points_breakdown: loserHand.map(t => ({ tile: t, dots: t[0] + t[1] })),
      points_awarded: pointsAwarded,
      scores: { ...activeMatchState.scores },
      team_scores: { ...activeMatchState.team_scores },
      target_score: activeMatchState.target_score,
      is_match_over: activeMatchState.status === 'completed'
    };
    return;
  }

  // 1v1 blocked
  const h1 = activeMatchState.hands[1] || [];
  const h2 = activeMatchState.hands[999] || [];
  const pts1 = h1.reduce((acc, t) => acc + t[0] + t[1], 0);
  const pts2 = h2.reduce((acc, t) => acc + t[0] + t[1], 0);

  let winnerId = 1;
  let pointsAwarded = 0;
  let loserHand: number[][] = [];

  if (pts1 < pts2) {
    winnerId = 1;
    pointsAwarded = pts2;
    loserHand = h2;
  } else if (pts2 < pts1) {
    winnerId = 999;
    pointsAwarded = pts1;
    loserHand = h1;
  } else {
    winnerId = 1;
    pointsAwarded = 0;
    loserHand = [];
  }

  activeMatchState.scores[winnerId] = (activeMatchState.scores[winnerId] || 0) + pointsAwarded;
  activeMatchState.round_status = 'completed';
  activeMatchState.winner_id = winnerId;
  activeMatchState.current_turn_player_id = null;
  activeMatchState.turn_deadline = null;

  if (!activeMatchState.round_history) activeMatchState.round_history = [];
  activeMatchState.round_history.push({
    round_number: activeMatchState.round_number,
    winner_id: winnerId,
    points_awarded: pointsAwarded
  });

  if (activeMatchState.scores[winnerId] >= activeMatchState.target_score) {
    activeMatchState.status = 'completed';
  }

  const winnerName = winnerId === 1 ? currentGuestUser.username : 'Domino AI';
  const loserName = winnerId === 1 ? 'Domino AI' : currentGuestUser.username;

  activeMatchState.last_round_result = {
    winner_id: winnerId,
    winner_name: winnerName,
    loser_id: winnerId === 1 ? 999 : 1,
    loser_name: loserName,
    reason: 'blocked_table',
    loser_hand: [...loserHand],
    points_breakdown: loserHand.map(t => ({ tile: t, dots: t[0] + t[1] })),
    points_awarded: pointsAwarded,
    scores: { ...activeMatchState.scores },
    target_score: activeMatchState.target_score,
    is_match_over: activeMatchState.status === 'completed' || activeMatchState.scores[winnerId] >= activeMatchState.target_score
  };
}

function passTurn(userId: number) {
  if (!activeMatchState) return;
  const nextId = getNextPlayerId(userId);
  activeMatchState.current_turn_player_id = nextId;
  activeMatchState.turn_deadline = new Date(Date.now() + 30000).toISOString();

  checkIfGameBlocked();

  if (activeMatchState.round_status === 'in_progress') {
    if (nextId !== 1) {
      setTimeout(() => executeBotTurn(nextId), 800);
    }
  }
}

function executeBotTurn(botId?: number) {
  if (!activeMatchState || activeMatchState.status !== 'active' || activeMatchState.round_status !== 'in_progress') return;
  const currentId = botId ?? activeMatchState.current_turn_player_id;
  if (!currentId || currentId === 1) return;
  if (activeMatchState.current_turn_player_id !== currentId) return;

  const botHand = activeMatchState.hands[currentId] || [];
  const left = activeMatchState.left_end;
  const right = activeMatchState.right_end;

  let move = findPlayableTile(botHand, left, right);

  if (move) {
    applyPlay(currentId, move.tile, move.side);
  } else {
    if (activeMatchState.mode === '1v1' && activeMatchState.boneyard.length > 0) {
      let played = false;
      while (activeMatchState.boneyard.length > 0 && !played) {
        const drawn = activeMatchState.boneyard.pop()!;
        botHand.push(drawn);
        const botPlayer = activeMatchState.players.find(p => p.id === currentId);
        if (botPlayer) botPlayer.tile_count = botHand.length;

        const newMove = findPlayableTile([drawn], activeMatchState.left_end, activeMatchState.right_end);
        if (newMove) {
          applyPlay(currentId, newMove.tile, newMove.side);
          played = true;
          break;
        }
      }
      if (!played) {
        passTurn(currentId);
      }
    } else {
      passTurn(currentId);
    }
  }
}

function applyPlay(userId: number, tile: number[], side: 'left' | 'right' | 'start') {
  if (!activeMatchState) return;

  const userHand = activeMatchState.hands[userId] || [];
  const idx = userHand.findIndex(t => (t[0] === tile[0] && t[1] === tile[1]) || (t[0] === tile[1] && t[1] === tile[0]));
  if (idx !== -1) {
    userHand.splice(idx, 1);
  }

  const p = activeMatchState.players.find(pl => pl.id === userId);
  if (p) p.tile_count = userHand.length;

  if (side === 'start' || activeMatchState.board.length === 0) {
    activeMatchState.board = [tile];
    activeMatchState.left_end = tile[0];
    activeMatchState.right_end = tile[1];
  } else if (side === 'left') {
    const currentLeft = activeMatchState.left_end;
    let oriented = tile;
    if (tile[1] === currentLeft) {
      oriented = tile;
      activeMatchState.left_end = tile[0];
    } else if (tile[0] === currentLeft) {
      oriented = [tile[1], tile[0]];
      activeMatchState.left_end = tile[1];
    }
    activeMatchState.board.unshift(oriented);
  } else if (side === 'right') {
    const currentRight = activeMatchState.right_end;
    let oriented = tile;
    if (tile[0] === currentRight) {
      oriented = tile;
      activeMatchState.right_end = tile[1];
    } else if (tile[1] === currentRight) {
      oriented = [tile[1], tile[0]];
      activeMatchState.right_end = tile[0];
    }
    activeMatchState.board.push(oriented);
  }

  if (userHand.length === 0) {
    activeMatchState.round_status = 'completed';
    activeMatchState.winner_id = userId;
    activeMatchState.current_turn_player_id = null;
    activeMatchState.turn_deadline = null;

    let points = 0;
    let loserHand: number[][] = [];
    const winnerPlayer = activeMatchState.players.find(pl => pl.id === userId);
    const winnerName = winnerPlayer ? winnerPlayer.username : 'Player';

    if (activeMatchState.mode === '2v2') {
      const winTeam = winnerPlayer ? winnerPlayer.team_index : 0;
      const loseTeam = 1 - (winTeam ?? 0);
      const losingPlayers = activeMatchState.players.filter(pl => pl.team_index === loseTeam);

      losingPlayers.forEach(lp => {
        const h = activeMatchState!.hands[lp.id] || [];
        loserHand.push(...h);
        points += h.reduce((acc, t) => acc + t[0] + t[1], 0);
      });

      if (!activeMatchState.team_scores) activeMatchState.team_scores = { 0: 0, 1: 0 };
      activeMatchState.team_scores[winTeam ?? 0] = (activeMatchState.team_scores[winTeam ?? 0] || 0) + points;
      activeMatchState.scores[userId] = (activeMatchState.scores[userId] || 0) + points;

      if (activeMatchState.team_scores[winTeam ?? 0] >= activeMatchState.target_score) {
        activeMatchState.status = 'completed';
        activeMatchState.winning_team_index = winTeam;
      }
    } else {
      const oppId = userId === 1 ? 999 : 1;
      const oppHand = activeMatchState.hands[oppId] || [];
      loserHand = [...oppHand];
      points = oppHand.reduce((acc, t) => acc + t[0] + t[1], 0);
      activeMatchState.scores[userId] = (activeMatchState.scores[userId] || 0) + points;

      if (activeMatchState.scores[userId] >= activeMatchState.target_score) {
        activeMatchState.status = 'completed';
      }
    }

    if (!activeMatchState.round_history) activeMatchState.round_history = [];
    activeMatchState.round_history.push({
      round_number: activeMatchState.round_number,
      winner_id: userId,
      points_awarded: points
    });

    activeMatchState.last_round_result = {
      winner_id: userId,
      winner_name: winnerName,
      reason: 'domino',
      loser_hand: [...loserHand],
      points_breakdown: loserHand.map(t => ({ tile: t, dots: t[0] + t[1] })),
      points_awarded: points,
      scores: { ...activeMatchState.scores },
      team_scores: activeMatchState.team_scores ? { ...activeMatchState.team_scores } : null,
      target_score: activeMatchState.target_score,
      is_match_over: activeMatchState.status === 'completed'
    };
    return;
  }

  const nextId = getNextPlayerId(userId);
  activeMatchState.current_turn_player_id = nextId;
  activeMatchState.turn_deadline = new Date(Date.now() + 30000).toISOString();

  if (nextId !== 1) {
    setTimeout(() => executeBotTurn(nextId), 850);
  } else {
    checkIfGameBlocked();
  }
}

export function handleClientApi(url: string, method: string, parsed: any = {}): { status: number; data: any } {
  const normUrl = url.split('?')[0];

  if (normUrl === '/api/login/guest') {
    const username = parsed.username || 'Guest_' + Math.floor(1000 + Math.random() * 9000);
    const avatar = parsed.avatar || 'avatar_crown';
    currentGuestUser = { id: 1, username, avatar, email: `${username.toLowerCase()}@domino.local` };
    return { status: 200, data: { token: 'client_jwt_token', user: currentGuestUser } };
  }

  if (normUrl === '/api/login' || normUrl === '/api/register') {
    const username = parsed.username || 'Player';
    const avatar = parsed.avatar || 'avatar_crown';
    currentGuestUser = { id: 1, username, avatar, email: parsed.email || 'player@domino.io' };
    return { status: 200, data: { token: 'client_jwt_token', user: currentGuestUser } };
  }

  if (normUrl === '/api/logout') {
    return { status: 200, data: { message: 'Logged out successfully' } };
  }

  if (normUrl === '/api/profile') {
    return { status: 200, data: { user: currentGuestUser } };
  }

  if (normUrl === '/api/statistics') {
    return { status: 200, data: { matches_played: 14, matches_won: 9, rounds_played: 42, rounds_won: 26, total_points: 385 } };
  }

  if (normUrl === '/api/profile/avatar') {
    if (parsed.avatar) currentGuestUser.avatar = parsed.avatar;
    return { status: 200, data: { avatar: currentGuestUser.avatar, message: 'Avatar updated' } };
  }

  if (normUrl === '/api/rooms' && method === 'POST') {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRoom = {
      id: Date.now(),
      code,
      name: parsed.name || `${currentGuestUser.username}'s Arena`,
      host_id: currentGuestUser.id,
      players_count: parsed.players_count || 2,
      target_score: parsed.target_score || 101,
      is_private: true,
      status: 'lobby',
      players: [
        { id: currentGuestUser.id, username: currentGuestUser.username, avatar: currentGuestUser.avatar, slot_index: 0, is_ready: true }
      ]
    };
    rooms[code] = newRoom;
    return { status: 201, data: newRoom };
  }

  if (normUrl === '/api/rooms/join' && method === 'POST') {
    const code = (parsed.code || '').toUpperCase();
    let room = rooms[code];
    if (!room) {
      room = {
        id: Date.now(),
        code,
        name: `Room ${code}`,
        host_id: 88,
        players_count: 2,
        target_score: 101,
        is_private: true,
        status: 'lobby',
        players: [
          { id: 88, username: 'RoomHost', avatar: 'avatar_shield', slot_index: 0, is_ready: true },
          { id: currentGuestUser.id, username: currentGuestUser.username, avatar: currentGuestUser.avatar, slot_index: 1, is_ready: false }
        ]
      };
      rooms[code] = room;
    } else {
      if (!room.players.some((p: any) => p.id === currentGuestUser.id)) {
        room.players.push({
          id: currentGuestUser.id,
          username: currentGuestUser.username,
          avatar: currentGuestUser.avatar,
          slot_index: room.players.length,
          is_ready: false
        });
      }
    }
    return { status: 200, data: room };
  }

  if (normUrl.startsWith('/api/rooms/') && normUrl.endsWith('/ready')) {
    const code = normUrl.split('/')[3].toUpperCase();
    const room = rooms[code];
    if (room) {
      const me = room.players.find((p: any) => p.id === currentGuestUser.id);
      if (me) me.is_ready = !me.is_ready;
    }
    return { status: 200, data: { ok: true } };
  }

  if (normUrl.startsWith('/api/rooms/') && normUrl.endsWith('/start')) {
    const match = createNewBotMatch();
    return { status: 200, data: { match_id: match.match_id } };
  }

  if (normUrl.startsWith('/api/rooms/') && normUrl.endsWith('/chat')) {
    return { status: 200, data: { username: currentGuestUser.username, avatar: currentGuestUser.avatar, message: parsed.message || '', type: 'chat', timestamp: new Date().toISOString() } };
  }

  if (normUrl.startsWith('/api/rooms/') && normUrl.endsWith('/leave')) {
    return { status: 200, data: { ok: true } };
  }

  if (normUrl === '/api/rooms/bot-match') {
    const targetScore = (parsed && parsed.target_score) ? parsed.target_score : 101;
    const mode = (parsed && parsed.mode) ? parsed.mode : '1v1';
    const match = createNewBotMatch(targetScore, mode);
    return { status: 200, data: { match_id: match.match_id, room_code: 'AI_MATCH' } };
  }

  if (normUrl.includes('/next-round') && method === 'POST') {
    const updated = startNextRound();
    return { status: 200, data: updated || { ok: true } };
  }

  if (normUrl.startsWith('/api/matches/') && !normUrl.includes('/play') && !normUrl.includes('/draw') && !normUrl.includes('/pass') && !normUrl.includes('/report')) {
    if (!activeMatchState) {
      createNewBotMatch();
    }
    const match = activeMatchState!;
    const hasFinished = match.mode === '2v2'
      ? ((match.team_scores?.[0] || 0) >= match.target_score || (match.team_scores?.[1] || 0) >= match.target_score)
      : Object.values(match.scores).some(sc => sc >= match.target_score);
    if (hasFinished) {
      match.status = 'completed';
    }
    return {
      status: 200,
      data: {
        match_id: match.match_id,
        mode: match.mode,
        status: match.status,
        target_score: match.target_score,
        round_number: match.round_number,
        round_status: match.round_status,
        board: match.board,
        left_end: match.left_end,
        right_end: match.right_end,
        boneyard_count: match.boneyard.length,
        current_turn_player_id: match.current_turn_player_id,
        turn_deadline: match.turn_deadline,
        players: match.players,
        scores: match.scores,
        team_scores: match.team_scores,
        my_hand: match.hands[1] || [],
        winner_id: match.winner_id,
        winning_team_index: match.winning_team_index,
        round_result: match.last_round_result,
        round_history: match.round_history || []
      }
    };
  }

  if (normUrl.includes('/play') && method === 'POST') {
    if (!activeMatchState) return { status: 404, data: { message: 'Match not found' } };
    applyPlay(1, parsed.tile, parsed.side);
    return { status: 200, data: { ok: true } };
  }

  if (normUrl.includes('/draw') && method === 'POST') {
    if (!activeMatchState) return { status: 404, data: { message: 'Match not found' } };
    if (activeMatchState.boneyard.length > 0) {
      const tile = activeMatchState.boneyard.pop()!;
      activeMatchState.hands[1].push(tile);
      const p = activeMatchState.players.find(pl => pl.id === 1);
      if (p) p.tile_count = activeMatchState.hands[1].length;
    }
    return { status: 200, data: { ok: true } };
  }

  if (normUrl.includes('/pass') && method === 'POST') {
    if (!activeMatchState) return { status: 404, data: { message: 'Match not found' } };
    passTurn(1);
    return { status: 200, data: { ok: true } };
  }

  if (normUrl.includes('/report-reconnect') || normUrl.includes('/report-disconnect')) {
    return { status: 200, data: { ok: true } };
  }

  return { status: 200, data: { ok: true } };
}

/**
 * Automatically intercepts browser fetch for /api routes
 * When deployed to Vercel, static CDN returns 404 for /api, so this handles it seamlessly!
 */
export function setupClientEngine() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    const isApi = urlStr.startsWith('/api') || urlStr.includes('/api/');

    if (isApi) {
      try {
        const response = await originalFetch(input, init);
        if (response.status !== 404 && response.status !== 502) {
          return response;
        }
      } catch {
        // network failure or offline
      }

      // Intercept and handle with Client Engine!
      let parsedBody: any = {};
      try {
        if (init?.body && typeof init.body === 'string') {
          parsedBody = JSON.parse(init.body);
        }
      } catch {}

      const cleanPath = urlStr.startsWith('http') ? new URL(urlStr).pathname : urlStr;
      const res = handleClientApi(cleanPath, init?.method || 'GET', parsedBody);

      return new Response(JSON.stringify(res.data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch(input, init);
  };
}
