// Strong Connect 4 agent for the Arenova line-based protocol.
// Board coordinates: row 0 is the bottom row; columns are 0..6.

const ROWS = 6;
const COLS = 7;
const CELLS = ROWS * COLS;
const SEARCH_BUDGET_MS = 350;

let seat = null;
let myPlayer = null; // 1 = red, 2 = yellow when supplied by game-started/init.
const playerBySeat = new Map();
let requestsHandled = 0;

function idx(row, col) { return row * COLS + col; }

function learnIdentity(history) {
  for (const item of history) {
    const event = item.event ?? item;
    if (event.type !== "game-started") continue;

    if (event.you === 1 || event.you === 2) myPlayer = event.you;
    if (event.red !== undefined) playerBySeat.set(String(event.red), 1);
    if (event.yellow !== undefined) playerBySeat.set(String(event.yellow), 2);
  }

  // Support an init message if the general protocol provides one.
  if (typeof seat === "number" && (seat === 1 || seat === 2)) myPlayer = seat;
  if (seat !== null && playerBySeat.has(String(seat))) {
    myPlayer = playerBySeat.get(String(seat));
  }
}

function actorOf(event, moveIndex) {
  const explicitSeat = event.seat;
  if (explicitSeat !== undefined) return playerBySeat.get(String(explicitSeat)) ?? explicitSeat;
  if (event.player === 1 || event.player === 2) return event.player;
  if (event.playerId === 1 || event.playerId === 2) return event.playerId;
  if (event.color === "red" || event.color === "yellow") return event.color === "red" ? 1 : 2;

  // Last-resort fallback when a move has no player information.
  return moveIndex % 2 === 0 ? 1 : 2;
}

function isMine(actor) {
  if (myPlayer !== null && (actor === 1 || actor === 2)) return actor === myPlayer;
  if (seat !== null && String(actor) === String(seat)) return true;
  return false;
}

function buildBoard(history) {
  learnIdentity(history);
  const board = Array(CELLS).fill(0); // 0 empty, 1 us, -1 opponent
  let moveIndex = 0;

  for (const item of history) {
    const event = item.event ?? item;
    if (event.type !== "disc-dropped") continue;
    const col = Number(event.column);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) continue;

    let height = 0;
    while (height < ROWS && board[idx(height, col)] !== 0) height++;
    if (height >= ROWS) continue;

    const actor = actorOf(event, moveIndex);
    board[idx(height, col)] = isMine(actor) ? 1 : -1;
    moveIndex++;
  }
  return board;
}

function legalMoves(board) {
  // Center-first ordering improves alpha-beta pruning and is strategically sound.
  return [3, 2, 4, 1, 5, 0, 6].filter(c => board[idx(ROWS - 1, c)] === 0);
}

function drop(board, col, player) {
  for (let row = 0; row < ROWS; row++) {
    const pos = idx(row, col);
    if (board[pos] === 0) {
      board[pos] = player;
      return row;
    }
  }
  return -1;
}

function undo(board, col, row) { board[idx(row, col)] = 0; }

function hasWon(board, player) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[idx(row, col)] !== player) continue;
      if (col <= 3 && [1, 2, 3].every(d => board[idx(row, col + d)] === player)) return true;
      if (row <= 2 && [1, 2, 3].every(d => board[idx(row + d, col)] === player)) return true;
      if (col <= 3 && row <= 2 && [1, 2, 3].every(d => board[idx(row + d, col + d)] === player)) return true;
      if (col >= 3 && row <= 2 && [1, 2, 3].every(d => board[idx(row + d, col - d)] === player)) return true;
    }
  }
  return false;
}

function windowScore(values) {
  const us = values.filter(v => v === 1).length;
  const them = values.filter(v => v === -1).length;
  const empty = 4 - us - them;
  if (us && them) return 0;
  if (us === 4) return 100000;
  if (them === 4) return -100000;
  if (us === 3 && empty === 1) return 120;
  if (us === 2 && empty === 2) return 12;
  if (them === 3 && empty === 1) return -150; // defensive urgency
  if (them === 2 && empty === 2) return -15;
  return 0;
}

