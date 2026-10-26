# Arenova Clue Agent

## What this is

This is an AI-assisted Clue player for the Arenova Agent Challenge.

The agent reads one JSON message per line from standard input and writes one JSON response per line. It uses the Arenova local AI relay for strategic reasoning, with a local legality-safe fallback for movement and malformed model responses.

## Why JavaScript and Node.js?

The challenge provides Node.js 24 and an OpenAI-compatible local AI relay. I also have prior Java experience from school, so familiar concepts such as variables, loops, functions, conditionals, and structured objects transferred naturally to JavaScript. Node.js provides `fetch`, handles the JSON protocol cleanly, and keeps the long-running process lightweight.

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

The AI relay is called only a limited number of times per match and is given only a compact summary of the visible setup and history. Calls are reserved for suggestions and accusation decisions; movement and card refutation stay on the local legal engine so the model cannot waste calls or invent an invalid path.

The deduction search has a small fixed time budget. If it reaches that limit, the agent does not accuse from partial results; it continues with ordinary legal play.

## Files

- `ai-clue-agent.mjs` — the AI-assisted submission entrypoint.
- `clue-agent.mjs` — the deterministic legality and fallback engine.
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
| AI relay unavailable | Remove or block relay environment variables | Falls back to the deterministic agent without crashing. |
| AI invalid suggestion | Return an invalid room/card combination | Rejects it and uses the safe local response. |
| AI invalid movement | Return `pawn-moved` from the model | Rejects it and uses the locally generated legal movement. |
| Call-budget routing | Send `take-turn`, `show-card`, and movement requests | No AI call is spent; the local engine handles them directly. |
| Compact AI context | Use a full replay with board geometry | Omits unnecessary board cells and sends deduction-relevant history only. |

## Algorithmic-to-AI test case

- Earlier versions used only a deterministic deduction and movement algorithm.
- The current version adds an AI reasoning layer through Arenova's documented local relay.
- The AI reviews the visible setup and history to choose more informed suggestions and supported accusations.
- A deterministic legality engine remains as the fallback for movement, unavailable relay settings, timeouts, malformed JSON, or invalid model actions.
- The agent was checked with the relay disabled and with a local mock relay; both paths returned valid protocol responses.

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

### Replay 3: `crucible-clue-28f215f4-40fa-471b-a9eb-c01682f05fe8.json`

- This match used two Baseline Bo opponents plus CCv2.
- The hidden solution was Professor Plum, Rope, and Lounge.
- Baseline Bo won after reaching the Lounge and making an unrefuted accusation.
- CCv2 made legal moves, suggestions, and card responses without crashing or making an invalid accusation.
- At CCv2's last turn, its visible evidence still left multiple possible suspects, weapons, and rooms, so ending the turn was safer than guessing.
- This replay used the earlier CCv2 build; the current package adds bounded deduction and information-gain suggestion selection.

### Replay 4: `crucible-clue-e9f1816c-7f82-4f84-8c74-fd32fb5cc7aa.json`

- The six-player match was won by Baseline Bo 2.
- The hidden solution was Mrs. Peacock, Wrench, and Study.
- The earlier AI build made legal moves and suggestions, but it spent all four AI calls on `take-turn`, `finish`, and `show-card` requests. Its wrapper rejected those model outputs and used the local fallback, so the AI never influenced the actual suggestion decisions.
- Those prompts also included the full board geometry, reaching roughly 29,000 prompt tokens per call and adding several seconds of latency.
- Follow-up fix: AI calls are now reserved for `make-suggestion` and `accuse-or-end`, and prompts use a compact deduction summary. The local engine still handles movement and card refutation.

