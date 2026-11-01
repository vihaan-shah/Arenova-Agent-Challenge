// Strategic Secret Dictator player.
//
// This agent does not try to solve the game like Clue.  It maintains a public
// suspicion model, uses the private role information supplied at game start,
// and makes different coalition decisions for Liberals and Fascists.

function events(history) {
  return history.map(({ event }) => event);
}

function setup(history) {
  return events(history).find((event) => event.type === "game-started");
}

function roleOf(start) {
  return String(start?.you?.role ?? start?.you?.allegiance ?? start?.role ?? "liberal").toLowerCase();
}

function isFascist(start) {
  const role = roleOf(start);
  return role.includes("fasc") || role.includes("dictator") || role.includes("hitler");
}

function isDictator(start) {
  const role = roleOf(start);
  return role.includes("dictator") || role.includes("hitler");
}

function team(start) {
  return new Set([
    ...(start?.knownFascists ?? []),
    ...(start?.knownDictator ? [start.knownDictator] : []),
    ...(isFascist(start) ? [start.you.seat] : []),
  ]);
}

function policyLetter(policy) {
  return policy === "fascist" ? "F" : "L";
}

function policyLetters(policies) {
  return (policies ?? []).map(policyLetter).join("");
}

function sortedLetters(value) {
  return [...String(value ?? "")].sort().join("");
}

function parseCardClaim(text) {
  const value = String(text ?? "");
  const claim = {};
  const drew = value.match(/\bdrew\s+([FL]{3})\b/i);
  const received = value.match(/\breceived\s+([FL]{2})\b/i);
  const passed = value.match(/\bpassed\s+([FL]{2})\b/i);
  const discarded = value.match(/\bdiscarded\s+([FL])\b/i);
  const enacted = value.match(/\benacted\s+(?:the\s+)?([FL])\b/i);
  if (drew) claim.drawn = drew[1].toUpperCase();
  if (received) claim.received = received[1].toUpperCase();
  if (passed) claim.passed = passed[1].toUpperCase();
  if (discarded) claim.discarded = discarded[1].toUpperCase();
  if (enacted) claim.enacted = enacted[1].toUpperCase();
  return claim;
}

function claimIsConsistent(claim, enactedPolicy) {
  const enacted = enactedPolicy ? policyLetter(enactedPolicy) : null;
  if (claim.drawn && claim.discarded && claim.passed &&
      sortedLetters(claim.drawn) !== sortedLetters(claim.discarded + claim.passed)) return false;
  if (claim.drawn && claim.discarded && !claim.drawn.includes(claim.discarded)) return false;
  if (claim.received && claim.enacted && !claim.received.includes(claim.enacted)) return false;
  if (claim.passed && enacted && !claim.passed.includes(enacted)) return false;
  if (claim.enacted && enacted && claim.enacted !== enacted) return false;
  return true;
}

function claimDescription(round, claim) {
  const parts = [];
  if (claim.drawn) parts.push(`I drew ${claim.drawn}`);
  if (claim.received) parts.push(`I received ${claim.received}`);
  if (claim.discarded) parts.push(`discarded ${claim.discarded}`);
  if (claim.passed) parts.push(`passed ${claim.passed}`);
  if (claim.enacted) parts.push(`enacted ${claim.enacted}`);
  return `Round ${round}: ${parts.join(", ")}.`;
}