function evaluate(board) {
  let score = 0;
  for (let row = 0; row < ROWS; row++) {
    if (board[idx(row, 3)] === 1) score += 8;
    if (board[idx(row, 3)] === -1) score -= 8;
  }
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const [dr, dc] of directions) {
        const endRow = row + 3 * dr, endCol = col + 3 * dc;
        if (endRow < 0 || endRow >= ROWS || endCol < 0 || endCol >= COLS) continue;
        score += windowScore([0, 1, 2, 3].map(k => board[idx(row + k * dr, col + k * dc)]));
      }
    }
  }
  return score;
}

function chooseMove(board) {
  const moves = legalMoves(board);
  if (!moves.length) throw new Error("no legal Connect 4 move");

  // Tactical checks first: win now, then prevent the opponent's immediate win.
  for (const col of moves) {
    const row = drop(board, col, 1);
    const win = hasWon(board, 1);
    undo(board, col, row);
    if (win) return col;
  }
  for (const col of moves) {
    const row = drop(board, col, -1);
    const win = hasWon(board, -1);
    undo(board, col, row);
    if (win) return col;
  }

  const started = Date.now();
  let bestMove = moves[0];
  let bestScore = -Infinity;
  const table = new Map();

  function search(depth, alpha, beta, player) {
    if (Date.now() - started > SEARCH_BUDGET_MS) throw new Error("search-timeout");
    const key = board.join("") + `|${depth}|${player}`;
    const cached = table.get(key);
    if (cached !== undefined) return cached;
    const movesNow = legalMoves(board);
    if (depth === 0 || movesNow.length === 0) return evaluate(board);
    if (hasWon(board, 1)) return 1000000 + depth;
    if (hasWon(board, -1)) return -1000000 - depth;

    let value = player === 1 ? -Infinity : Infinity;
    for (const col of movesNow) {
      const row = drop(board, col, player);
      const child = search(depth - 1, alpha, beta, -player);
      undo(board, col, row);
      if (player === 1) {
        value = Math.max(value, child); alpha = Math.max(alpha, value);
      } else {
        value = Math.min(value, child); beta = Math.min(beta, value);
      }
      if (beta <= alpha) break;
    }
    table.set(key, value);
    return value;
  }

  // Iterative deepening always leaves a completed answer available on timeout.
  for (let depth = 1; depth <= 10; depth++) {
    try {
      let depthBestMove = moves[0], depthBestScore = -Infinity;
      for (const col of moves) {
        const row = drop(board, col, 1);
        const score = search(depth - 1, -Infinity, Infinity, -1);
        undo(board, col, row);
        if (score > depthBestScore) { depthBestScore = score; depthBestMove = col; }
      }
      bestMove = depthBestMove;
      bestScore = depthBestScore;
      if (bestScore >= 1000000) break;
    } catch (error) {
      if (error.message !== "search-timeout") throw error;
      break;
    }
  }
  return bestMove;
}

function decide(history, request) {
  if (request.kind !== "disc-dropped") throw new Error("unexpected request");
  const board = buildBoard(history);
  return { type: "disc-dropped", column: chooseMove(board) };
}

async function handle(message) {
  if (message.type === "init") {
    seat = message.seat;
    if (message.player === 1 || message.player === 2) myPlayer = message.player;
    return {};
  }
  if (message.type !== "decision") throw new Error("unknown request type");
  requestsHandled++;
  return decide(message.history ?? [], message.decision);
}

const { createInterface } = await import("node:readline");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    const reply = await handle(JSON.parse(line));
    process.stdout.write(JSON.stringify(reply) + "\n");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    lines.close();
    break;
  }
}
