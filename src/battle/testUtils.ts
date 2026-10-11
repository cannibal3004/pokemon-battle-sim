import { Battle } from "./engine";
import { emptyStages } from "./stats";
import { TYPE_NAMES } from "./types";
import type {
  Combatant,
  StatId,
  MoveDef,
  PokemonDef,
  Side,
  StatStage,
  StatStageChange,
  StatusId,
  TypeName,
} from "./types";

/** 18x18 chart of neutral matchups. */
export function neutralChart(): number[][] {
  return TYPE_NAMES.map(() => TYPE_NAMES.map(() => 1));
}

/** Neutral chart with specific attacker->defender overrides applied. */
export function chartWith(entries: [TypeName, TypeName, number][]): number[][] {
  const chart = neutralChart();
  for (const [atk, def, mult] of entries) {
    chart[TYPE_NAMES.indexOf(atk)][TYPE_NAMES.indexOf(def)] = mult;
  }
  return chart;
}

export function move(over: Partial<MoveDef> & { name: string }): MoveDef {
  return {
    id: Math.floor(Math.random() * 100000) + 1,
    displayName: over.name,
    type: "normal",
    class: "physical",
    power: 40,
    accuracy: 100,
    pp: 32,
    maxPp: 32,
    priority: 0,
    ailment: "none",
    ailmentChance: 0,
    selfChanges: [] as StatStageChange[],
    targetChanges: [] as StatStageChange[],
    recoilPct: 0,
    drainPct: 0,
    targetsSelf: false,
    ...over,
  };
}

export function pokemon(over: Partial<PokemonDef> & { name: string }): PokemonDef {
  return {
    id: 1,
    displayName: over.name,
    types: ["normal"],
    baseStats: {
      hp: 100,
      attack: 100,
      defense: 100,
      special_attack: 100,
      special_defense: 100,
      speed: 100,
    },
    sprite: "",
    backSprite: "",
    artwork: "",
    cry: "",
    abilities: [],
    fullyEvolved: true,
    moves: [],
    ...over,
  };
}

type CombatantOverrides = Partial<Omit<Combatant, "moves" | "stats">> & {
  name: string;
  side: Side;
  moves?: MoveDef[];
  stats?: Partial<Record<StatId, number>>;
};

export function combatant(over: CombatantOverrides): Combatant {
  const { name, side, moves: rawMoves, stats: statOver, hp, def: defOver, ...rest } = over;

  const stats = {
    hp: 200,
    attack: 100,
    defense: 100,
    special_attack: 100,
    special_defense: 100,
    speed: 100,
    ...(over.stats ?? {}),
  };

  return {
    def: pokemon({ name, ...(defOver ?? {}) }),
    side,
    level: 50,
    nature: "Serious",
    ability: "",
    item: "none",
    status: "none" as StatusId,
    lockedMove: null,
    itemUsed: false,
    sturdyUsed: false,
    multiscaleUsed: false,
    flinched: false,
    sleepTurns: 0,
    ...rest,
    stats,
    maxHp: stats.hp,
    hp: hp ?? stats.hp,
    stages: (rest.stages ?? emptyStages()) as Record<StatStage, number>,
    moves: (rawMoves ?? []).map((m) => ({ def: m, pp: m.pp })),
  };
}

export function makeBattle(
  player: Combatant[],
  ai: Combatant[],
  chart = neutralChart(),
): Battle {
  return new Battle({ player, ai }, chart);
}

/** Run one turn where the player uses move index `pIdx` and the AI uses `aIdx`. */
export function turn(b: Battle, pIdx: number, aIdx: number) {
  return b.runTurn(pIdx, aIdx);
}

/** Deterministic Math.random for the duration of `fn`. */
export function withRandom<T>(values: number[] | number, fn: () => T): T {
  const orig = Math.random;
  const list = Array.isArray(values) ? values : [values];
  let i = 0;
  Math.random = () => {
    const v = list[Math.min(i, list.length - 1)];
    i++;
    return v;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Collect the text of every emitted event of a given kind. */
export function eventTexts(
  events: { kind: string; text?: string }[],
  kind: string,
): string[] {
  return events.filter((e) => e.kind === kind).map((e) => e.text ?? "");
}
