# Arenova Connect 4 Agent

## What this is

This is a Connect 4 player for the Arenova Agent Challenge.

The agent reads one JSON message per line from standard input and writes one JSON response per line. It returns only a column number; the game runner decides the row and player.

## Why JavaScript and Node.js?

The challenge provides a JavaScript/Node.js runtime. I also have prior Java experience from school, so familiar concepts such as variables, loops, functions, conditionals, and structured objects transferred naturally to JavaScript. Node.js is a good fit because the protocol is JSON-based, it can read the input stream line by line, and no extra libraries are needed.

## How the agent plays

1. Rebuilds the board from the visible history.
2. Uses `game-started` to identify whether it is red or yellow.
3. Plays an immediate winning move when possible.
4. Blocks an opponent's immediate winning move.
5. Searches future moves with minimax and alpha-beta pruning.
6. Prefers the center because it creates more possible lines.

## Files

- `connect4-agent.mjs` — the submission agent.
- `crucible.json` — tells the runner to use Node 24 and the entrypoint.
- `README.md` — this explanation.

## Test cases

These checks were run from the project root:

| Test | Input situation | Expected result |
| --- | --- | --- |
| Syntax check | Run `npm run check` | Both agent files parse successfully. |
| Protocol initialization | Send `{"type":"init","seat":"seat-2"}` | Returns `{}`. |
| Empty board | Send a decision with only `game-started` in history | Returns a valid `disc-dropped` response with a legal column. |
| Immediate win | Give red discs in columns 0, 1, and 2 | Returns column 3. |
| Immediate block | Give the opponent three connected discs with an open winning column | Returns the blocking column. |
| Full-column avoidance | Mark a column full in history | The returned column is not full. |

Run the syntax check with:

```bash
npm run check
```

## Recorded replay tests

### Replay 1: `crucible-connect-four-0e640298-628c-4bee-b53c-ccc4dad8de28.json`

- CCv2 played seat 1 as red against Average Aaron.
- The match finished normally in about 4.1 seconds.
- CCv2 won after five of its own moves, connecting four at cells 37, 38, 39, and 40.
- There was no invalid move or forfeit.

### Replay 2: `crucible-connect-four-7ef9e0ef-549f-44c4-94e5-7125599a0abd.json`

- CCv2 played seat 2 as red against Luna.
- The match finished normally in about 224.8 seconds.
- CCv2 won after twelve of its own moves, connecting four at cells 2, 10, 18, and 26.
- This tested the agent while playing second in the event order and still controlling the red pieces.

### Replay 3: `crucible-connect-four-8f7f3c6d-8205-416b-94ca-7c0877cc8d2d.json`

- CCv2 played seat 1 as yellow against Luna.
- The match finished normally in about 90.2 seconds.
- CCv2 won after eight of its own moves, connecting four at cells 16, 24, 32, and 40.
- This tested the yellow-player identity and board reconstruction.

### Replay 4: `crucible-connect-four-992da13d-b180-419b-a1f2-d88e96379cff.json`

- CCv2 played seat 1 as yellow against Luna.
- The match finished normally in about 104.3 seconds.
- CCv2 won after nine of its own moves, connecting four at cells 11, 17, 23, and 29.
- The agent continued to return legal columns throughout the longer game.

### Replay 5: `crucible-connect-four-b9245f76-0e09-4e98-9ddd-6f90e152a0b2.json`

- CCv2 played seat 1 as red against Luna.
- The match finished normally in about 126.7 seconds.
- CCv2 won after nine of its own moves, connecting four at cells 18, 24, 30, and 36.
- This tested the agent's defensive and diagonal-threat handling in a long match.

### Replay 6: `crucible-connect-four-e333a547-da74-4edb-b107-2ba194e397b4.json`

- CCv2 played seat 1 as red against Random Randy.
- The match finished normally in about 4.4 seconds.
- CCv2 won after five of its own moves, connecting four at cells 17, 24, 31, and 38.
- There was no invalid move or forfeit.

### Overall result

- CCv2 won all six recorded matches.
- The tests covered both red and yellow, playing first and second in the event order, and opponents with different playing styles.
- Follow-up validation: every replay completed normally with legal responses.

