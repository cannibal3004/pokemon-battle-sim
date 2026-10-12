import { estimateDamage } from "./damage";
import type { Battle } from "./engine";
import type { Combatant, MoveDef, Side, StatusId } from "./types";
import { OTHER } from "./types";

/**
 * Rough worth of inflicting each ailment, on the same 0-100 scale the damage
 * score uses (percentage of the foe's max HP).
 *
 * Sleep and freeze are scored equal on purpose. Freeze denies turns until a 20%
 * thaw roll succeeds (~5 turns expected) while sleep lasts 1-3, and this engine
 * has no fire-type thaw to shorten freeze, so neither clearly dominates.
 * Burn edges out poison because it also halves the victim's Attack here.
 */
const STATUS_VALUE: Record<Exclude<StatusId, "none">, number> = {
  sleep: 55,
  freeze: 55,
  paralysis: 35,
  burn: 32,
  poison: 28,
  flinch: 8,
};

/**
 * How good one move is for `c` against `foe`. Higher is better; 0 means the
 * move cannot help. No jitter here - callers add their own randomness so that
 * comparing two Pokemon's options stays deterministic.
 */
function scoreMove(
  c: Combatant,
  foe: Combatant,
  m: MoveDef,
  chart: number[][],
): number {
  if (m.class === "status") {
    // Dedicated status moves report ailment_chance 0 (the ailment is the whole
    // point of the move), so accuracy is the only hit-rate signal available.
    const acc = m.accuracy / 100;
    let score = 5;
    if (m.ailment !== "none") {
      // The engine allows one non-volatile status per Pokemon and rejects a
      // second, different one outright. Flinch is volatile, so it is not gated.
      const blocked = m.ailment !== "flinch" && foe.status !== "none";
      score = blocked ? 0 : acc * STATUS_VALUE[m.ailment];
    }
    if (m.selfChanges.some((s) => s.change > 0)) score = Math.max(score, acc * 25);
    if (m.targetChanges.some((s) => s.change < 0)) score = Math.max(score, acc * 20);
    if (m.ailment === "flinch" && foe.status === "none") score = Math.max(score, acc * 15);
    return score;
  }

  const est = estimateDamage(c, foe, m, chart);
  if (est.immune) return 0;

  let value = (est.amount / foe.maxHp) * 100;
  if (est.amount >= foe.hp) {
    // Still far above any non-KO value, but weighted: a 70%-accurate Hydro Pump
    // is worth less than a sure-hit Water Gun that also finishes the foe,
    // because a miss forfeits the knockout entirely.
    return (m.accuracy / 100) * 1000;
  }

  // applyDamageMove rolls the secondary per hit and only when the target
  // survived and holds no status, so a KO'd or already-statused foe makes it
  // worthless. Flinch is volatile and still lands on a statused foe.
  const ail = m.ailment;
  if (ail !== "none" && (ail === "flinch" || foe.status === "none")) {
    value += (m.ailmentChance / 100) * STATUS_VALUE[ail];
  }
  // Accuracy gates the whole move, not just the secondary: estimateDamage never
  // models a miss, so a 70% Thunder and an equally strong 100% Thunderbolt
  // would otherwise tie. The status branch weights by accuracy too, keeping
  // both on one axis.
  return (m.accuracy / 100) * value;
}

/** Best score any usable move of `c` achieves against `foe`; -Infinity if none. */
function bestScoreFor(c: Combatant, foe: Combatant, battle: Battle): number {
  let best = -Infinity;
  for (const slot of c.moves) {
    if (!slot || slot.pp <= 0) continue;
    if (c.item === "assault_vest" && slot.def.class === "status") continue;
    const s = scoreMove(c, foe, slot.def, battle.chart);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Would the AI rather be one of its bench Pokemon right now? Returns a bench
 * index, or null to stay in.
 *
 * Only fires when the active has nothing usable left. A voluntary switch costs
 * the whole turn in this engine: the replacement arrives but cannot attack, and
 * it still eats the foe's hit. That makes switching for a better matchup a
 * losing trade, measured rather than assumed - on 30 seeded matchups, switching
 * on a matchup gap won 17/30 at a 1.5x threshold and 19/30 at 3x, against 23/30
 * for never switching. So the matchup judgement is deliberately not made here.
 */
export function chooseAiSwitch(battle: Battle, side: Side): number | null {
  const c = battle.combatants[side];
  const foe = battle.combatants[OTHER[side]];

  // A Choice-locked Pokemon has to use its locked move, so switching is the
  // only escape and that is a bigger design change than this is meant to be.
  if (c.lockedMove !== null) return null;

  const activeScore = bestScoreFor(c, foe, battle);
  let bestIdx: number | null = null;
  let bestBench = -Infinity;

  battle.teams[side].forEach((bench, i) => {
    if (bench.hp <= 0 || bench === c) return;
    // Sending in something nearly dead trades one bad matchup for a worse one
    // and wastes the replacement on the first hit.
    if (bench.hp <= bench.maxHp * 0.25) return;
    const s = bestScoreFor(bench, foe, battle);
    if (s > bestBench) {
      bestBench = s;
      bestIdx = i;
    }
  });

  if (bestIdx === null) return null;
  // Out of usable moves the active is dead weight whatever the matchup, so any
  // bench option beats it. Short of that, stay in: see the measurement above.
  return activeScore === -Infinity ? bestIdx : null;
}

export function chooseAiMove(battle: Battle, side: Side): number {
  const c = battle.combatants[side];
  const foe = battle.combatants[OTHER[side]];

  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < c.moves.length; i++) {
    const slot = c.moves[i];
    if (!slot || slot.pp <= 0) continue;
    if (c.item === "assault_vest" && slot.def.class === "status") continue;
    if (c.lockedMove !== null && i !== c.lockedMove) continue;

    let score = scoreMove(c, foe, slot.def, battle.chart);
    score *= 0.85 + Math.random() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx === -1 ? 0 : bestIdx;
}
