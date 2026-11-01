import assert from "node:assert/strict";
import test from "node:test";
import { handle } from "./ai-clue-agent.mjs";

const start = {
  type: "game-started",
  seats: ["seat-1", "seat-6"],
  turnOrder: ["seat-1", "seat-6"],
  characters: { "seat-1": "scarlet", "seat-6": "mustard" },
  handSizes: { "seat-1": 9, "seat-6": 9 },
  you: { seat: "seat-6", character: "mustard" },
  hand: ["suspect:mustard"],
  suspects: ["scarlet", "mustard"],
  weapons: ["rope", "knife"],
  rooms: ["hall", "lounge"],
  cards: {
    suspects: ["suspect:scarlet", "suspect:mustard"],
    weapons: ["weapon:rope", "weapon:knife"],
    rooms: ["room:hall", "room:lounge"],
  },
  suspectPositions: {
    mustard: { kind: "corridor", row: 1, column: 1 },
    scarlet: { kind: "corridor", row: 1, column: 2 },
  },
  weaponPositions: { rope: "hall", knife: "lounge" },
  roll: [1, 1],
};

function history(...events) {
  return [{ seq: 0, event: start }, ...events.map((event, index) => ({ seq: index + 1, event }))];
}

test("room-entry make-suggestion always returns a protocol response", async () => {
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CRUCIBLE_AI_MODEL;
  await handle({ type: "init", seat: "seat-6" });
  const response = await handle({
    type: "decision",
    history: history({
      type: "pawn-moved",
      turn: 1,
      seat: "seat-6",
      suspect: "mustard",
      to: { kind: "room", room: "lounge" },
    }),
    decision: { kind: "make-suggestion" },
  });
  assert.equal(response.type, "suggestion-made");
  assert.equal(response.room, "lounge");
});

test("accuse-or-end always returns a legal response after a suggestion", async () => {
  await handle({ type: "init", seat: "seat-6" });
  const h = history(
    {
      type: "pawn-moved",
      turn: 1,
      seat: "seat-6",
      suspect: "mustard",
      to: { kind: "room", room: "lounge" },
    },
    {
      type: "suggestion-made",
      turn: 1,
      suggester: "seat-6",
      suggestion: { suspect: "scarlet", weapon: "rope", room: "lounge" },
      passedSeats: [],
      refuter: "seat-1",
    },
  );
  const response = await handle({
    type: "decision",
    history: h,
    decision: { kind: "accuse-or-end" },
  });
  assert.ok(response.type === "turn-ended" || response.type === "accusation-made");
});
