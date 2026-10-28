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
8. Accuses only when the local solver proves the unique solution; otherwise it keeps gathering evidence and making legal suggestions.
9. Prefers high-information suspect/weapon pairs and avoids repeating pairs in the same room.

The AI relay is called only a limited number of times per match and is given only a compact summary of the visible setup and history. Calls are reserved for room planning, suggestions, and accusation decisions; movement paths and card refutation stay on the local legal engine so the model cannot waste calls or invent an invalid path.

The current version also asks the model for a room goal during movement. The local engine converts that goal into a legal path and falls back to its normal route if the goal is unreachable. The prompt includes a concise evidence summary and the number of locally possible solutions. Accusations are certainty-gated: the local solver must identify exactly one complete suspect/weapon/room triple. The AI cannot override that gate with confidence, and the agent continues making legal suggestions while multiple triples remain possible.

Incomplete deduction results caused by the solver time limit are never treated as evidence for an accusation.

If the model proposes an accusation that the local solver rejects, the wrapper makes one recovery request asking for a different possible triple. A second invalid or under-confident response still falls back to `turn-ended`.

After selecting a useful suspect/weapon pair, the agent keeps that pair as a focus and tests it across different rooms. It changes the pair only when visible evidence rules out one of its cards. Once a card is shown, it is permanently excluded from future solution candidates, and the agent selects a replacement pair. If the local solver identifies the unique solution, the next decision immediately makes the accusation. An unrefuted suggestion by another player is not treated as conclusive because that player may privately hold one of the suggested cards. This mirrors the strongest pattern observed in the Baseline Bo replays while preserving the AI layer.

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
| AI room planning | Ask the model for a movement goal | Local pathfinding validates the route and falls back safely if unreachable. |
| Certainty-gated accusation | Model returns a confident accusation | The agent accepts it only when the local solver identifies exactly one complete solution triple. |
| Continued investigation | Multiple solution triples remain | The agent returns `turn-ended` for accusation requests and continues making legal room suggestions on later turns. |
| Accusation recovery | The model proposes an impossible or under-confident accusation | The agent sends the rejection context back once and asks for a different possible triple before ending the turn. |
| Focus-pair testing | Multiple rooms are reachable over several turns | Reuses one useful suspect/weapon pair and varies the room before changing cards, even when the AI relay is unavailable or disagrees. |
| Solver-confirmed finish | The local solver identifies one remaining solution | The next decision immediately makes the supported accusation; another player’s unrefuted suggestion alone is not enough. |
| Evidence-directed movement | A focus pair has candidate rooms remaining | Movement targets an untested candidate room before asking the relay for a new general movement goal. |
| Crowd-aware movement | Other suspects are already gathered in a room | Movement prefers the busiest visible room so the agent can participate in the same information-rich suggestions. If it must leave that room first, it uses the nearest staging room and targets the hub on the next turn. |
| Empty AI response | The relay returns `content: null` or unusable output | The wrapper ignores it and uses the local legal movement or deduction fallback. |
| Structured relay output | The model returns prose or an empty content field | Requests include JSON-object response formatting; invalid responses still use the local fallback. |
| AI-call allocation | Local crowd/focus logic already identifies a useful room | The relay is skipped for that movement decision, preserving calls for suggestions and accusations. |

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

- Six-player match: AIAgent had five opponents.
- The game reached a correct accusation by Baseline Bo 4.
- The winning accusation was Colonel Mustard, Lead Pipe, and Conservatory.
- CCv2 made legal movement, suggestions, and card responses but did not solve the case before the other agent won.
- Follow-up improvement: suggestions now prioritize higher-information suspect/weapon pairs and avoid repeating pairs in the same room.

### Replay 2

- Six-player match: AIAgent had five opponents.
- The hidden solution was Professor Plum, Wrench, and Dining Room.
- Baseline Bo 2 won the match.
- CCv2, running as seat 6, made legal moves and suggestions and did not crash or make an invalid accusation.
- Replaying CCv2's seat-visible history against the updated agent produced a legal `turn-ended` response because the visible evidence still allowed multiple solutions at that point.
- Follow-up improvement: the updated agent uses a bounded deduction solver and information-gain suggestions.

### Replay 3

- This match used two Baseline Bo opponents plus CCv2.
- Three-player match: CCv2 had two opponents.
- The hidden solution was Professor Plum, Rope, and Lounge.
- Baseline Bo won after reaching the Lounge and making an unrefuted accusation.
- CCv2 made legal moves, suggestions, and card responses without crashing or making an invalid accusation.
- At CCv2's last turn, its visible evidence still left multiple possible suspects, weapons, and rooms, so ending the turn was safer than guessing.
- This replay used the earlier CCv2 build; the current package adds bounded deduction and information-gain suggestion selection.

