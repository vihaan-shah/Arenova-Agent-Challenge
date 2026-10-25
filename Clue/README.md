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
7. Builds possible solution triples from hand sizes, known cards, passed players, and refutations.
8. Accuses as soon as only one solution triple remains possible.
9. Prefers high-information suspect/weapon pairs and avoids repeating pairs in the same room.

The deduction search has a small fixed time budget. If it reaches that limit, the agent does not accuse from partial results; it continues with ordinary legal play.

## Files

- `clue-agent.mjs` — the submission agent.
- `crucible.json` — tells the runner to use Node 24 and the entrypoint.
- `README.md` — this explanation.

## Test cases

These checks were run from the project root:

| Test | Input situation | Expected result |
| --- | --- | --- |
| Syntax check | Run `npm run check` | Both agent files parse successfully. |
| Protocol initialization | Send `{"type":"init","seat":"seat-1"}` | Returns `{}`. |
| Suggestion | Place the agent in a room and request `make-suggestion` | Returns the current room plus valid suspect and weapon IDs. |
| Card refutation | Ask `show-card` after a suggestion containing a card in the agent's hand | Returns that matching `card:` ID. |
| Known solution | Include a suggestion with `refuter: null` and a complete 21-card setup | The agent makes the matching accusation. |
| Deduction solver | Give hand sizes and visible refutation constraints that leave one triple | The agent makes that accusation even without a new unrefuted suggestion. |
| Room movement | Give a room position and an open door | Returns a legal `pawn-moved` response. |
| Secret passage | Give a room with a connected secret passage | Returns an empty path with `useSecretPassage: true`. |
| Blocked movement | Occupy available corridor squares | Avoids occupied squares and ends the turn only when no legal route exists. |

Run the syntax check with:

```bash
npm run check
```

## Recorded replay tests

### Replay 1: Baseline Bo 4 solved the case

- The game reached a correct accusation by Baseline Bo 4.
- The winning accusation was Colonel Mustard, Lead Pipe, and Conservatory.
- CCv2 made legal movement, suggestions, and card responses but did not solve the case before the other agent won.
- Follow-up improvement: suggestions now prioritize higher-information suspect/weapon pairs and avoid repeating pairs in the same room.

### Replay 2: `crucible-clue-192df479-08ef-4a21-8a5c-8ed46ffbd8a5.json`

- The hidden solution was Professor Plum, Wrench, and Dining Room.
- Baseline Bo 2 won the match.
- CCv2, running as seat 6, made legal moves and suggestions and did not crash or make an invalid accusation.
- Replaying CCv2's seat-visible history against the updated agent produced a legal `turn-ended` response because the visible evidence still allowed multiple solutions at that point.
- Follow-up improvement: the updated agent uses a bounded deduction solver and information-gain suggestions.