function analyze(history) {
  const es = events(history);
  const start = setup(history);
  if (!start) throw new Error("missing game-started observation");

  const state = {
    seats: [...(start.seats ?? [])],
    alive: [...(start.seats ?? [])],
    you: start.you,
    role: roleOf(start),
    fascist: isFascist(start),
    dictator: isDictator(start),
    allies: team(start),
    suspicion: Object.fromEntries((start.seats ?? []).map((seat) => [seat, 0])),
    trust: Object.fromEntries((start.seats ?? []).map((seat) => [seat, 0])),
    knownLiberals: new Set(),
    knownFascistsPublic: new Set(start.knownFascists ?? []),
    confirmedNotDictator: new Set(),
    governmentVotes: new Map(),
    roundPolicies: new Map(),
    currentGovernment: null,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionFailures: 0,
    electionTracker: 0,
    president: start.president ?? start.firstPresident ?? start.seats?.[0],
    lastPresident: null,
    lastChancellor: null,
    nominatedChancellor: null,
    presidentPolicies: [],
    chancellorPolicies: [],
    vetoRejected: false,
    investigated: new Set(),
    lastPolicy: null,
    lastPolicyRound: null,
    lastOwnClaim: null,
    pendingPresidentHand: null,
    pendingPresidentDiscard: null,
    pendingChancellorHand: null,
  };

  const addSuspicion = (seat, amount) => {
    if (seat && seat !== state.you.seat && seat in state.suspicion) state.suspicion[seat] += amount;
  };
  const addTrust = (seat, amount) => {
    if (seat && seat !== state.you.seat && seat in state.trust) state.trust[seat] += amount;
  };
  const rememberStatement = (seat, text, round) => {
    if (!seat || !text || !(seat in state.suspicion)) return;
    const claim = parseCardClaim(text);
    const investigation = String(text).match(/\binvestigated\s+(seat-[0-9]+)\s*:\s*(liberal|fascist)/i);
    if (investigation) {
      const target = investigation[1];
      const result = investigation[2].toLowerCase();
      const contradictsKnownFact = (result === "liberal" && state.knownFascistsPublic.has(target)) ||
        (result === "fascist" && state.knownLiberals.has(target));
      if (contradictsKnownFact || (target === state.you.seat && state.fascist && result === "liberal")) {
        addSuspicion(seat, 3);
      }
    }
    if (!Object.keys(claim).length) return;
    const enacted = state.roundPolicies.get(round);
    addTrust(seat, claimIsConsistent(claim, enacted) ? 1 : -1.5);
  };
  const voteArray = (event) => event.votes ?? event.ballots ?? event.voteResults ?? [];
  for (const event of es) {
    if (event.type === "president-announced") {
      state.president = event.president;
      state.nominatedChancellor = null;
    } else if (event.type === "chancellor-nominated") {
      state.nominatedChancellor = event.chancellor ?? event.target;
      state.currentGovernment = {
        president: event.president ?? state.president,
        chancellor: state.nominatedChancellor,
      };
    } else if (event.type === "government-elected") {
      state.lastPresident = event.president;
      state.lastChancellor = event.chancellor;
      state.president = event.president;
      state.nominatedChancellor = event.chancellor;
      state.currentGovernment = { president: event.president, chancellor: event.chancellor };
      state.electionFailures = 0;
      state.electionTracker = 0;
    } else if (event.type === "votes-revealed") {
      // Keep votes attached to the exact government. A yes vote is not
      // suspicious by itself; it becomes meaningful when that government
      // later enacts a Fascist policy.
      const government = state.currentGovernment ?? {
        president: state.president,
        chancellor: state.nominatedChancellor,
      };
      const key = `${event.round ?? es.indexOf(event)}:${government.president}:${government.chancellor}`;
      state.governmentVotes.set(key, {
        ...government,
        votes: { ...(event.votes ?? {}) },
        passed: Boolean(event.passed),
      });
      if (!event.passed) {
        state.electionFailures += 1;
        state.electionTracker += 1;
      } else {
        state.electionFailures = 0;
        state.electionTracker = 0;
      }
    } else if (event.type === "government-rejected" || event.type === "election-failed") {
      state.electionFailures += 1;
      state.electionTracker += 1;
      for (const vote of voteArray(event)) {
        const seat = vote.seat ?? vote.player;
        const value = vote.vote ?? vote.result;
        if (value === "yes" || value === true) addSuspicion(seat, 1);
      }
    } else if (event.type === "vote-cast") {
      // Some engines expose individual ballots instead of a government result.
      if (event.vote === "yes" && event.target && event.target !== state.lastChancellor) {
        addSuspicion(event.seat, 0.15);
      }
    } else if (event.type === "election-tracker-advanced") {
      state.electionTracker = event.electionTracker ?? state.electionTracker;
    } else if (event.type === "policy-enacted") {
      state.lastPolicy = event.policy;
      state.lastPolicyRound = event.round ?? null;
      if (event.policy === "liberal") state.liberalPolicies += 1;
      if (event.policy === "fascist") state.fascistPolicies += 1;
      state.roundPolicies.set(event.round ?? es.indexOf(event), event.policy);
      // Chaos has no accountable government.  For an ordinary government,
      // use the seats named on the public event rather than stale state.
      if (event.source !== "chaos") {
        const president = event.president ?? state.lastPresident ?? state.president;
        const chancellor = event.chancellor ?? state.lastChancellor;
        const key = `${event.round ?? es.indexOf(event)}:${president}:${chancellor}`;
        const voteRecord = state.governmentVotes.get(key);
        if (president) addSuspicion(president, event.policy === "fascist" ? 1.2 : -0.35);
        if (chancellor) addSuspicion(chancellor, event.policy === "fascist" ? 1.5 : -0.4);
        if (voteRecord) {
          for (const [seat, vote] of Object.entries(voteRecord.votes)) {
            if (vote === "yes") addSuspicion(seat, event.policy === "fascist" ? 0.8 : -0.1);
            else if (event.policy === "liberal") addSuspicion(seat, 0.05);
          }
        }
      }
      state.presidentPolicies = [];
      state.chancellorPolicies = [];
      state.vetoRejected = false;
      const round = event.round ?? es.indexOf(event);
      const enactedPresident = event.president ?? state.lastPresident ?? state.currentGovernment?.president ?? state.president;
      const enactedChancellor = event.chancellor ?? state.lastChancellor ?? state.currentGovernment?.chancellor;
      if (enactedPresident === state.you.seat && state.pendingPresidentHand) {
        const claim = {
          drawn: policyLetters(state.pendingPresidentHand),
          discarded: state.pendingPresidentDiscard,
          passed: policyLetters(state.pendingPresidentHand),
        };
        if (state.pendingPresidentDiscard) {
          const remaining = [...state.pendingPresidentHand];
          const index = remaining.indexOf(state.pendingPresidentDiscard === "F" ? "fascist" : "liberal");
          if (index >= 0) remaining.splice(index, 1);
          claim.passed = policyLetters(remaining);
        }
        state.lastOwnClaim = { round, text: claimDescription(round, claim) };
      } else if (enactedChancellor === state.you.seat && state.pendingChancellorHand) {
        const claim = {
          received: policyLetters(state.pendingChancellorHand),
          enacted: policyLetter(event.policy),
        };
        state.lastOwnClaim = { round, text: claimDescription(round, claim) };
      }
      state.pendingPresidentHand = null;
      state.pendingPresidentDiscard = null;
      state.pendingChancellorHand = null;
    } else if (event.type === "president-cards-drawn" && event.policies) {
      state.presidentPolicies = [...event.policies];
      if (event.president === state.you.seat) state.pendingPresidentHand = [...event.policies];
    } else if (event.type === "chancellor-policies-received" && event.policies) {
      state.chancellorPolicies = [...event.policies];
      state.vetoRejected = false;
      if (event.chancellor === state.you.seat) state.pendingChancellorHand = [...event.policies];
    } else if (event.type === "president-policy-discarded" || event.type === "president-discarded") {
      const policy = event.policy ?? event.discarded?.policy;
      if (event.president === state.you.seat && policy) state.pendingPresidentDiscard = policyLetter(policy);
    } else if (event.type === "veto-responded") {
      state.vetoRejected = !event.accepted;
    } else if (event.type === "loyalty-investigated") {
      state.investigated.add(event.target);
      if (event.loyalty === "fascist" || event.allegiance === "fascist") addSuspicion(event.target, 5);
      if (event.loyalty === "liberal" || event.allegiance === "liberal") state.suspicion[event.target] = -10;
    } else if (event.type === "investigation-result") {
      if (event.faction === "fascist" || event.allegiance === "fascist") {
        state.knownFascistsPublic.add(event.target);
        addSuspicion(event.target, 5);
      }
      if (event.faction === "liberal" || event.allegiance === "liberal") {
        state.knownLiberals.add(event.target);
        state.suspicion[event.target] = -10;
      }
    } else if (event.type === "chancellor-confirmed-not-dictator") {
      state.confirmedNotDictator.add(event.seat);
      state.suspicion[event.seat] = Math.min(state.suspicion[event.seat], -2);
    } else if (event.type === "player-executed") {
      state.alive = state.alive.filter((seat) => seat !== event.target);
      if (event.target && state.allies.has(event.target)) addSuspicion(event.target, -20);
    } else if (event.type === "special-election-called") {
      addSuspicion(event.presidentCandidate ?? event.target, 0.3);
    } else if (event.type === "player-statement") {
      rememberStatement(event.from, event.text, event.round ?? state.lastPolicyRound);
    } else if (event.type === "discussion-contributed" && event.statement) {
      rememberStatement(event.seat ?? event.from, event.statement, event.round ?? state.lastPolicyRound);
    }
  }
  return state;
}