### Replay 4

- The six-player match was won by Baseline Bo 2.
- Six-player match: AIAgent had five opponents.
- The hidden solution was Mrs. Peacock, Wrench, and Study.
- The earlier AI build made legal moves and suggestions, but it spent all four AI calls on `take-turn`, `finish`, and `show-card` requests. Its wrapper rejected those model outputs and used the local fallback, so the AI never influenced the actual suggestion decisions.
- Those prompts also included the full board geometry, reaching roughly 29,000 prompt tokens per call and adding several seconds of latency.
- Follow-up fix: AI calls are now reserved for `make-suggestion` and `accuse-or-end`, and prompts use a compact deduction summary. The local engine still handles movement and card refutation.

### Replay 5

- This six-player match included AIAgent alongside five Baseline Bo agents.
- Six-player match: AIAgent had five opponents.
- The hidden solution was Miss Scarlet, Rope, and Ballroom.
- AIAgent received one turn, made a legal corridor move, and ended its turn normally.
- Baseline Bo 3 reached the Ballroom on the next turn, made an unrefuted suggestion, and correctly accused the solution.
- The match ended before AIAgent had a chance to make a suggestion or accusation; no AIAgent crash or invalid response occurred.

### Replay 6

- This six-player match was shown from Baseline Bo's perspective.
- Six-player match: AIAgent had five opponents.
- The hidden solution was Mr. Green, Rope, and Ballroom.
- Baseline Bo repeatedly tested the same likely suspect/weapon pair in different rooms, including Conservatory, Study, Billiard Room, Lounge, and Library, before correctly accusing in Ballroom.
- AIAgent made an incorrect accusation of Mr. Green, Rope, and Conservatory. The suspect and weapon were plausible, but the room was not proven.
- Follow-up fix: AI confidence can no longer override the local deduction solver. An AI accusation is accepted only when the local solver independently identifies the exact unique solution.

### Replay 7

- This six-player match was viewed from both AIAgent and Baseline Bo perspectives.
- Six-player match: AIAgent had five opponents.
- The correct solution was Mrs. White, Rope, and Billiard Room.
- Baseline Bo repeatedly tested a stable suspect/weapon combination across several rooms and correctly waited until the Billiard Room was supported before accusing.
- AIAgent made legal moves and suggestions but changed its suspect/weapon focus more often and did not solve the case before Baseline Bo.
- Follow-up fix: the AI agent now keeps a focus pair across room suggestions and changes it only when visible evidence rules out a component.

- Additional enforcement: the local wrapper applies the same focus pair to fallback suggestions, so relay failures or inconsistent model choices cannot silently switch both cards.

### Replay 8

- This three-player match was won by Baseline Bo.
- Three-player match: AIAgent had two opponents.
- The hidden solution was Mrs. Peacock, Rope, and Hall.
- AIAgent made legal movement, suggestions, card responses, and turn endings without crashing or making an invalid accusation.
- AIAgent tested several combinations, including Mrs. Peacock with the Candlestick and Knife, but did not reach a proven solution before Baseline Bo accused correctly.
- The replay metadata confirms that AIAgent used the submitted Clue package: its source hash matched the local `Clue/clue-agent.zip` exactly.
- The AI relay recorded four calls using `openai/gpt-6-luna`; the local legality and deduction engine remained responsible for validating every response.
- Follow-up improvement: continue prioritizing one promising suspect/weapon focus pair while deliberately testing rooms, and accuse only after the local solver proves the complete solution.

### Replay 9

- This three-player match was won by Baseline Bo with the solution Professor Plum, Pistol, and Lounge.
- Three-player match: AIAgent had two opponents.
- The replay metadata confirms that AIAgent used the submitted Clue package: its source hash matched the local `Clue/clue-agent.zip` exactly.
- AIAgent made legal moves and suggestions, including Professor Plum with the Wrench in the Study and Miss Scarlet with the Pistol in the Kitchen.
- AIAgent was eliminated after accusing Professor Plum, Pistol, and Billiard Room. The accusation was incorrect; the match engine labels this state `OUT`.
- The immediate trigger was an unrefuted suggestion by another player for Professor Plum, Pistol, and Billiard Room. That is not proof of the solution because the suggester may privately hold one of those cards.
- Baseline Bo kept testing Professor Plum with Pistol across rooms and correctly continued until the Lounge was supported.
- Follow-up fix: an unrefuted suggestion by another player no longer creates a certain solution. Accusations require a unique solution from the local constraint solver, or a qualifying unrefuted suggestion made by the agent itself.

### Replay 10

