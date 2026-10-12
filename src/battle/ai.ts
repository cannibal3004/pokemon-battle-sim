import { estimateDamage } from "./damage";
import type { Battle } from "./engine";
import type { Side, StatusId } from "./types";
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

export function chooseAiMove(battle: Battle, side: Side): number {
  const c = battle.combatants[side];
  const foe = battle.combatants[OTHER[side]];

  const usable = (i: number): boolean => {
    const slot = c.moves[i];
    if (!slot || slot.pp <= 0) return false;
    if (c.item === "assault_vest" && slot.def.class === "status") return false;
    if (c.lockedMove !== null) return i === c.lockedMove;
    return true;
  };

  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < c.moves.length; i++) {
    if (!usable(i)) continue;
    const m = c.moves[i].def;
    let score: number;

    if (m.class === "status") {
      // Dedicated status moves report ailment_chance 0 (the ailment is the whole
      // point of the move), so accuracy is the only hit-rate signal available.
      const acc = m.accuracy / 100;
      score = 5;
      if (m.ailment !== "none") {
        // The engine allows one non-volatile status per Pokemon and rejects a
        // second, different one outright. Scoring such a move anyway made the AI
        // spend turns on moves that could never land. Flinch is volatile, so it
        // is not gated on this.
        const blocked = m.ailment !== "flinch" && foe.status !== "none";
        score = blocked ? 0 : acc * STATUS_VALUE[m.ailment];
      }
      if (m.selfChanges.some((s) => s.change > 0)) score = Math.max(score, acc * 25);
      if (m.targetChanges.some((s) => s.change < 0)) score = Math.max(score, acc * 20);
      if (m.ailment === "flinch" && foe.status === "none") score = Math.max(score, acc * 15);
    } else {
      const est = estimateDamage(c, foe, m, battle.chart);
      if (est.immune) {
        score = 0;
      } else {
        let value = (est.amount / foe.maxHp) * 100;
        if (est.amount >= foe.hp) {
          score = 1000;
        } else {
          // applyDamageMove rolls the secondary per hit and only when the
          // target survived the hit and holds no status, so a KO'd or already
          // statused foe makes it worthless. Flinch is volatile and still
          // lands on a statused foe.
          const ail = m.ailment;
          const secondaryLands =
            ail !== "none" && (ail === "flinch" || foe.status === "none");
          if (secondaryLands) {
            value += (m.ailmentChance / 100) * STATUS_VALUE[ail];
          }
          score = value;
        }
      }
    }

    score *= 0.85 + Math.random() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx === -1 ? 0 : bestIdx;
}
