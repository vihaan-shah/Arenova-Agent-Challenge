// AI-assisted Clue agent.
// The local Clue engine supplies a legal fallback; the Arenova AI relay
// supplies strategic reasoning for suggestions and accusations.

import { handle as safeHandle, snapshot as analyzeHistory } from "./clue-agent.mjs";

const MAX_AI_CALLS = 4; // Keeps worst-case relay cost within the documented seat budget.
const DEFAULT_ACCUSATION_THRESHOLD = 0.8;
let aiCalls = 0;
let focusPair = null;

function accusationThreshold() {
  const configured = Number(process.env.CRUCIBLE_AI_ACCUSATION_THRESHOLD ?? DEFAULT_ACCUSATION_THRESHOLD);
  return Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : DEFAULT_ACCUSATION_THRESHOLD;
}

function allEvents(history) {
  return history.map(item => item.event);
}

function setup(history) {
  return allEvents(history).find(event => event.type === "game-started");
}

function currentRoom(start, history) {
  const positions = Object.fromEntries(
    Object.entries(start.suspectPositions ?? {}).map(([id, position]) => [id, { ...position }]),
  );
  for (const event of allEvents(history)) {
    if (event.type === "pawn-moved") positions[event.suspect] = event.to;
    if (event.type === "suggestion-made") {
      positions[event.suggestion.suspect] = { kind: "room", room: event.suggestion.room };
    }
  }
  return positions[start.you.character]?.room ?? null;
}

function validTriple(start, value) {
  return value &&
    (start.suspects ?? []).includes(value.suspect) &&
    (start.weapons ?? []).includes(value.weapon) &&
    (start.rooms ?? []).includes(value.room);
}

function latestSuggestion(history, mySeat) {
  return [...allEvents(history)].reverse().find(
    event => event.type === "suggestion-made" &&
      (event.suggester === mySeat || event.refuter === mySeat),
  );
}

function compactSetup(start) {
  // Movement is handled locally, so the AI does not need the giant 24x25
  // board-cell list. Keeping only deduction-relevant fields saves relay cost.
  return {
    seats: start.seats,
    turnOrder: start.turnOrder,
    characters: start.characters,
    handSizes: start.handSizes,
    you: start.you,
    hand: start.hand,
    weaponPositions: start.weaponPositions,
    activeSeat: start.activeSeat,
    turn: start.turn,
    roll: start.roll,
    suspects: start.suspects,
    weapons: start.weapons,
    rooms: start.rooms,
    cards: start.cards,
  };
}

function compactHistory(history) {
  return history.map(({ seq, event }) => {
    const keep = (fields) => Object.fromEntries(fields
      .filter(field => event[field] !== undefined)
      .map(field => [field, event[field]]));
    if (event.type === "game-started") return { seq, event: compactSetup(event) };
    if (event.type === "pawn-moved") return { seq, event: keep(["type", "turn", "seat", "suspect", "to", "via", "cost"]) };
    if (event.type === "suggestion-made") return { seq, event: keep(["type", "turn", "suggester", "suggestion", "passedSeats", "refuter", "pulledSeat"]) };
    if (event.type === "card-shown") return { seq, event: keep(["type", "turn", "refuter", "shownTo", "card"]) };
    if (event.type === "turn-ended") return { seq, event: keep(["type", "turn", "seat", "nextSeat", "nextRoll"]) };
    if (event.type === "accusation-made") return { seq, event: keep(["type", "turn", "accuser", "accusation", "correct", "eliminated"]) };
    return { seq, event };
  });
}

function evidenceSummary(start, history) {
  const knownNotSolution = new Set(start.hand ?? []);
  const observations = [];
  for (const event of allEvents(history)) {
    if (event.type === "card-shown" && event.shownTo === start.you.seat && event.card) {
      knownNotSolution.add(event.card);
    }
    if (event.type === "suggestion-made") {
      observations.push({
        suggestion: event.suggestion,
        passedSeats: event.passedSeats ?? [],
        refuter: event.refuter ?? null,
      });
    }
  }
  return { knownNotSolution: [...knownNotSolution], observations };
}

function knownCards(start, history) {
  const known = new Set(start.hand ?? []);
  for (const event of allEvents(history)) {
    if (event.type === "card-shown" && event.shownTo === start.you.seat && event.card) known.add(event.card);
  }
  return known;
}

function usablePair(start, history, pair) {
  if (!pair || !(start.suspects ?? []).includes(pair.suspect) || !(start.weapons ?? []).includes(pair.weapon)) return false;
  const known = knownCards(start, history);
  return !known.has(`suspect:${pair.suspect}`) && !known.has(`weapon:${pair.weapon}`);
}

