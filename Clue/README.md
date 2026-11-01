# Arenova Clue Agent

## What this is

This is a Clue-playing agent for the Arenova Agent Challenge. It uses an AI helper for ideas, but it also has its own rules checker so it does not make illegal moves.

## How the agent plays

Reads the setup, hand, board, positions, dice, and visible history.
Tracks the current position of every suspect.
Moves through legal corridor squares without walking through occupied squares.
Uses a legal secret passage when starting in a room with one.
Suggests the current room, choosing suspect and weapon cards not known to be in its hand.
Shows a matching card when it is asked to refute a suggestion.
Builds possible solution triples from hand sizes, known cards, passed players, and refutations.
Accuses only when the local solver proves the unique solution; otherwise it keeps gathering evidence and making legal suggestions.
Reviews opponents’ repeated suggestions as soft strategic evidence, while never treating another player’s guess as proof.
Follows the strongest Baseline pattern: choose one suspect/weapon pair with broad remaining room support, keep it stable, and vary the room until the solution is uniquely determined.
Prefers high-information suspect/weapon pairs and avoids repeating pairs in the same room.
The AI relay is called only a limited number of times per match and is given only a compact summary of the visible setup and history. Calls are reserved for suggestion and accusation decisions; room selection, movement paths, and card refutation stay on the local legal engine so the model cannot waste calls or invent an invalid path.

The current version also asks the model for a room goal during movement. The local engine converts that goal into a legal path and falls back to its normal route if the goal is unreachable. The prompt includes a concise evidence summary and the number of locally possible solutions. Accusations are certainty-gated: the local solver must identify exactly one complete suspect/weapon/room triple. The AI cannot override that gate with confidence, and the agent continues making legal suggestions while multiple triples remain possible.

Incomplete deduction results caused by the solver time limit are never treated as evidence for an accusation.

If the model proposes an accusation that the local solver rejects, the wrapper makes one recovery request asking for a different possible triple. A second invalid or under-confident response still falls back to `turn-ended`.

After selecting a useful suspect/weapon pair, the agent keeps that pair as a focus and tests it across different rooms. It changes the pair only when visible evidence rules out one of its cards. Once a card is shown, it is permanently excluded from future solution candidates, and the agent selects a replacement pair. If the local solver identifies the unique solution, the next decision immediately makes the accusation. An unrefuted suggestion by another player is not treated as conclusive because that player may privately hold one of the suggested cards. This mirrors the strongest pattern observed in the Baseline Bo replays while preserving the AI layer.

The deduction search has a small fixed time budget. If it reaches that limit, the agent does not accuse from partial results; it continues with ordinary legal play.

## Files

- `ai-clue-agent.mjs` — the AI-assisted submission entrypoint.
- `clue-agent.mjs` — the deterministic legality, deduction, movement, and fallback engine.
- `crucible.json` — tells the runner to use Node 24 and the entrypoint.
- `README.md` — this replay summary.

## Replay summary

The recorded replays show two clear outcomes:

- AIAgent succeeds when it keeps one useful pair stable, reaches the relevant rooms, and lets the local solver confirm the final room. Two documented wins are AIAgent’s correct White/Candlestick/Dining Room accusation and AIAgent 3’s correct Green/Wrench/Lounge accusation.
- AIAgent fails mainly in races. Baseline bots often reach the decisive room one or two turns earlier, while AIAgent is still gathering evidence. The agent’s refusal to accuse with multiple candidates is safe, but can lose the match.
- The latest four six-player replays used the current package exactly. AIAgent made legal suggestions and had no faulted events, but Baseline Bo won all four. AIAgent’s main remaining weakness in those runs was speed of information gathering, not protocol safety.

## Recorded replays

### AIAgent wins

- **Three-player AIAgent win:** AIAgent kept Candlestick as a stable weapon while testing suspects and rooms, then correctly accused Mrs. White, Candlestick, and Dining Room. All recorded responses were protocol-valid.
- **Six-player AIAgent win:** AIAgent 3 tested Green with multiple weapons and rooms, narrowed the evidence to Green, Wrench, and Lounge, and correctly accused. The local solver rejected an incorrect model-proposed room and supplied the correct Lounge accusation.

### Latest four current-package replays

All four used the current ZIP hash `80583e6733eb697cb35dc1be0b1ced85df08e393ec4bda8b91371702e8343966`.

- `crucible-clue-4f26d513-39c7-43fb-8384-7141253c120c.json`: Baseline Bo 2 won with Green, Rope, Hall. AIAgent made three legal suggestions but did not reach an accusation.
- `crucible-clue-7c9fa6d6-58e9-45c0-864f-896fd4a742ad.json`: Baseline Bo 4 won with White, Wrench, Library. AIAgent made three legal suggestions but did not reach an accusation.
- `crucible-clue-d3a5beb2-cc3c-45a7-9b77-22f3a73c6e2d.json`: Baseline Bo 2 won with White, Wrench, Hall. AIAgent made three legal suggestions but did not reach an accusation.
- `crucible-clue-e2e6497e-367b-4b92-835d-2dfbe26d86b9.json`: Baseline Bo 5 won with Green, Knife, Lounge. AIAgent made two legal suggestions but did not reach an accusation.

No detective faults, invalid responses, or relay errors were recorded in these four replays. The current improvement target is faster room access and faster candidate reduction so the safe accusation gate is reached before a Baseline bot solves the case.
