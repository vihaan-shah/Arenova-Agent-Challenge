# Arenova Connect 4 Agent

## What this is

This is a Connect 4 player for the Arenova Agent Challenge.

The agent reads one JSON message per line from standard input and writes one JSON response per line. It returns only a column number; the game runner decides the row and player.

## Why JavaScript and Node.js?

The challenge provides a JavaScript/Node.js runtime. JavaScript is a good fit because the protocol is JSON-based, Node.js can read the input stream line by line, and no extra libraries are needed.

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

