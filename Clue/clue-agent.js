// Clue agent for the Arenova line-based player protocol.
// The runner owns dice, movement resolution, refutation order, and legality.

let seat = null;
let requestsHandled = 0;
const DEDUCTION_BUDGET_MS = 250;

function events(history) {
  return history.map(({ event }) => event);
}

function setupFrom(history) {
  return events(history).find(event => event.type === "game-started");
}

function cardId(kind, value) { return `${kind}:${value}`; }

function normalizeCard(kind, value) {
  return String(value).startsWith(`${kind}:`) ? String(value) : cardId(kind, value);
}

function samePoint(a, b) {
  return a && b && a.row === b.row && a.column === b.column;
}

function tripleFor(start, suggestion) {
  return [
    cardId("suspect", suggestion.suspect),
    cardId("weapon", suggestion.weapon),
    cardId("room", suggestion.room),
  ];
}

function sameTriple(a, b) {
  return a.length === b.length && a.every(card => b.includes(card));
}

// Check whether a proposed solution can still be distributed among the
// players while satisfying every visible suggestion/refutation constraint.
function solutionIsPossible(start, all, shownToMe, candidate, deadline) {
  if (Date.now() >= deadline) throw new Error("deduction-timeout");
  const seats = [...(start.seats ?? [])];
  const me = start.you.seat;
  const solution = "__solution__";
  const owners = new Map();
  for (const card of start.hand ?? []) owners.set(card, me);

  const shownOwner = new Map();
  for (const event of all) {
    if (event.type === "card-shown" && event.shownTo === me && event.card) {
      shownOwner.set(event.card, event.refuter);
    }
  }
  for (const [card, owner] of shownOwner) {
    if (owners.has(card) && owners.get(card) !== owner) return false;
    owners.set(card, owner);
  }

  for (const card of candidate) {
    if (owners.has(card) || shownToMe.has(card)) return false;
    owners.set(card, solution);
  }

  const suggestions = all.filter(event => event.type === "suggestion-made");
  for (const event of suggestions) {
    const cards = tripleFor(start, event.suggestion);
    if (event.refuter === null && !sameTriple(cards, candidate)) return false;
    if (event.refuter && event.passedSeats?.some(passed => cards.some(card => owners.get(card) === passed))) {
      return false;
    }
  }

  const allCards = [
    ...(start.cards?.suspects ?? []).map(value => normalizeCard("suspect", value)),
    ...(start.cards?.weapons ?? []).map(value => normalizeCard("weapon", value)),
    ...(start.cards?.rooms ?? []).map(value => normalizeCard("room", value)),
  ];
  const capacities = new Map(Object.entries(start.handSizes ?? {}));
  capacities.set(solution, 3);
  if (!capacities.has(me)) capacities.set(me, (start.hand ?? []).length);

  const domains = new Map();
  for (const card of allCards) {
    if (owners.has(card)) domains.set(card, [owners.get(card)]);
    else {
      const possible = seats.filter(owner => {
        if ((start.hand ?? []).includes(card) && owner !== me) return false;
        return !suggestions.some(event =>
          event.passedSeats?.includes(owner) && tripleFor(start, event.suggestion).includes(card),
        );
      });
      domains.set(card, possible);
    }
    if (!domains.get(card)?.length) return false;
  }

  const refutationNeeds = suggestions
    .filter(event => event.refuter)
    .map(event => ({ owner: event.refuter, cards: tripleFor(start, event.suggestion) }));

  function constraintsStillPossible(assigned, remaining) {
    for (const need of refutationNeeds) {
      if (need.cards.some(card => assigned.get(card) === need.owner)) continue;
      if (!need.cards.some(card => remaining.has(card) && remaining.get(card).includes(need.owner))) return false;
    }
    for (const [owner, capacity] of capacities) {
      let used = 0;
      for (const value of assigned.values()) if (value === owner) used++;
      if (used > Number(capacity)) return false;
      let possible = 0;
      for (const domain of remaining.values()) if (domain.includes(owner)) possible++;
      if (used + possible < Number(capacity)) return false;
    }
    return true;
  }

  function search(assigned, remaining, counts) {
    if (Date.now() >= deadline) throw new Error("deduction-timeout");
    if (!constraintsStillPossible(assigned, remaining)) return false;
    if (remaining.size === 0) {
      return refutationNeeds.every(need => need.cards.some(card => assigned.get(card) === need.owner)) &&
        [...capacities].every(([owner, capacity]) => (counts.get(owner) ?? 0) === Number(capacity));
    }

    let chosenCard = null;
    for (const [card, domain] of remaining) {
      if (!chosenCard || domain.length < remaining.get(chosenCard).length) chosenCard = card;
    }
    const nextRemaining = new Map(remaining);
    nextRemaining.delete(chosenCard);
    for (const owner of domains.get(chosenCard)) {
      const nextCounts = new Map(counts);
      nextCounts.set(owner, (nextCounts.get(owner) ?? 0) + 1);
      if (nextCounts.get(owner) > Number(capacities.get(owner) ?? 0)) continue;
      const nextAssigned = new Map(assigned);
      nextAssigned.set(chosenCard, owner);
      if (search(nextAssigned, nextRemaining, nextCounts)) return true;
    }
    return false;
  }

  const assigned = new Map(owners);
  const remaining = new Map([...domains].filter(([card]) => !assigned.has(card)));
  const counts = new Map();
  for (const owner of assigned.values()) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  return search(assigned, remaining, counts);
}

