// Clue agent for the Arenova line-based player protocol.
// The runner owns dice, movement resolution, refutation order, and legality.

let seat = null;
let requestsHandled = 0;
// Six-player histories need more search time before the accusation deadline;
// incomplete results are still never treated as proof.
const DEDUCTION_BUDGET_MS = 1000;

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
    // An unrefuted suggestion by another player is not conclusive: the
    // suggester may privately hold one of the three cards and does not refute
    // their own suggestion. Only our own unrefuted suggestion is conclusive,
    // and only when none of its cards is already known to be in our hand.
    if (event.refuter === null && event.suggester === me &&
      !cards.some(card => shownToMe.has(card)) && !sameTriple(cards, candidate)) return false;
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
    all,
    positions,
    roll,
    maySuggestWithoutMoving,
    knownSolution: inference.complete && inference.candidates.length === 1 ? inference.candidates[0] : null,
    solutions: inference.candidates,
    solutionsComplete: inference.complete,
    shownToMe,
  };
}

function chooseSuggestion(start, room, shownToMe, solutions = [], all = [], solutionsComplete = true) {
  const unavailable = card => shownToMe.has(card);
  const suspects = (start.suspects ?? []).filter(value => !unavailable(cardId("suspect", value)));
  const weapons = (start.weapons ?? []).filter(value => !unavailable(cardId("weapon", value)));

  const testedRoomsForPair = pair => new Set(all
    .filter(event => event.type === "suggestion-made" && event.suggester === start.you.seat &&
      event.suggestion.suspect === pair.suspect && event.suggestion.weapon === pair.weapon)
    .map(event => event.suggestion.room));

  const hasUntestedRoom = pair => {
    const tested = testedRoomsForPair(pair);
    const candidateRooms = solutionsComplete
      ? solutions
        .filter(solution => solution.suspect === pair.suspect && solution.weapon === pair.weapon)
        .map(solution => solution.room)
      : (start.rooms ?? []);
    return [...new Set(candidateRooms)].some(candidateRoom => !tested.has(candidateRoom));
  };

  // Keep the last usable pair while changing rooms, but retire it after the
  // current room has already been tested or all of its candidate rooms are
  // exhausted. This prevents endless repeated suggestions with one pair.
  const prior = [...all].reverse().find(event => {
    if (event.type !== "suggestion-made" || event.suggester !== start.you.seat) return false;
    if (!suspects.includes(event.suggestion.suspect) || !weapons.includes(event.suggestion.weapon)) return false;
    // If the solver completed, do not keep testing a pair that visible
    // evidence ruled out. An incomplete search is only a ranking hint, so
    // preserve a usable pair until its rooms have been investigated.
    const pair = { suspect: event.suggestion.suspect, weapon: event.suggestion.weapon };
    const tested = testedRoomsForPair(pair);
    const pairStillPossible = !solutionsComplete || solutions.some(solution =>
      solution.suspect === pair.suspect && solution.weapon === pair.weapon);
    return pairStillPossible && hasUntestedRoom(pair) && !tested.has(room);
  });
  if (prior) {
    return {
      type: "suggestion-made",
      suspect: prior.suggestion.suspect,
      weapon: prior.suggestion.weapon,
      room,
    };
  }

  const tried = new Set(
    all
      .filter(event => event.type === "suggestion-made" && event.suggestion.room === room)
      .map(event => `${event.suggestion.suspect}|${event.suggestion.weapon}`),
  );

  const opponentPairSupport = new Map();
  for (const event of all) {
    if (event.type !== "suggestion-made" || event.suggester === start.you.seat) continue;
    const key = `${event.suggestion.suspect}|${event.suggestion.weapon}`;
    const current = opponentPairSupport.get(key) ?? { count: 0, rooms: new Set(), unrefuted: 0 };
    current.count += 1;
    current.rooms.add(event.suggestion.room);
    if (event.refuter === null) current.unrefuted += 1;
    opponentPairSupport.set(key, current);
  }

  // Prefer a Baseline-style pair: maximize total remaining solution support
  // and the number of rooms that pair can still occupy. The room is the
  // variable we want to isolate, so a pair supported across several rooms is
  // more useful than a pair supported only by the current room.
  // A timed-out search returns a partial list. Do not let that unstable list
  // determine pair support or room coverage; use it only as non-authoritative
  // context while relying on public patterns and fresh-room coverage.
  const rankingSolutions = solutionsComplete ? solutions : [];
  const roomSolutions = rankingSolutions.filter(solution => solution.room === room);
  const pairs = [];
  for (const suspect of suspects) {
    for (const weapon of weapons) {
      const key = `${suspect}|${weapon}`;
      const pairSolutions = rankingSolutions.filter(solution =>
        solution.suspect === suspect && solution.weapon === weapon);
      const support = pairSolutions.length;
      const roomCoverage = new Set(pairSolutions.map(solution => solution.room)).size;
      const currentRoomSupport = roomSolutions.filter(solution =>
        solution.suspect === suspect && solution.weapon === weapon).length;
      const opponent = opponentPairSupport.get(key);
      const repeatedOpponent = opponent && (opponent.count >= 2 || opponent.rooms.size >= 2);
      const opponentPriority = repeatedOpponent
        ? opponent.count + opponent.rooms.size * 2 + opponent.unrefuted / 2
        : 0;
      pairs.push({
        suspect,
        weapon,
        support,
        roomCoverage,
        currentRoomSupport,
        opponentPriority,
        repeated: tried.has(key),
      });
      pairs[pairs.length - 1].opponentSupport = opponent
        ? opponent.count + opponent.rooms.size / 10
        : 0;
    }
  }
  // Never follow a repeated opponent hypothesis that the local solver has
  // already ruled out. When it remains possible, however, give it priority:
  // repeated public guesses across rooms are the strongest Baseline signal.
  // A timed-out solver returns only a partial candidate list. Treat that list
  // as a ranking hint, never as a hard filter that can discard the true pair.
  const possible = solutionsComplete && solutions.length
    ? pairs.filter(pair => pair.support > 0)
    : pairs;
  const fresh = possible.filter(pair => !pair.repeated);
  const choices = fresh.length ? fresh : possible;
  choices.sort((a, b) => b.opponentPriority - a.opponentPriority || b.support - a.support ||
    b.roomCoverage - a.roomCoverage ||
    b.currentRoomSupport - a.currentRoomSupport || b.opponentSupport - a.opponentSupport ||
    a.suspect.localeCompare(b.suspect) || a.weapon.localeCompare(b.weapon));
  const choice = choices[0] ?? { suspect: start.suspects[0], weapon: start.weapons[0] };
  const suspect = choice.suspect;
  const weapon = choice.weapon;
  return { type: "suggestion-made", suspect, weapon, room };
}

