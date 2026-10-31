# Secret Dictator Agent

This package is a line-oriented Node 24 agent for Secret Dictator. It keeps a
public suspicion score from elections, policy outcomes, investigations, and
executions, while using the private `knownFascists` and `knownDictator` fields
from `game-started` to coordinate the Fascist side.

Liberals prefer low-suspicion governments, investigate or execute the most
suspicious legal target, discard Fascist policies, and veto a dangerous fifth
Fascist policy. Fascists prefer known allies, discard Liberal policies when
possible, enact Fascist policies, and keep the coalition alive. The agent also
remembers which exact government each vote supported, uses confirmed
investigation results and non-Dictator confirmations as hard evidence, and
adds short legal discussion statements.

## Simple test cases

- Start as a Liberal and give the agent a government with a known Fascist. It
  should vote `no`.
- Start as a Fascist and give it a legal nomination containing its known
  Dictator. It should nominate the Dictator when that can win the game.
- Give the agent three Fascist policies and a suspicious government. A Liberal
  should reject it.
- Give the President `Fascist, Liberal, Fascist`. A Liberal should discard a
  Fascist card; a Fascist should discard a Liberal card.
- Give the Chancellor two Fascist cards after five Fascist policies. A Liberal
  should request a veto.
- Add an investigation proving a player Liberal. The agent should stop treating
  that player as suspicious.
- Add `chancellor-confirmed-not-dictator`. The agent should remember that the
  player is not the Dictator.
- Run a history with three failed governments. The agent must still return a
  legal response after chaos.
- Run every decision kind and validate that the returned target is alive, the
  policy is in the visible hand, and the response has only allowed fields.
