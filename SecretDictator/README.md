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

The recorded replays show that the agent is protocol-safe and can win from
both factions, but the Dictator needs a different strategy from an ordinary
Fascist. The most useful improvement was replacing generic discussion with
specific card claims. The latest improvement makes the Dictator seek likely
Fascist candidates instead of automatically choosing the least-suspicious
player.

## Recorded replays

### Replay 1 — Fascist victory

`crucible-secret-dictator-9b48fc4f-43bf-4751-97a0-e3a0f3a15c83.json`

- The AIAgent was `seat-5`, an ordinary Fascist.
- The Dictator was `seat-3`; the other Fascist was `seat-4`.
- The Fascists won when the Dictator became Chancellor after three Fascist
  policies.
- The agent correctly used its known Fascist team information and all of its
  actions were legal.

### Replay 2 — Liberal victory

`crucible-secret-dictator-6e97ea4b-6a01-47b6-8365-2de183389729.json`

- Both AIAgents were Liberals in `seat-1` and `seat-7`.
- The Liberal team won with five Liberal policies and one Fascist policy.
- `seat-1` correctly discarded a Fascist from an `FFF` hand, but its original
  discussion statement did not explain that the Fascist policy was forced.
- `seat-7` correctly chose Liberal cards from mixed Chancellor hands.
- Champion bots gave more specific card reports, although they sometimes made
  overconfident accusations.

This replay led to the card-claim discussion system.

### Replay 3 — Dictator executed

`crucible-secret-dictator-3b9f72bf-0bc0-4580-abbf-98389bd67737.json`

- `seat-1` was an AIAgent Liberal and won.
- `seat-7` was an AIAgent Dictator and was executed.
- The Fascists reached five Fascist policies but never elected the Dictator as
  Chancellor.
- The Dictator did not know its starting Fascist allies and originally chose a
  low-suspicion Chancellor candidate, which usually favors Liberals.
- The Champion bots identified the Dictator through investigation and later
  executed it.

This replay led to the separate Dictator nomination, voting, and executive
targeting strategy.
