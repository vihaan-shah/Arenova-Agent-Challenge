// Clue agent for the Arenova line-based player protocol.
// The runner owns dice, movement resolution, refutation order, and legality.

let seat = null;
let requestsHandled = 0;

function events(history) {
  return history.map(({ event }) => event);
}

function setupFrom(history) {
  return events(history).find(event => event.type === "game-started");
}

function cardId(kind, value) { return `${kind}:${value}`; }

function samePoint(a, b) {
  return a && b && a.row === b.row && a.column === b.column;
}

function snapshot(history) {
  const all = events(history);
  const start = setupFrom(history);
  if (!start) throw new Error("missing game-started event");

  const positions = Object.fromEntries(
    Object.entries(start.suspectPositions).map(([suspect, position]) => [suspect, { ...position }]),
  );
  let roll = start.roll ?? [0, 0];
  let maySuggestWithoutMoving = false;
  let knownSolution = null;
  const shownToMe = new Set(start.hand ?? []);

  for (const event of all) {
    if (event.type === "card-shown" && event.shownTo === start.you.seat && event.card) {
      shownToMe.add(event.card);
    }
    if (event.type === "pawn-moved") {
      positions[event.suspect] = { ...event.to };
      if (event.seat === start.you.seat) maySuggestWithoutMoving = false;
    }
    if (event.type === "suggestion-made") {
      positions[event.suggestion.suspect] = { kind: "room", room: event.suggestion.room };
      if (event.suggester === start.you.seat) maySuggestWithoutMoving = false;
      if (event.pulledSeat === start.you.seat) maySuggestWithoutMoving = true;
      if (event.refuter === null) knownSolution = { ...event.suggestion };
    }
    if (event.type === "accusation-made") {
      if (event.accuser === start.you.seat) maySuggestWithoutMoving = false;
      if (event.unblockedInto && start.characters[event.accuser]) {
        positions[start.characters[event.accuser]] = { kind: "room", room: event.unblockedInto };
      }
    }
    if (event.type === "turn-ended" && event.seat === start.you.seat) {
      maySuggestWithoutMoving = false;
    }
    if ((event.type === "turn-ended" || event.type === "accusation-made") && event.nextRoll) {
      roll = event.nextRoll;
    }
  }
  return { start, positions, roll, maySuggestWithoutMoving, knownSolution, shownToMe };
}

function chooseSuggestion(start, room, shownToMe) {
  // Do not suggest cards already known to be in our hand or shown to us.
  const suspect = start.suspects.find(value => !shownToMe.has(cardId("suspect", value))) ?? start.suspects[0];
  const weapon = start.weapons.find(value => !shownToMe.has(cardId("weapon", value))) ?? start.weapons[0];
  return { type: "suggestion-made", suspect, weapon, room };
}

function latestSuggestionRefutedByMe(history, mySeat) {
  return [...events(history)].reverse().find(
    event => event.type === "suggestion-made" && event.refuter === mySeat,
  );
}

function movement(start, positions, roll, maySuggestWithoutMoving, shownToMe) {
  const character = start.you.character;
  const origin = positions[character];
  const board = start.board;
  const distance = (roll?.[0] ?? 0) + (roll?.[1] ?? 0);
  const key = point => `${point.row},${point.column}`;
  const startingSquares = new Set(Object.values(board.starts).map(key));
  const occupied = new Set(
    Object.entries(positions)
      .filter(([suspect, position]) => suspect !== character && position.kind === "corridor")
      .map(([, position]) => key(position)),
  );

  if (origin.kind === "room") {
    if (maySuggestWithoutMoving) return chooseSuggestion(start, origin.room, shownToMe);

    const passage = board.secretPassages?.find(({ from, to }) => from === origin.room || to === origin.room);
    if (passage) {
      const enterRoom = passage.from === origin.room ? passage.to : passage.from;
      return { type: "pawn-moved", path: [], enterRoom, useSecretPassage: true };
    }
  }

  function isOpen(point) {
    return point.row >= 0 && point.row < board.height &&
      point.column >= 0 && point.column < board.width &&
      board.rows[point.row][point.column] === "-";
  }

  function search(at, path, visited, forbiddenRoom = null) {
    const door = board.doors.find(({ corridor }) => samePoint(corridor, at));
    if (door && path.length > 0 && door.room !== forbiddenRoom) {
      return { type: "pawn-moved", path, enterRoom: door.room };
    }
    if (path.length === distance) return { type: "pawn-moved", path };

    const neighbors = [
      { row: at.row - 1, column: at.column },
      { row: at.row, column: at.column - 1 },
      { row: at.row, column: at.column + 1 },
      { row: at.row + 1, column: at.column },
    ];
    for (const next of neighbors) {
      const nextKey = key(next);
      if (!isOpen(next) || startingSquares.has(nextKey) || occupied.has(nextKey) || visited.has(nextKey)) continue;
      const result = search(next, [...path, next], new Set([...visited, nextKey]), forbiddenRoom);
      if (result) return result;
    }
    return null;
  }

  if (origin.kind === "corridor") {
    return search(origin, [], new Set([key(origin)])) ?? { type: "turn-ended" };
  }

  // From a room, leave through any unblocked door. Entering another room may
  // use fewer than the full roll, as permitted by the rules.
  for (const door of board.doors.filter(({ room }) => room === origin.room)) {
    const doorKey = key(door.corridor);
    if (startingSquares.has(doorKey) || occupied.has(doorKey) || !isOpen(door.corridor)) continue;
    const result = search(door.corridor, [door.corridor], new Set([doorKey]), origin.room);
    if (result) return result;
  }
  return { type: "turn-ended" };
}

function decide(history, request) {
  const state = snapshot(history);
  const { start, positions, roll, maySuggestWithoutMoving, shownToMe } = state;

  if (request.kind === "take-turn") {
    // The only certain solution is a suggestion nobody could refute.
    if (state.knownSolution) {
      return { type: "accusation-made", ...state.knownSolution };
    }
    return movement(start, positions, roll, maySuggestWithoutMoving, shownToMe);
  }

  if (request.kind === "make-suggestion") {
    const room = positions[start.you.character]?.room;
    if (!room) throw new Error("cannot suggest outside a room");
    return chooseSuggestion(start, room, shownToMe);
  }

  if (request.kind === "show-card") {
    const current = latestSuggestionRefutedByMe(history, start.you.seat);
    if (!current) throw new Error("no suggestion to refute");
    const cards = [
      cardId("suspect", current.suggestion.suspect),
      cardId("weapon", current.suggestion.weapon),
      cardId("room", current.suggestion.room),
    ];
    const card = cards.find(candidate => (start.hand ?? []).includes(candidate));
    if (!card) throw new Error("cannot refute suggestion with current hand");
    return { type: "card-shown", card };
  }

  if (request.kind === "accuse-or-end") {
    return state.knownSolution
      ? { type: "accusation-made", ...state.knownSolution }
      : { type: "turn-ended" };
  }

  throw new Error("unexpected decision kind");
}

async function handle(message) {
  if (message.type === "init") { seat = message.seat; return {}; }
  if (message.type !== "decision") throw new Error("unknown request type");
  requestsHandled += 1;
  return decide(message.history ?? [], message.decision);
}

const { createInterface } = await import("node:readline");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    process.stdout.write(JSON.stringify(await handle(JSON.parse(line))) + "\n");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    lines.close();
    break;
  }
}
