# Arenova Clue Agent

## What this is

This is a Clue-playing agent for the Arenova Agent Challenge. It uses an AI helper for ideas, but it also has its own rules checker so it does not make illegal moves.

## How the agent plays

The agent reads the setup, hand, board, dice, positions, and visible history. It tracks every suspect, moves legally through corridors or secret passages, enters rooms to make suggestions, and shows a matching card when needed. It uses hand sizes, known cards, passed players, refutations, and repeated opponent suggestions to narrow down the hidden solution. It usually keeps one promising suspect/weapon pair and tests it in different rooms, choosing high-information suggestions instead of repeating the same room.

The AI relay helps with suggestions, accusations, and room goals, but the local engine handles movement and card responses so every action stays legal. The local solver checks any accusation, and the AI cannot override it. Incomplete searches, invalid model responses, or unsupported accusations fall back to safe legal play; the agent continues gathering evidence until one complete solution is supported.

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