function inferSolutions(start, all, shownToMe) {
  const candidates = [];
  const deadline = Date.now() + DEDUCTION_BUDGET_MS;
  for (const suspect of start.suspects ?? []) {
    for (const weapon of start.weapons ?? []) {
      for (const room of start.rooms ?? []) {
        const candidate = [cardId("suspect", suspect), cardId("weapon", weapon), cardId("room", room)];
        try {
          if (solutionIsPossible(start, all, shownToMe, candidate, deadline)) candidates.push({ suspect, weapon, room });
        } catch (error) {
          if (error.message === "deduction-timeout") return { candidates, complete: false };
          throw error;
        }
      }
    }
  }
  return { candidates, complete: true };
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
  const inference = inferSolutions(start, all, shownToMe);
  return {
    start,
    positions,
    roll,
    maySuggestWithoutMoving,
    knownSolution: inference.complete && inference.candidates.length === 1 ? inference.candidates[0] : null,
    solutions: inference.candidates,
    shownToMe,
  };
}

function chooseSuggestion(start, room, shownToMe, solutions = []) {
  // Do not suggest cards already known to be in our hand or shown to us.
  const roomSolutions = solutions.filter(solution => solution.room === room);
  const pool = roomSolutions.length ? roomSolutions : solutions;
  const suspect = pool[0]?.suspect ?? start.suspects.find(value => !shownToMe.has(cardId("suspect", value))) ?? start.suspects[0];
  const weapon = pool[0]?.weapon ?? start.weapons.find(value => !shownToMe.has(cardId("weapon", value))) ?? start.weapons[0];
  return { type: "suggestion-made", suspect, weapon, room };
}

function latestSuggestionRefutedByMe(history, mySeat) {
  return [...events(history)].reverse().find(
    event => event.type === "suggestion-made" && event.refuter === mySeat,
  );
}

function movement(start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions) {
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
    if (maySuggestWithoutMoving) return chooseSuggestion(start, origin.room, shownToMe, solutions);

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
  const { start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions } = state;

  if (request.kind === "take-turn") {
    // The only certain solution is a suggestion nobody could refute.
    if (state.knownSolution) {
      return { type: "accusation-made", ...state.knownSolution };
    }
    return movement(start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions);
  }

  if (request.kind === "make-suggestion") {
    const room = positions[start.you.character]?.room;
    if (!room) throw new Error("cannot suggest outside a room");
    return chooseSuggestion(start, room, shownToMe, solutions);
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