function strategicRoom(start, history) {
  if (!usablePair(start, history, focusPair)) return null;
  const state = analyzeHistory(history);
  const tested = new Set(allEvents(history)
    .filter(event => event.type === "suggestion-made" &&
      event.suggestion.suspect === focusPair.suspect &&
      event.suggestion.weapon === focusPair.weapon)
    .map(event => event.suggestion.room));
  const candidates = state.solutions
    .filter(solution => solution.suspect === focusPair.suspect && solution.weapon === focusPair.weapon)
    .map(solution => solution.room);
  const rooms = [...new Set(candidates)];
  return rooms.sort((a, b) => Number(tested.has(a)) - Number(tested.has(b)) || a.localeCompare(b))[0] ?? null;
}

function busiestRoom(start, history) {
  const positions = Object.fromEntries(
    Object.entries(start.suspectPositions ?? {}).map(([suspect, position]) => [suspect, { ...position }]),
  );
  for (const event of allEvents(history)) {
    if (event.type === "pawn-moved") positions[event.suspect] = event.to;
    if (event.type === "suggestion-made") {
      positions[event.suggestion.suspect] = { kind: "room", room: event.suggestion.room };
    }
  }
  const counts = new Map();
  for (const position of Object.values(positions)) {
    if (position?.kind === "room" && position.room) counts.set(position.room, (counts.get(position.room) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function stagingRoom(start, current, target) {
  if (!current || !target || current !== target) return null;
  const doors = start.board?.doors ?? [];
  const from = doors.filter(door => door.room === current).map(door => door.corridor);
  if (!from.length) return null;
  const rooms = (start.rooms ?? []).filter(room => room !== current);
  const distance = room => {
    const to = doors.filter(door => door.room === room).map(door => door.corridor);
    if (!to.length) return Number.POSITIVE_INFINITY;
    return Math.min(...from.flatMap(a => to.map(b =>
      Math.abs(a.row - b.row) + Math.abs(a.column - b.column))));
  };
  return rooms.sort((a, b) => distance(a) - distance(b) || a.localeCompare(b))[0] ?? null;
}

function localRoomGoal(start, history) {
  const crowded = busiestRoom(start, history);
  const current = currentRoom(start, history);
  return stagingRoom(start, current, crowded) ?? crowded ?? strategicRoom(start, history);
}

function enforceFocusPair(start, history, fallback) {
  if (fallback?.type !== "suggestion-made") return fallback;
  if (!usablePair(start, history, focusPair)) focusPair = null;
  if (!focusPair) {
    const proposed = { suspect: fallback.suspect, weapon: fallback.weapon };
    if (usablePair(start, history, proposed)) focusPair = proposed;
  }
  return focusPair
    ? { type: "suggestion-made", suspect: focusPair.suspect, weapon: focusPair.weapon, room: fallback.room }
    : fallback;
}

function validateAiAction(start, history, request, action, fallback) {
  if (!action || typeof action !== "object") return fallback;

  if (request.kind === "make-suggestion") {
    const room = currentRoom(start, history);
    if (action.type === "suggestion-made" && validTriple(start, action) && action.room === room) {
      if (!usablePair(start, history, focusPair)) focusPair = null;
      if (!focusPair) {
        const proposed = { suspect: action.suspect, weapon: action.weapon };
        if (usablePair(start, history, proposed)) focusPair = proposed;
      }
      if (focusPair) {
        return { type: "suggestion-made", suspect: focusPair.suspect, weapon: focusPair.weapon, room: action.room };
      }
    }
    return fallback;
  }

  if (request.kind === "show-card") {
    const suggestion = latestSuggestion(history, start.you.seat);
    const cards = suggestion ? [
      `suspect:${suggestion.suggestion.suspect}`,
      `weapon:${suggestion.suggestion.weapon}`,
      `room:${suggestion.suggestion.room}`,
    ] : [];
    if (action.type === "card-shown" && (start.hand ?? []).includes(action.card) && cards.includes(action.card)) return action;
    return fallback;
  }

  if (request.kind === "accuse-or-end" || request.kind === "take-turn") {
    // Movement remains on the deterministic fallback path. The model may
    // make a high-confidence accusation when it remains locally possible,
    // even if more than one candidate is unresolved.
    if (action.type === "accusation-made" && validTriple(start, action)) {
      const state = analyzeHistory(history);
      const certain = state.knownSolution;
      if (certain && action.suspect === certain.suspect &&
        action.weapon === certain.weapon && action.room === certain.room) {
        return { type: "accusation-made", suspect: action.suspect, weapon: action.weapon, room: action.room };
      }
      const confidence = Number(action.confidence);
      const remainsPossible = state.solutions.some(solution =>
        solution.suspect === action.suspect && solution.weapon === action.weapon && solution.room === action.room);
      if (remainsPossible && Number.isFinite(confidence) && confidence >= accusationThreshold()) {
        return { type: "accusation-made", suspect: action.suspect, weapon: action.weapon, room: action.room };
      }
    }
    return fallback;
  }

  return fallback;
}

function validateMovementPlan(start, action) {
  if (action && typeof action.targetRoom === "string" && (start.rooms ?? []).includes(action.targetRoom)) {
    return action.targetRoom;
  }
  return null;
}

async function askRelay(start, history, request, fallback, mode = "decision", rejectedAction = null) {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.CRUCIBLE_AI_MODEL;
  if (!baseUrl || !apiKey || !model || aiCalls >= MAX_AI_CALLS) return null;

  const movementInstruction = mode === "movement-plan"
    ? "For this movement-planning request, return exactly {\"targetRoom\":\"room-id\"}. Choose a room that would best distinguish remaining possibilities; do not return a path or game response."
    : "For make-suggestion, use the current room and valid suspect/weapon IDs.";
  const prompt = [
    "You are the reasoning component of a Clue board-game agent.",
    "Use only the visible setup and history below. Never invent hidden cards or events.",
    "Return exactly one JSON response object and no markdown.",
    movementInstruction,
    "When a focusPair is provided, keep that suspect/weapon pair and vary the room to test it, unless the evidence proves one component is not possible.",
    `For accuse-or-end, return an accusation when your confidence is at least ${accusationThreshold()} and include a numeric confidence from 0 to 1; otherwise return {"type":"turn-ended"}. Never accuse a triple ruled out by the local evidence.`,
    "Do not wait for a single remaining candidate: make the best-supported accusation when your confidence reaches the threshold.",
    "Movement paths are handled by a safe local engine, so do not return pawn-moved.",
    `Decision request: ${JSON.stringify(request)}`,
    `Safe fallback: ${JSON.stringify(fallback)}`,
    `Deduction evidence: ${JSON.stringify({ ...evidenceSummary(start, history), possibleSolutionCount: analyzeHistory(history).solutions.length, focusPair })}`,
    ...(rejectedAction ? [
      `The previous accusation was rejected by the local solver because it is not a possible solution: ${JSON.stringify({ suspect: rejectedAction.suspect, weapon: rejectedAction.weapon, room: rejectedAction.room })}. Choose a different still-possible triple; do not repeat it.`,
    ] : []),
    `Compact setup and visible history: ${JSON.stringify({ start: compactSetup(start), history: compactHistory(history) })}`,
  ].join("\n");

  aiCalls += 1;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Output only valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (Array.isArray(content)) content = content.map(part => part.text ?? "").join("");
    if (typeof content !== "string") return null;
    content = content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(content);
  } catch (error) {
    console.error(`AI relay fallback: ${error.message}`);
    return null;
  }
}

async function handle(message) {
  if (message.type === "init") {
    aiCalls = 0;
    focusPair = null;
    return safeHandle(message);
  }
  if (message.type !== "decision") return safeHandle(message);

  const request = message.decision;
  const start = setup(message.history ?? []);
  if (!start) return safeHandle(message);

  let preferredRoom = null;
  if (request.kind === "take-turn") {
    // Prefer rooms where other suspects have gathered: suggestions there can
    // move another suspect into the room and reveal more shared information.
    // If already in that room, use a nearby staging room because the rules may
    // require a pawn to leave before it can make another suggestion there.
    // The local engine still validates reachability and falls back safely.
    preferredRoom = localRoomGoal(start, message.history ?? []);
    if (!preferredRoom) {
      const plan = await askRelay(start, message.history ?? [], request, null, "movement-plan");
      preferredRoom = validateMovementPlan(start, plan);
    }
  }

  let fallback = await safeHandle(message, { preferredRoom });
  if (request.kind === "make-suggestion") {
    // The stable-pair policy applies even when the relay is unavailable or
    // returns malformed/strategically inconsistent output.
    fallback = enforceFocusPair(start, message.history ?? [], fallback);
  }

  // The model is used only where it can add strategic value. Local code is
  // already safer and faster for paths and card-refutation responses.
  if (!["make-suggestion", "accuse-or-end"].includes(request.kind)) return fallback;

  const aiAction = await askRelay(start, message.history ?? [], request, fallback, "decision");
  const result = validateAiAction(start, message.history ?? [], request, aiAction, fallback);
  if (request.kind === "accuse-or-end" && aiAction?.type === "accusation-made" && result === fallback) {
    // Give the model one opportunity to recover from an evidence-invalid or
    // under-confident accusation instead of ending the turn immediately.
    const replacement = await askRelay(start, message.history ?? [], request, fallback, "decision", aiAction);
    return validateAiAction(start, message.history ?? [], request, replacement, fallback);
  }
  return result;
}

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
