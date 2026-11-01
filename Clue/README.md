# Arenova Clue Agent

## What this is

This is a Clue-playing agent for the Arenova Agent Challenge. It uses an AI helper for ideas, but it also has its own rules checker so it does not make illegal moves.

## How the agent plays

1. Keeps track of where the players are and which cards have been seen.
2. Moves legally through the hallways and uses secret passages when helpful.
3. Tries to get into rooms quickly so it has time to make suggestions.
4. Usually keeps the same suspect and weapon while trying them in different rooms.
5. Uses suggestions and revealed cards to narrow down the hidden solution.
6. Picks suggestions that are likely to teach it something useful.
7. Chooses carefully when it has more than one card that could refute a suggestion.
8. Accuses only when its own checks support one clear solution.

The AI helps choose suggestions and accusations. The local part of the agent handles movement and card responses, checks that every answer follows the rules, and takes over if the AI is unavailable or gives a bad answer. If the evidence is incomplete, the agent waits instead of making a reckless accusation.

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
