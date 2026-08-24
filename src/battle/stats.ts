import type { NatureDef, StatId, StatStage } from "./types";

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function effectiveStat(
  stats: Record<StatId, number>,
  stages: Record<StatStage, number>,
  stat: StatStage,
): number {
  return Math.max(1, Math.floor(stats[stat] * stageMultiplier(stages[stat])));
}

export function rollNature(natures: NatureDef[]): NatureDef {
  return natures[Math.floor(Math.random() * natures.length)];
}

export function computeStats(
  base: Record<StatId, number>,
  level: number,
  nature: NatureDef,
): Record<StatId, number> {
  const IV = 31;
  const EV = 0;
  const core = (b: number) => Math.floor(2 * b + IV + EV / 4);

  const out = {
    hp: Math.floor((core(base.hp) * level) / 100) + level + 10,
    attack: Math.floor((core(base.attack) * level) / 100) + 5,
    defense: Math.floor((core(base.defense) * level) / 100) + 5,
    special_attack: Math.floor((core(base.special_attack) * level) / 100) + 5,
    special_defense:
      Math.floor((core(base.special_defense) * level) / 100) + 5,
    speed: Math.floor((core(base.speed) * level) / 100) + 5,
  };

  if (nature.up && nature.up !== "hp") {
    out[nature.up] = Math.floor(out[nature.up] * 1.1);
  }
  if (nature.down && nature.down !== "hp") {
    out[nature.down] = Math.floor(out[nature.down] * 0.9);
  }

  return out;
}

export function emptyStages(): Record<StatStage, number> {
  return {
    attack: 0,
    defense: 0,
    special_attack: 0,
    special_defense: 0,
    speed: 0,
  };
}

const STAGE_WORDS = [
  "fell sharply",
  "dropped a lot",
  "dropped",
  "rose",
  "rose a lot",
  "rose sharply",
];

export function stageWord(delta: number): string {
  return STAGE_WORDS[delta + 3];
}

const STAT_LABELS: Record<StatStage, string> = {
  attack: "Attack",
  defense: "Defense",
  special_attack: "Sp. Atk",
  special_defense: "Sp. Def",
  speed: "Speed",
};

export function statLabel(stat: StatStage): string {
  return STAT_LABELS[stat];
}

export function effectiveSpeed(
  stats: Record<StatId, number>,
  stages: Record<StatStage, number>,
  paralyzed: boolean,
): number {
  let speed = Math.max(1, stats.speed * stageMultiplier(stages.speed));
  if (paralyzed) speed /= 2;
  return speed;
}
