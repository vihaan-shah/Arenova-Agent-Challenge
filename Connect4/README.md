# Arenova Connect 4 Agent

## What this is

This is a Connect 4 player for the Arenova Agent Challenge.

The agent reads one JSON message per line from standard input and writes one JSON response per line. It returns only a column number; the game runner decides the row and player.

## How the agent plays

1. Rebuilds the board from the visible history.
2. Identifies whether it is red or yellow.
3. Plays an immediate winning move when possible.
4. Blocks an opponent’s immediate winning move.
5. Searches future moves with minimax and alpha-beta pruning.
6. Prefers the center because it creates more possible lines.

## Files

- `connect4-agent.mjs` — the submission agent.
- `crucible.json` — tells the runner to use Node 24 and the entrypoint.
- `README.md` — this replay summary.

## Replay summary

The agent won all six recorded replays. It succeeded against Random Randy, Average Aaron, and Luna; handled both red and yellow; and won while playing in both event-order positions. The longer Luna games also exercised defensive play, diagonal threats, board reconstruction, and full-column avoidance. Every replay completed normally with legal responses and no forfeits.

## Recorded replays

- **Replay 1 — Random Randy:** CCv2 played red and won in about 4.4 seconds after five moves, connecting cells 17, 24, 31, and 38.
- **Replay 2 — Average Aaron:** CCv2 played red and won in about 4.1 seconds after five moves, connecting cells 37, 38, 39, and 40.
- **Replay 3 — Luna:** CCv2 played red as seat 2 and won in about 224.8 seconds after twelve moves, connecting cells 2, 10, 18, and 26.
- **Replay 4 — Luna:** CCv2 played yellow and won in about 90.2 seconds after eight moves, connecting cells 16, 24, 32, and 40.
- **Replay 5 — Luna:** CCv2 played yellow and won in about 104.3 seconds after nine moves, connecting cells 11, 17, 23, and 29. The agent remained legal throughout the longer game.
- **Replay 6 — Luna:** CCv2 played red and won in about 126.7 seconds after nine moves, connecting cells 18, 24, 30, and 36. This replay exercised defensive and diagonal-threat handling.
