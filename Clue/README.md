# Arenova Clue Agent

## What this is

This is a Clue player for the Arenova Agent Challenge.

The agent reads one JSON message per line from standard input and writes one JSON response per line. It supports movement, suggestions, showing a card, and accusations.

## Why JavaScript and Node.js?

The challenge provides a JavaScript/Node.js runtime. JavaScript makes the JSON protocol simple to handle, and Node.js can process the runner's line-based input without extra dependencies.

## How the agent plays

1. Reads the setup, hand, board, positions, dice, and visible history.
2. Tracks the current position of every suspect.
3. Moves through legal corridor squares without walking through occupied squares.
4. Uses a legal secret passage when starting in a room with one.
5. Suggests the current room, choosing suspect and weapon cards not known to be in its hand.
6. Shows a matching card when it is asked to refute a suggestion.
7. Accuses only after a suggestion has gone completely unrefuted, which identifies the solution.

## Files

- `clue-agent.js` — the submission agent.
- `README.md` — this explanation.

## Test cases

These checks were run from the project root:

| Test | Input situation | Expected result |
| --- | --- | --- |
| Syntax check | Run `npm run check` | Both agent files parse successfully. |
| Protocol initialization | Send `{"type":"init","seat":"seat-1"}` | Returns `{}`. |
| Suggestion | Place the agent in a room and request `make-suggestion` | Returns the current room plus valid suspect and weapon IDs. |
| Card refutation | Ask `show-card` after a suggestion containing a card in the agent's hand | Returns that matching `card:` ID. |
| Known solution | Include a suggestion with `refuter: null` | The agent makes the matching accusation. |
| Room movement | Give a room position and an open door | Returns a legal `pawn-moved` response. |
| Secret passage | Give a room with a connected secret passage | Returns an empty path with `useSecretPassage: true`. |
| Blocked movement | Occupy available corridor squares | Avoids occupied squares and ends the turn only when no legal route exists. |

Run the syntax check with:

```bash
npm run check
```

