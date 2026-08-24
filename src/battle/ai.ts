import { estimateDamage } from "./damage";
import type { Battle } from "./engine";
import type { Side } from "./types";
import { OTHER } from "./types";

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
      score = 5;
      if (m.ailment !== "none") {
        if (foe.status === "none") score = 35 + m.ailmentChance * 0.25;
        else if (foe.status === m.ailment) score = 0;
      }
      if (m.selfChanges.some((s) => s.change > 0)) score = Math.max(score, 25);
      if (m.targetChanges.some((s) => s.change < 0)) score = Math.max(score, 20);
      if (m.ailment === "flinch" && foe.status === "none") score = Math.max(score, 15);
    } else {
      const est = estimateDamage(c, foe, m, battle.chart);
      if (est.immune) {
        score = 0;
      } else {
        score = (est.amount / foe.maxHp) * 100;
        if (est.amount >= foe.hp) score = 1000;
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