- This three-player match was won by AIAgent.
- Three-player match: AIAgent had two opponents.
- The replay metadata confirms that AIAgent used the submitted Clue package: its source hash matched the local `Clue/clue-agent.zip` exactly.
- The correct solution was Mrs. White, Candlestick, and Dining Room.
- AIAgent kept Candlestick as its stable weapon while testing different suspects and rooms, including Mrs. Peacock in the Conservatory and Lounge, Professor Plum in the Hall, and Miss Scarlet in the Ballroom.
- After the visible constraints narrowed the remaining solution, AIAgent correctly accused Mrs. White with the Candlestick in the Dining Room.
- The replay recorded four relay calls using `openai/gpt-6-luna`; all game responses remained protocol-valid.
- This is the first recorded replay in which the updated AI agent solved the case before the Baseline Bo agents.

### Replay 11

- This six-player match had AIAgent and five Baseline Bo opponents. The user description said four opponents, but the replay JSON contains six seats and names Baseline Bo, Baseline Bo 2, Baseline Bo 3, Baseline Bo 4, and Baseline Bo 5.
- The replay metadata identifies the submitted package used in that run with source hash `17c5d9b0...`; this was the package before the later crowd-aware movement update.
- The correct solution was Mrs. Peacock, Pistol, and Dining Room; Baseline Bo won.
- The Baseline agents repeatedly gathered in and tested Dining Room, while AIAgent moved away to Ballroom on its later turn and did not participate in the busiest information cluster.
- AIAgent remained legal and did not crash, but its relay-selected movement target was strategically weaker than following the visible group.
- Follow-up fix: movement now prefers the busiest visible room, while the local pathfinder still checks reachability and preserves a safe fallback.
- Additional movement fix: when AIAgent is already in the busiest room and must leave before suggesting again, it chooses the nearest staging room so it can return to the information hub quickly.

### Replay 12

- This six-player match had AIAgent and five Baseline Bo opponents.
- The replay metadata confirms that AIAgent used the current submitted package: its source hash matched the local `Clue/clue-agent.zip` exactly.
- The correct solution was Colonel Mustard, Knife, and Study; Baseline Bo won.
- AIAgent was playing Professor Plum. It made legal movement and eventually suggested Mr. Green with the Candlestick in the Ballroom, but the match ended on the next Baseline Bo turn.
- Two AIAgent movement-planning relay calls returned `content: null`, so the local legal fallback handled those decisions safely. A later accusation-decision call returned `turn-ended`.
- Baseline Bo narrowed the case by testing Colonel Mustard with the Knife in Conservatory and then Study, keeping the suspect/weapon pair stable while changing rooms before making the correct accusation.
- Follow-up fix: relay requests now require JSON-object output, local crowd/focus movement goals are used before calling the relay, and the saved AI-call budget is reserved for suggestions and accusations. The local fallback still protects against malformed output.

### Replay 13

- This six-player match had AIAgent and five Baseline Bo opponents.
- AIAgent was playing Mrs. White and held Dining Room, Colonel Mustard, and Billiard Room.
- The replay used the earlier package with source hash `fa7ef5df...`; the current ZIP includes the later structured-output and AI-call-allocation improvements.
- AIAgent correctly showed cards to refute suggestions. The “private card” events were valid card responses, not crashes or eliminations.
- AIAgent moved Mrs. White into the corridor, ended the turn, and later made one legal suggestion: Mr. Green with the Candlestick in the Conservatory.
- Baseline Bo 2 solved the case with Mrs. White, Pistol, and Conservatory before AIAgent had enough turns to gather more evidence.
- This replay reinforces that early movement efficiency matters in larger matches: a legal but nonproductive first turn can leave the agent with too little time before another agent reaches a supported accusation.

### Replay 14

- This three-player match had AIAgent and two Baseline Bo opponents.
- The replay used the earlier package with source hash `0e41d50b...`; the current package has the more assertive confidence policy.
- The correct solution was Miss Scarlet, Candlestick, and Study; Baseline Bo won.
- AIAgent made two legal suggestions, including Colonel Mustard with Candlestick in the Conservatory and Professor Plum with Pistol in the Conservatory, but never made an accusation.
- All four recorded accusation-decision relay responses were `turn-ended`, so the model—not the local validator—was choosing to wait.
- Follow-up fix: the default AI accusation threshold is now 0.80 instead of 0.90, the prompt explicitly encourages a best-supported guess without requiring a unique candidate, and the model receives the local candidate count.

### Replay 15

