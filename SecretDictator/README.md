# Arenova Secret Dictator Agent

## What this is

This is a Secret Dictator player for the Arenova Agent Challenge. It follows
the seven-player Secret Hitler rules used by the game and uses separate
strategies for Liberals, ordinary Fascists, and the Dictator.

The agent reads one JSON message per line from standard input and writes one
JSON response per line. It is deterministic and includes its own legality-safe
fallback, so it does not depend on a network service or an external model.

## How the agent plays

Rebuilds the public game state from the visible history for every decision.
Tracks each President–Chancellor pair and connects revealed votes to that exact
government.
Raises suspicion when a government produces a Fascist policy, especially for
the President, Chancellor, and yes-voters who approved it.
Uses investigations, known Fascists, and `chancellor-confirmed-not-dictator` as
stronger evidence than ordinary voting patterns.
Reads card claims in discussion. A consistent claim such as “I drew FFF,
discarded F, and passed FF” increases trust; a claim that contradicts the
public result lowers trust.
Reports its own private card information so other players can judge whether a
Fascist policy was forced or chosen.

As a Liberal, the agent prefers safer governments, discards Fascist cards,
investigates or executes the most suspicious legal target, and requests a veto
when a Fascist policy would be dangerous. It does not treat one suspicious vote
as proof; it combines voting history, policy outcomes, investigations, and
discussion claims.

As an ordinary Fascist, it uses the known Fascist team, supports governments
that advance the Fascist side, and tries to elect the Dictator after three
Fascist policies. As the Dictator, it starts without ally information, so it
looks for players with the strongest public Fascist evidence instead of always
choosing the safest-looking player.

The local strategy handles every decision kind, including nominations, votes,
policy cards, vetoes, investigations, special elections, executions, and table
talk. It keeps targets legal, respects term limits, avoids known allies when a
Fascist uses an executive power, and returns only the response fields allowed
by the player API.

## Files

- `secret-dictator-agent.mjs` — the submission agent.
- `crucible.json` — tells the runner to use Node 24 and the entrypoint.
- `README.md` — this replay summary.

## Replay summary

The latest two evaluation runs show that the agent is protocol-safe and can
coordinate effectively as the Fascist team, while Liberal play still needs
more caution around late-game governments.

### What the agent does well

- Ordinary Fascists use their known allies and can move policies quickly.
- Fascists coordinate special elections and can place the Dictator in a
  position to win.
- The Dictator can use public Fascist evidence even though it starts without
  ally information.
- Presidents and Chancellors report exact card information, including forced
  outcomes such as `FFF -> discard F -> pass FF`.
- All observed actions were legal and the agent did not crash.

### What the agent needs to improve

- Liberals previously nominated or special-elected suspicious Fascists after
  two or three Fascist policies.
- Liberal agents approved too many governments instead of rejecting a
  candidate who had already participated in a Fascist government.
- After the third Fascist policy, a Liberal special election must prefer a
  trusted Liberal; choosing a suspicious player can immediately hand them the
  Presidency and the Dictator win.
- Discussion claims are useful, but a truthful card claim should not erase all
  suspicion from a player who repeatedly appears in Fascist governments.

### Latest evaluation runs

- `crucible-secret-dictator-e3d51c11-ab72-4ccc-9bcd-12fa70f18669.json` tested
  two AIAgents as Liberals. The Fascists won after the Liberal President chose
  a suspicious player for a special election, allowing that player to elect
  the Dictator.
- `crucible-secret-dictator-0ad4d74b-a0a0-4e41-af12-eadfb1838520.json` tested
  three AIAgents as the Fascist team. They enacted three Fascist policies and
  successfully elected the Dictator as Chancellor.

Future replay results should be added to this latest-evaluation section and
used to update the strengths and weaknesses above. Older replay-by-replay
records are intentionally omitted so this summary reflects current behavior.
