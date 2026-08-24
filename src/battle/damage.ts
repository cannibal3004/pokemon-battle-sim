import { effectiveSpeed } from "./stats";
import { getAbility } from "./abilities";
import { effectiveness } from "../data/typeChart";
import type { Combatant, MoveDef, StatStage } from "./types";

export interface DamageResult {
  amount: number;
  crit: boolean;
  stab: boolean;
  effectiveness: number;
  immune: boolean;
}

export function rollCrit(attackerLevel: number, defenderLevel: number): boolean {
  const chance = (62 / 64 + attackerLevel - defenderLevel + 1) / 64;
  return Math.random() < chance;
}

export function calculateDamage(
  attacker: Combatant,
  defender: Combatant,
  move: MoveDef,
  chart: number[][],
  opts: { randomFactor?: number; forceCrit?: boolean } = {},
): DamageResult {
  let eff = effectiveness(chart, move.type, defender.def.types);
  const defAbility = getAbility(defender.ability);
  if (defAbility?.immuneTypes?.includes(move.type)) eff = 0;
  if (eff === 0) {
    return { amount: 0, crit: false, stab: false, effectiveness: 0, immune: true };
  }

  const crit = opts.forceCrit ?? rollCrit(attacker.level, defender.level);
  const isPhysical = move.class === "physical";
  const atkStatName: StatStage = isPhysical ? "attack" : "special_attack";
  const defStatName: StatStage = isPhysical ? "defense" : "special_defense";

  let atkStat = Math.max(
    1,
    Math.floor(attacker.stats[atkStatName] * stageMultOf(attacker, atkStatName, crit)),
  );
  let defStat = Math.max(
    1,
    Math.floor(defender.stats[defStatName] * stageMultOf(defender, defStatName, crit)),
  );

  if (isPhysical && attacker.status === "burn") atkStat = Math.floor(atkStat / 2);

  if (attacker.item === "choice_band" && isPhysical) atkStat = Math.floor(atkStat * 1.5);
  if (attacker.item === "choice_specs" && !isPhysical) atkStat = Math.floor(atkStat * 1.5);
  const attackerAbility = getAbility(attacker.ability);
  if (attackerAbility?.guts && attacker.status === "burn" && isPhysical) {
    atkStat = Math.floor(atkStat * 1.5);
  }

  if (defender.item === "eviolite" && !defender.def.fullyEvolved) {
    defStat = Math.floor(defStat * 1.5);
  }
  if (defender.item === "assault_vest" && defStatName === "special_defense") {
    defStat = Math.floor(defStat * 1.5);
  }

  const level = attacker.level;
  const base =
    Math.floor(
      (Math.floor(((2 * level) / 5 + 2) * move.power * atkStat) / defStat) / 50,
    ) + 2;

  let mult = opts.randomFactor ?? 0.85 + Math.random() * 0.15;
  if (crit) mult *= 1.5;
  const stab = attacker.def.types.includes(move.type);
  if (stab) mult *= 1.5;
  mult *= eff;

  if (
    attackerAbility?.lowHpBoostTypes?.includes(move.type) &&
    attacker.hp * 3 <= attacker.maxHp
  ) {
    mult *= 1.5;
  }
  if (defAbility?.halveTypes?.includes(move.type)) mult *= 0.5;
  if (attacker.item === "life_orb") mult *= 1.3;

  const amount = Math.max(1, Math.floor(base * mult));
  return { amount, crit, stab, effectiveness: eff, immune: false };
}

function stageMultOf(c: Combatant, stat: StatStage, ignoreStages: boolean): number {
  const stage = ignoreStages ? 0 : c.stages[stat];
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function estimateDamage(
  attacker: Combatant,
  defender: Combatant,
  move: MoveDef,
  chart: number[][],
): DamageResult {
  return calculateDamage(attacker, defender, move, chart, {
    randomFactor: 0.925,
    forceCrit: false,
  });
}

export function speedTieBreak(a: Combatant, b: Combatant): number {
  const sa = effectiveSpeed(a.stats, a.stages, a.status === "paralysis");
  const sb = effectiveSpeed(b.stats, b.stages, b.status === "paralysis");
  if (sa !== sb) return sa - sb;
  return Math.random() - 0.5;
}