function latestSuggestionRefutedByMe(history, mySeat) {
  return [...events(history)].reverse().find(
    event => event.type === "suggestion-made" && event.refuter === mySeat,
  );
}

function movement(start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions, all, preferredRoom = null, solutionsComplete = true) {
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
    if (maySuggestWithoutMoving) return chooseSuggestion(start, origin.room, shownToMe, solutions, all, solutionsComplete);

    const passage = board.secretPassages?.find(({ from, to }) =>
      (from === origin.room || to === origin.room) &&
      (!preferredRoom || from === preferredRoom || to === preferredRoom),
    );
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

  // Prefer entering a reachable room over ending on an arbitrary corridor
  // square. A breadth-first search makes this preference explicit and avoids
  // depth-first tie-breaks that can send a pawn one square backward even when
  // a room is reachable within the roll.
  function searchRoom(at, path, visited, forbiddenRoom = null, targetRoom = null) {
    const queue = [{ at, path, visited }];
    while (queue.length) {
      const current = queue.shift();
      const door = board.doors.find(({ corridor }) => samePoint(corridor, current.at));
      if (door && current.path.length > 0 && door.room !== forbiddenRoom &&
          (!targetRoom || door.room === targetRoom)) {
        return { type: "pawn-moved", path: current.path, enterRoom: door.room };
      }
      if (current.path.length === distance) continue;

      const neighbors = [
        { row: current.at.row - 1, column: current.at.column },
        { row: current.at.row, column: current.at.column - 1 },
        { row: current.at.row, column: current.at.column + 1 },
        { row: current.at.row + 1, column: current.at.column },
      ];
      for (const next of neighbors) {
        const nextKey = key(next);
        if (!isOpen(next) || startingSquares.has(nextKey) || occupied.has(nextKey) || current.visited.has(nextKey)) continue;
        queue.push({
          at: next,
          path: [...current.path, next],
          visited: new Set([...current.visited, nextKey]),
        });
      }
    }
    return null;
  }

  function search(at, path, visited, forbiddenRoom = null, targetRoom = null) {
    const door = board.doors.find(({ corridor }) => samePoint(corridor, at));
    if (door && path.length > 0 && door.room !== forbiddenRoom && (!targetRoom || door.room === targetRoom)) {
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
      const result = search(next, [...path, next], new Set([...visited, nextKey]), forbiddenRoom, targetRoom);
      if (result) return result;
    }
    return null;
  }

  if (origin.kind === "corridor") {
    return searchRoom(origin, [], new Set([key(origin)]), null, preferredRoom) ??
      searchRoom(origin, [], new Set([key(origin)]), null) ??
      search(origin, [], new Set([key(origin)])) ?? { type: "turn-ended" };
  }

  // From a room, leave through any unblocked door. Entering another room may
  // use fewer than the full roll, as permitted by the rules. Search all exits
  // for the preferred room before accepting a corridor fallback; otherwise a
  // path from the first exit could hide a reachable target behind a later exit.
  const exits = board.doors.filter(({ room }) => room === origin.room).filter(door => {
    const doorKey = key(door.corridor);
    return !startingSquares.has(doorKey) && !occupied.has(doorKey) && isOpen(door.corridor);
  });

  for (const door of exits) {
    const doorKey = key(door.corridor);
    const result = searchRoom(door.corridor, [door.corridor], new Set([doorKey]), origin.room, preferredRoom);
    if (result) return result;
  }
  for (const door of exits) {
    const doorKey = key(door.corridor);
    const result = searchRoom(door.corridor, [door.corridor], new Set([doorKey]), origin.room);
    if (result) return result;
  }
  for (const door of exits) {
    const doorKey = key(door.corridor);
    const result = search(door.corridor, [door.corridor], new Set([doorKey]), origin.room);
    if (result) return result;
  }
  return { type: "turn-ended" };
}

function decide(history, request, options = {}) {
  const state = snapshot(history);
  const { start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions, all } = state;

  if (request.kind === "take-turn") {
    // The only certain solution is a suggestion nobody could refute.
    if (state.knownSolution) {
      return { type: "accusation-made", ...state.knownSolution };
    }
    return movement(start, positions, roll, maySuggestWithoutMoving, shownToMe, solutions, all,
      options.preferredRoom ?? null, state.solutionsComplete);
  }

  if (request.kind === "make-suggestion") {
    const room = positions[start.you.character]?.room;
    if (!room) throw new Error("cannot suggest outside a room");
    return chooseSuggestion(start, room, shownToMe, solutions, all, state.solutionsComplete);
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

async function handle(message, options = {}) {
  if (message.type === "init") { seat = message.seat; return {}; }
  if (message.type !== "decision") throw new Error("unknown request type");
  requestsHandled += 1;
  return decide(message.history ?? [], message.decision, options);
}

export { handle, snapshot };

async function run() {
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
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await run();