function legalTargets(state, kind) {
  if (kind === "nominate-chancellor") {
    return state.alive.filter((seat) => seat !== state.president && seat !== state.lastChancellor &&
      (state.alive.length <= 5 || seat !== state.lastPresident));
  }
  return state.alive.filter((seat) => seat !== state.president &&
    (kind !== "investigate-player" || !state.investigated.has(seat)));
}

function ranked(state, candidates, descending = true) {
  return [...candidates].sort((a, b) => {
    const score = (seat) => state.suspicion[seat] - (state.trust[seat] ?? 0) * 1.2;
    const delta = score(b) - score(a);
    return (descending ? delta : -delta) || state.seats.indexOf(a) - state.seats.indexOf(b);
  });
}

function bestTarget(state, kind) {
  const candidates = legalTargets(state, kind);
  if (!candidates.length) throw new Error("no legal player target");
  if (state.fascist && (kind === "nominate-chancellor" || kind === "special-election")) {
    const allies = candidates.filter((seat) => state.allies.has(seat));
    if (allies.length) return ranked(state, allies, false)[0];
    // The Dictator has no starting ally information. In that role, the best
    // proxy for a Fascist teammate is the player with the strongest public
    // Fascist evidence, especially once three Fascist policies are enacted.
    const investigatedFascists = candidates.filter((seat) => state.knownFascistsPublic.has(seat));
    if (investigatedFascists.length) return ranked(state, investigatedFascists, false)[0];
    return ranked(state, candidates, true)[0];
  }
  if (state.fascist && (kind === "investigate-player" || kind === "execute-player")) {
    const nonAllies = candidates.filter((seat) => !state.allies.has(seat));
    if (nonAllies.length) return ranked(state, nonAllies, false)[0];
  }
  const safe = candidates.filter((seat) => !state.knownFascistsPublic.has(seat));
  return ranked(state, safe.length ? safe : candidates, !state.fascist)[0];
}

