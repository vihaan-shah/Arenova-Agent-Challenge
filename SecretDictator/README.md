# Secret Dictator Agent

This package is a line-oriented Node 24 agent for Secret Dictator. It keeps a
public suspicion score from elections, policy outcomes, investigations, and
executions, while using the private `knownFascists` and `knownDictator` fields
from `game-started` to coordinate the Fascist side.

## How it works

1. It rebuilds the game state from the visible history every time it receives
   a decision.
2. It remembers who was President and Chancellor for every government and
   connects each revealed vote to that exact pair.
3. A government that makes a Fascist policy increases suspicion for its
   President, Chancellor, and yes-voters. A Liberal policy reduces it.
4. Investigation results, known Fascists, and `chancellor-confirmed-not-dictator`
   are treated as stronger evidence than ordinary voting patterns.
5. Card claims in discussion are checked softly. For example, `drew FFF,
   discarded F, and passed FF` is consistent with a Fascist outcome; a claim
   that contradicts the public result lowers trust.
6. Liberals choose safer governments, investigate or execute suspicious
   players, discard Fascist cards, and veto at five Fascist policies. Fascists
   prefer known allies, try to elect the Dictator after three Fascist policies,
   discard Liberal cards, and enact Fascist cards.
7. Every action is deterministic and limited to the legal response shape.

Liberals prefer low-suspicion governments, investigate or execute the most
suspicious legal target, discard Fascist policies, and veto a dangerous fifth
Fascist policy. Fascists prefer known allies, discard Liberal policies when
possible, enact Fascist policies, and keep the coalition alive. The agent also
remembers which exact government each vote supported, uses confirmed
investigation results and non-Dictator confirmations as hard evidence, and
adds short legal discussion statements.

## Replay analysis

### Replay 1 — Fascist victory

Replay ID: `9b48fc4f-43bf-4751-97a0-e3a0f3a15c83`

- The AIAgent was `seat-5`, an ordinary Fascist.
- The Dictator was `seat-3`; the other Fascist was `seat-4`.
- The Fascists won after the Dictator became Chancellor with three Fascist
  policies enacted.
- The agent correctly voted for Fascist-friendly governments and nominated the
  known Dictator when that was the winning move.
- All of its actions were legal and it did not crash.

The main lesson was that ordinary Fascists can coordinate easily because they
know their allies. The agent performed well in this role.

### Replay 2 — Liberal victory

Replay ID: `6e97ea4b-6a01-47b6-8365-2de183389729`

- Both AIAgents were Liberals in `seat-1` and `seat-7`.
- They won with five Liberal policies and only one Fascist policy.
- `seat-1` correctly discarded a Fascist from an `FFF` hand, but did not
  explain that the Fascist policy was forced.
- `seat-7` correctly chose Liberal cards when it received mixed cards.
- The Champion bots gave more specific card reports, such as “I received FF,”
  but sometimes over-trusted or over-accused players.

The main lesson was that the AIAgents needed specific public card claims rather
than generic statements. The agent was updated to say things such as “I drew
FFF, discarded F, and passed FF.”

### Replay 3 — Dictator executed

Replay ID: `3b9f72bf-0bc0-4580-abbf-98389bd67737`

- `seat-1` was an AIAgent Liberal and survived to the Liberal win.
- `seat-7` was an AIAgent Dictator and was executed.
- The Fascists reached five Fascist policies, but never elected the Dictator as
  Chancellor.
- A Fascist investigator correctly learned that `seat-7` was Fascist, while
  the public only saw that an investigation happened.
- The Dictator agent did not know its starting Fascist allies and chose a
  low-suspicion Chancellor candidate. That usually favors Liberals and was the
  most important strategic weakness.

The agent now treats the Dictator differently: without known allies, it looks
for the players with the strongest Fascist evidence when nominating or calling
a special election. It also votes yes more consistently as the Dictator and
flags investigation statements that contradict facts it personally knows.

### Overall replay lessons

- Legal actions and policy handling are reliable.
- Specific card claims are more useful than generic discussion.
- Claims should increase trust only when they match the public result.
- Ordinary Fascists should use their known allies directly.
- The Dictator needs a separate strategy because the role starts without ally
  information.
- Liberals should connect a Fascist policy to both government members and the
  voters who approved that exact government.
