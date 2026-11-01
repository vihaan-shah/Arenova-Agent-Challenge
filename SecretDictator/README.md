# Arenova Secret Dictator Agent

## What this is

This is a Secret Dictator player for the Arenova Agent Challenge. It follows
the seven-player Secret Hitler rules used by the game and keeps separate
strategies for Liberals, ordinary Fascists, and the Dictator.

The agent reads one JSON message per line from standard input and writes one
JSON response per line. It always returns a legal response shape for the
decision it received.

## How the agent plays

1. Rebuilds the public game state from the visible history for every decision.
2. Tracks each President–Chancellor pair and connects revealed votes to that
   exact government.
3. Raises suspicion when a government produces a Fascist policy, especially
   for the President, Chancellor, and yes-voters who approved it.
4. Uses investigations, known Fascists, and non-Dictator confirmations as
   stronger evidence than ordinary voting patterns.
5. Reads card claims in discussion. Consistent claims such as “I drew FFF,
   discarded F, and passed FF” increase trust; contradictions reduce trust.
6. As a Liberal, chooses safer governments, discards Fascist policies,
   investigates or executes suspicious players, and requests a veto when
   necessary.
7. As an ordinary Fascist, coordinates with known allies and tries to elect
   the Dictator after three Fascist policies.
8. As the Dictator, uses public Fascist evidence to find likely Fascist allies,
   because the Dictator does not know the Fascist team at game start.
9. Reports its own card information during discussion so other players can
   evaluate the government fairly.

The agent is deterministic. It does not need a network service or a model call;
the role strategy, evidence tracking, and legal fallback all run locally.

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

## Overall lessons

- Legal responses and policy handling have been reliable across the replays.
- Exact card claims are more useful than generic discussion.
- A card claim should increase trust only when it matches the public result.
- Ordinary Fascists should use their known allies directly.
- The Dictator needs to infer allies from public Fascist behavior.
- Liberals should connect a Fascist policy to the whole government and its
  approving voters instead of blaming only the Chancellor.