function nominationStatement(state, target) {
  if (state.fascist && state.allies.has(target)) return `I nominate ${target}; this government can move the Fascist agenda forward.`;
  return `I nominate ${target}; let us test this government and watch the policy result.`;
}

function discussionStatement(state) {
  if (state.lastOwnClaim?.round === state.lastPolicyRound) return state.lastOwnClaim.text;
  if (state.lastPolicy === "fascist") return state.fascist
    ? "I support this government; we need to keep the table moving."
    : "A Fascist policy needs accountability. I am tracking both members of that government.";
  if (state.lastPolicy === "liberal") return "This government produced a Liberal policy, but every vote still matters.";
  return state.fascist ? "I support a government that advances our side." : "I support cautious governments with clear reasoning.";
}

function fallbackDecision(state, decision) {
  if (decision.kind === "nominate-chancellor") {
    const target = bestTarget(state, decision.kind);
    return { type: "chancellor-nominated", target, statement: nominationStatement(state, target) };
  }
  if (decision.kind === "vote") {
    const nominee = state.nominatedChancellor ?? decision.chancellor ?? decision.target;
    const adjustedSuspicion = state.suspicion[nominee] - (state.trust[nominee] ?? 0) * 1.2;
    const dangerous = state.fascistPolicies >= 3 && !state.allies.has(nominee) && adjustedSuspicion >= 2;
    const confirmedFascist = state.knownFascistsPublic.has(nominee);
    const trusted = state.allies.has(nominee) || state.knownLiberals.has(nominee) ||
      ((state.trust[nominee] ?? 0) >= 1 && adjustedSuspicion < 2) || adjustedSuspicion <= 0;
    if (state.dictator) return { type: "vote-cast", vote: "yes" };
    if (!state.fascist && (confirmedFascist || dangerous)) return { type: "vote-cast", vote: "no" };
    return { type: "vote-cast", vote: state.fascist ? (trusted || state.fascistPolicies < 3 ? "yes" : "no") : (dangerous ? "no" : (trusted ? "yes" : "no")) };
  }
  if (decision.kind === "president-discard") {
    const policies = state.presidentPolicies;
    if (!policies.length) return { type: "president-discarded", policy: "liberal" };
    const desired = state.fascist ? "liberal" : "fascist";
    const discard = policies.includes(desired) ? desired : policies[0];
    return { type: "president-discarded", policy: discard };
  }
  if (decision.kind === "chancellor-legislate") {
    const policies = state.chancellorPolicies;
    if (state.fascist && policies.includes("fascist")) return { type: "policy-enacted", policy: "fascist" };
    if (!state.fascist && policies.includes("liberal")) return { type: "policy-enacted", policy: "liberal" };
    if (state.fascist && policies.includes("liberal")) return { type: "policy-enacted", policy: "liberal" };
    if (!state.fascist && state.fascistPolicies >= 5 && !state.vetoRejected) return { type: "veto-requested" };
    return { type: "policy-enacted", policy: policies.includes("fascist") ? "fascist" : "liberal" };
  }
  if (decision.kind === "president-veto-response") return { type: "veto-responded", accepted: !state.fascist };
  if (decision.kind === "investigate-player") return { type: "loyalty-investigated", target: bestTarget(state, decision.kind) };
  if (decision.kind === "special-election") {
    const target = bestTarget(state, decision.kind);
    return { type: "special-election-called", target, statement: `I choose ${target} for the special election so we can evaluate a different government.` };
  }
  if (decision.kind === "execute-player") return { type: "player-executed", target: bestTarget(state, decision.kind) };
  if (decision.kind === "discuss") return { type: "discussion-contributed", statement: discussionStatement(state) };
  throw new Error("unexpected decision kind: " + decision.kind);
}

function decide(history, decision) {
  return fallbackDecision(analyze(history), decision);
}

async function handleRequest(request) {
  if (request.type === "init") return {};
  if (request.type !== "decision") throw new Error("unknown request type");
  return decide(request.history ?? [], request.decision);
}

async function run() {
  const { createInterface } = await import("node:readline");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      process.stdout.write(JSON.stringify(await handleRequest(JSON.parse(line))) + "\n");
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
      lines.close();
      return;
    }
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
