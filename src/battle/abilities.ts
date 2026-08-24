import type { Combatant, TypeName } from "../battle/types";

export interface AbilityDef {
  name: string;
  description: string;
  /** e.g. Overgrow: boost power of these types at low HP */
  lowHpBoostTypes?: TypeName[];
  /** e.g. Levitate: immunity to these types */
  immuneTypes?: TypeName[];
  /** e.g. Thick Fat: halve damage from these types */
  halveTypes?: TypeName[];
  /** e.g. Intimidate: lower foe's Attack on entry */
  intimidate?: boolean;
  /** e.g. Guts: +50% Attack while burned */
  guts?: boolean;
  /** survive one lethal hit at 1 HP */
  sturdy?: boolean;
  /** halve the first hit taken */
  multiscale?: boolean;
  /** ignore residual damage (burn/poison) */
  magicGuard?: boolean;
}

const defs: Record<string, AbilityDef> = {
  overgrow: { name: "Overgrow", description: "Grass moves are 1.5x as powerful when HP is below 1/3.", lowHpBoostTypes: ["grass"] },
  blaze: { name: "Blaze", description: "Fire moves are 1.5x as powerful when HP is below 1/3.", lowHpBoostTypes: ["fire"] },
  swarm: { name: "Swarm", description: "Bug moves are 1.5x as powerful when HP is below 1/3.", lowHpBoostTypes: ["bug"] },
  levitate: { name: "Levitate", description: "Immune to Ground-type moves.", immuneTypes: ["ground"] },
  thick_fat: { name: "Thick Fat", description: "Fire- and Water-type damage taken is halved.", halveTypes: ["fire", "water"] },
  guts: { name: "Guts", description: "Attack is 1.5x as long as it is burned.", guts: true },
  intimidate: { name: "Intimidate", description: "Lowers the foe's Attack by one stage when the battle starts.", intimidate: true },
  sturdy: { name: "Sturdy", description: "Survives any hit at 1 HP once.", sturdy: true },
  multiscale: { name: "Multiscale", description: "Halves the damage of the first hit taken.", multiscale: true },
  magic_guard: { name: "Magic Guard", description: "Takes no damage from burns, poison, or other residual effects.", magicGuard: true },
  lightning_rod: { name: "Lightning Rod", description: "Draws Electric moves (not implemented) — no effect here." },
  static: { name: "Static", description: "No effect in this simulator." },
  moisture: { name: "Moisture", description: "No effect in this simulator." },
  water_absorb: { name: "Water Absorb", description: "No effect in this simulator." },
  chlorophyll: { name: "Chlorophyll", description: "No effect in this simulator (no weather)." },
};

export function getAbility(name: string): AbilityDef | undefined {
  return defs[name];
}

export function abilityLabel(name: string): string {
  return defs[name]?.name ?? name.replace(/_/g, " ");
}

export function isMagicGuard(c: Combatant): boolean {
  return getAbility(c.ability)?.magicGuard === true;
}