- This six-player match had AIAgent alongside five Baseline Bo agents.
- The correct solution was Mrs. White, Wrench, and Hall; Baseline Bo 4 won on turn 91.
- Baseline Bo repeatedly gathered useful evidence by keeping suspect/weapon hypotheses stable while changing rooms. Its final sequence tested the Hall after earlier suggestions in the Ballroom, Billiard Room, Lounge, and Library, then made the supported accusation.
- AIAgent made legal moves and suggestions, but its first turn ended in the corridor and its later suggestions changed from Colonel Mustard with the Knife to Mr. Green with the Knife. The match ended before AIAgent had enough evidence to make a supported accusation.
- The replay also showed that spending reasoning calls on movement is less valuable than reserving them for suggestions and accusations; local movement remains responsible for legality.
- Follow-up fix: movement now first targets an untested candidate room for the current suspect/weapon focus, recovering that focus from visible history when necessary. Only after the focus-room investigation is exhausted does it fall back to the busiest visible room and staging-room behavior. This preserves the Baseline strategy while retaining safe local pathfinding.

### Replay 16

- In the next six-player replay, all three AIAgent seats used the updated ZIP and matched its source hash exactly.
- One AIAgent narrowed the case to two candidates but still returned `turn-ended`; Baseline Bo solved the case before another AIAgent turn.
- Follow-up fix: lower the default confidence threshold to 0.65 and make a bounded fallback accusation when at most two candidates remain. This intentionally accepts a small elimination risk to avoid losing races where the agent is nearly certain but the model waits.

### Replay 17

- The attached six-player replay had three AIAgent seats and three Baseline Bo seats. All AIAgent seats used the current ZIP exactly; the replay source hash matched `Clue/clue-agent.zip`.
- The solution was Mrs. White, Wrench, and Conservatory. Baseline Bo 2 solved the case before any AIAgent made an accusation.
- The AIAgent finish calls repeatedly returned `turn-ended` while the local solver reported roughly 107–208 candidates. One snapshot reported zero because the bounded deduction search was incomplete, not because the case had no possible solutions.
- The pasted match view showed the same broader problem: AIAgent made legal suggestions and card responses but almost never reached an accusation before Baseline Bo 2 won.
- Follow-up fix: expose deduction completeness, increase the six-player deduction budget to one second, and add a four-turn forced-guess deadline. Once the solver has completed, the agent now makes a bounded best-candidate accusation rather than waiting indefinitely for the model to become confident; incomplete or empty searches still cannot trigger an accusation.

### Replay 18

- This six-player replay had three AIAgent seats and three Baseline Bo seats. The replay source hash matched the current `Clue/clue-agent.zip` exactly.
- AIAgent 3 won with the solution Mr. Green, Wrench, and Lounge.
- The agent gathered evidence by testing Green with multiple weapons and rooms, eventually narrowing the solution to one locally supported candidate.
- The AI model proposed Green, Wrench, and Dining Room with high confidence, but the local solver rejected that room as impossible and substituted the correct Lounge accusation. This validation prevented a false elimination and produced the win.
- This replay demonstrates that the AI layer can be strategically imperfect while the deterministic deduction and legality layer still protects the final result.

### Replay 19

- This movement regression showed AIAgent as Mrs. White approaching a room with five movement spaces available.
- Instead of entering the reachable room, the path ended one corridor square backward, costing the agent a chance to make a suggestion. The attached JSON was the earlier Replay 18 file, so this entry is based on the pasted match log and screenshot.
- Follow-up fix: movement now performs a breadth-first search for a reachable room entrance before accepting an ordinary corridor endpoint. It still respects occupied squares, blocked doors, secret passages, target-room preferences, and the dice limit.

### Replay 20

- This pasted replay showed AIAgent narrowing onto Colonel Mustard and the Pistol, then testing Ballroom and Kitchen.
- After Kitchen was ruled out, AIAgent immediately accused Mustard, Pistol, and Conservatory, but the accusation was incorrect; the correct room was Billiard Room.
- The agent had not eliminated Billiard Room, so the accusation was a premature room guess even though the suspect and weapon were plausible.
- Follow-up fix: accusation validation now requires the local solver to identify the unique complete solution triple. Confidence and turn deadlines cannot override that certainty check; the agent continues investigating while any alternative triple remains.

### Replay 21

- In this pasted match, AIAgent was moved into the Ballroom by another player's suggestion and made a legal suggestion there.
- On the following turn, it moved out of the Ballroom but stopped in a corridor, so it did not receive a new suggestion opportunity before the match ended.
- Under the classic Hasbro rules, a player may make only one suggestion after entering a particular room and must leave and later re-enter before suggesting that room again. A player also cannot guarantee a suggestion when the dice and blocked paths do not reach another room.
- The current breadth-first movement logic already prioritizes entering any reachable room, regardless of which room it is. No rules-breaking change was made for this case.

