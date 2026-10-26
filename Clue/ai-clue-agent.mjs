// AI-assisted Clue agent.
// The local Clue engine supplies a legal fallback; the Arenova AI relay
// supplies strategic reasoning for suggestions and accusations.

import { handle as safeHandle, snapshot as analyzeHistory } from "./clue-agent.mjs";

const MAX_AI_CALLS = 4; // Keeps worst-case relay cost within the documented seat budget.
let aiCalls = 0;

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

function validateAiAction(start, history, request, action, fallback) {
  if (!action || typeof action !== "object") return fallback;

  if (request.kind === "make-suggestion") {
    const room = currentRoom(start, history);
    if (action.type === "suggestion-made" && validTriple(start, action) && action.room === room) {
      return { type: "suggestion-made", suspect: action.suspect, weapon: action.weapon, room: action.room };
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
    // override it only with a structurally valid accusation.
    if (action.type === "accusation-made" && validTriple(start, action)) {
      // Never let model confidence override game evidence. The accusation is
      // accepted only when the local constraint solver has one solution left.
      const certain = analyzeHistory(history).knownSolution;
      if (certain && action.suspect === certain.suspect &&
        action.weapon === certain.weapon && action.room === certain.room) {
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

async function askRelay(start, history, request, fallback, mode = "decision") {
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
    "For accuse-or-end, return an accusation only when justified and include a numeric confidence from 0 to 1; otherwise return {\"type\":\"turn-ended\"}.",
    "Movement paths are handled by a safe local engine, so do not return pawn-moved.",
    `Decision request: ${JSON.stringify(request)}`,
    `Safe fallback: ${JSON.stringify(fallback)}`,
    `Deduction evidence: ${JSON.stringify(evidenceSummary(start, history))}`,
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
    return safeHandle(message);
  }
  if (message.type !== "decision") return safeHandle(message);

  const request = message.decision;
  const start = setup(message.history ?? []);
  if (!start) return safeHandle(message);

  let preferredRoom = null;
  if (request.kind === "take-turn") {
    const plan = await askRelay(start, message.history ?? [], request, null, "movement-plan");
    preferredRoom = validateMovementPlan(start, plan);
  }

  const fallback = await safeHandle(message, { preferredRoom });

  // The model is used only where it can add strategic value. Local code is
  // already safer and faster for paths and card-refutation responses.
  if (!["make-suggestion", "accuse-or-end"].includes(request.kind)) return fallback;

  const aiAction = await askRelay(start, message.history ?? [], request, fallback, "decision");
  return validateAiAction(start, message.history ?? [], request, aiAction, fallback);
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
