export const TYPE_NAMES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type TypeName = (typeof TYPE_NAMES)[number];

export const STAT_NAMES = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
] as const;

export type StatId = (typeof STAT_NAMES)[number];
export type StatStage = Exclude<StatId, "hp">;

export const STAGE_STATS: StatStage[] = [
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
];

export type DamageClass = "physical" | "special" | "status";

export type StatusId = "none" | "burn" | "paralysis" | "poison" | "flinch";

export interface StatStageChange {
  stat: StatStage;
  change: number;
  chance: number;
}

export interface MoveDef {
  id: number;
  name: string;
  displayName: string;
  type: TypeName;
  class: DamageClass;
  power: number;
  accuracy: number;
  pp: number;
  maxPp: number;
  priority: number;
  ailment: StatusId;
  ailmentChance: number;
  selfChanges: StatStageChange[];
  targetChanges: StatStageChange[];
  recoilPct: number;
  drainPct: number;
  targetsSelf: boolean;
}

export interface CombatantMove {
  def: MoveDef;
  pp: number;
}

export interface PokemonDef {
  id: number;
  name: string;
  displayName: string;
  types: TypeName[];
  baseStats: Record<StatId, number>;
  sprite: string;
  backSprite: string;
  artwork: string;
  cry: string;
  abilities: string[];
  fullyEvolved: boolean;
  moves: MoveDef[];
}

export interface Combatant {
  def: PokemonDef;
  side: Side;
  level: number;
  nature: string;
  stats: Record<StatId, number>;
  maxHp: number;
  hp: number;
  status: StatusId;
  stages: Record<StatStage, number>;
  moves: CombatantMove[];
  ability: string;
  item: string;
  lockedMove: number | null;
  itemUsed: boolean;
  sturdyUsed: boolean;
  multiscaleUsed: boolean;
  flinched: boolean;
}

export type Side = "player" | "ai";

export const OTHER: Record<Side, Side> = { player: "ai", ai: "player" };

export interface NatureDef {
  name: string;
  up: StatId | null;
  down: StatId | null;
}

export type BattleEvent =
  | { kind: "turn"; turn: number }
  | { kind: "announce"; side: Side; text: string }
  | { kind: "miss"; side: Side; text: string }
  | { kind: "no-effect"; side: Side; text: string }
  | { kind: "paralyzed"; side: Side; text: string }
  | { kind: "flinch"; side: Side; text: string }
  | {
      kind: "damage";
      side: Side;
      amount: number;
      maxHp: number;
      crit: boolean;
      stab: boolean;
      effectiveness: number;
      source: "move" | "burn" | "poison" | "recoil";
      text: string;
    }
  | { kind: "heal"; side: Side; amount: number; maxHp: number; text: string }
  | {
      kind: "status";
      side: Side;
      status: StatusId;
      text: string;
    }
  | {
      kind: "stat-change";
      side: Side;
      stat: StatStage;
      delta: number;
      stages: number;
      text: string;
    }
  | { kind: "ability-note"; side: Side; text: string }
  | { kind: "item-note"; side: Side; text: string }
  | { kind: "faint"; side: Side; text: string }
  | { kind: "switch"; side: Side; index: number; text: string }
  | { kind: "end"; winner: Side };
