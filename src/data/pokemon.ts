import { chainIdFromUrl, getEvolutionChain, getMove, getNatures, getPokemon, getPokemonSpecies } from "../api/pokeapi";
import type { EvolutionNode, MoveAPI, PokemonAPI } from "../api/types";
import type {
  Combatant,
  MoveDef,
  NatureDef,
  PokemonDef,
  StatId,
  StatusId,
  TypeName,
} from "../battle/types";
import { TYPE_NAMES } from "../battle/types";
import { computeStats, emptyStages, rollNature } from "../battle/stats";

const STAT_KEY: Record<string, StatId> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "special_attack",
  "special-defense": "special_defense",
  speed: "speed",
};

const STAGE_STAT_KEY: Record<string, Exclude<StatId, "hp">> = {
  attack: "attack",
  defense: "defense",
  "special-attack": "special_attack",
  "special-defense": "special_defense",
  speed: "speed",
};

const AILMENT_KEY: Record<string, StatusId> = {
  burn: "burn",
  paralysis: "paralysis",
  poison: "poison",
};

const SELF_TARGETS = [
  "user",
  "ally",
  "users-field",
  "user-or-ally",
  "all-allies",
  "specific-move",
];

const RECOIL_PCT: Record<string, number> = {
  "double-edge": 33,
  "take-down": 25,
  "flare-blitz": 50,
  "head-smash": 50,
  "wood-hammer": 33,
  "head-charge": 33,
  "strain": 25,
  "iron-head": 30,
};

// Moves whose effect depends on mechanics this simulator does not model.
const BLOCKED_MOVES = new Set([
  "struggle",
  "last-resort",
  "fling",
  "belch",
  "covet",
  "copycat",
  "metronome",
  "mimic",
  "assist",
  "sleep-talk",
  "rage",
  "shell-trap",
  "guard-split",
  "power-split",
  "magic-coat",
  "revenge",
  "counter",
  "mirror-coat",
  "techno-blade",
  "nature-power",
  "focus-punch",
  "lovely-kiss",
]);

export function displayName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pickFrontSprite(api: PokemonAPI): string {
  const v = api.sprites.versions;
  return (
    v?.["generation-v"]?.["black-white"]?.animated?.front_default ||
    v?.["generation-iii"]?.["heartgold-soulsilver"]?.front_default ||
    api.sprites.front_default ||
    api.sprites.official_artwork?.front_default ||
    ""
  );
}

function pickBackSprite(api: PokemonAPI): string {
  const v = api.sprites.versions;
  return (
    v?.["generation-v"]?.["black-white"]?.animated?.back_default ||
    api.sprites.back_default ||
    ""
  );
}

function pickCry(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
}

function pickArtwork(api: PokemonAPI): string {
  return api.sprites.official_artwork?.front_default || api.sprites.front_default || "";
}

function toMoveDef(move: MoveAPI): MoveDef | null {
  if (BLOCKED_MOVES.has(move.name)) return null;

  const classRaw = move.damage_class?.name ?? "status";
  const classType = classRaw === "physical" || classRaw === "special" ? classRaw : "status";
  const type = (TYPE_NAMES as readonly string[]).includes(move.type?.name)
    ? (move.type.name as TypeName)
    : "normal";

  const meta = move.meta;

  // Ailment: 0 chance means the ailment is the move's primary effect (100%)
  let ailment: StatusId = "none";
  let ailmentChance = 0;
  const rawAilment = meta?.ailment?.name ?? "none";
  const mapped = AILMENT_KEY[rawAilment];
  if (mapped) {
    ailment = mapped;
    ailmentChance = (meta?.ailment_chance ?? 0) > 0 ? meta.ailment_chance : 100;
  } else if ((meta?.flinch_chance ?? 0) > 0) {
    ailment = "flinch";
    ailmentChance = meta.flinch_chance;
  }

  const targetIsSelf = SELF_TARGETS.includes(move.target?.name ?? "");
  const changeChance = (meta?.stat_chance ?? 0) > 0 ? meta.stat_chance : 100;

  let selfChanges: MoveDef["selfChanges"] = [];
  let targetChanges: MoveDef["targetChanges"] = [];
  if ((move.stat_changes?.length ?? 0) > 0) {
    const list = move.stat_changes
      .filter((s) => STAGE_STAT_KEY[s.stat.name])
      .map((s) => ({ stat: STAGE_STAT_KEY[s.stat.name], change: s.change, chance: changeChance }));
    if (targetIsSelf) selfChanges = list;
    else targetChanges = list;
  } else if ((move.effect_changes?.length ?? 0) > 0) {
    targetChanges = move.effect_changes
      .filter((s) => STAGE_STAT_KEY[s.stat.name])
      .map((s) => ({ stat: STAGE_STAT_KEY[s.stat.name], change: s.change, chance: s.chance ?? changeChance }));
  } else if (move.stats && move.stats.length > 0) {
    selfChanges = move.stats
      .filter((s) => STAGE_STAT_KEY[s.stat.name])
      .map((s) => ({ stat: STAGE_STAT_KEY[s.stat.name], change: s.change, chance: 100 }));
  }

  const hasChanges = selfChanges.length > 0 || targetChanges.length > 0;
  const hasAilment = ailment !== "none";
  const hasPower = (move.power ?? 0) > 0;
  if (!hasPower && !hasAilment && !hasChanges) return null;

  return {
    id: move.id,
    name: move.name,
    displayName: displayName(move.name),
    type,
    class: hasPower ? classType : "status",
    power: move.power ?? 0,
    accuracy: move.accuracy ?? 100,
    pp: move.pp ?? 10,
    maxPp: move.pp ?? 10,
    priority: move.priority ?? 0,
    ailment,
    ailmentChance,
    selfChanges,
    targetChanges,
    recoilPct: Math.max(
      Math.abs(meta?.recoil ?? 0),
      (meta?.drain ?? 0) < 0 ? Math.abs(meta.drain) : 0,
      RECOIL_PCT[move.name] ?? 0,
    ),
    drainPct: Math.max(0, meta?.drain ?? 0),
    targetsSelf: targetIsSelf,
  };
}

export async function buildMoveset(api: PokemonAPI): Promise<MoveDef[]> {
  const candidates = new Map<string, string>();
  for (const entry of api.moves) {
    for (const detail of entry.version_group_details) {
      if (detail.move_learn_method.name !== "level-up") continue;
      if (!candidates.has(entry.move.name)) candidates.set(entry.move.name, entry.move.name);
    }
  }

  const moves = await Promise.all(
    [...candidates.keys()].map(async (name) => {
      try {
        return toMoveDef(await getMove(name));
      } catch {
        return null;
      }
    }),
  );

  const valid = moves.filter((m): m is MoveDef => m !== null);
  const damaging = valid.filter((m) => m.class !== "status").sort((a, b) => b.power - a.power);
  const status = valid.filter((m) => m.class === "status");

  const primaryType = api.types[0]?.type.name;
  const stabFirst = [...damaging].sort((a, b) => {
    const aStab = a.type === primaryType ? 1 : 0;
    const bStab = b.type === primaryType ? 1 : 0;
    return bStab - aStab || b.power - a.power;
  });

  const chosen: MoveDef[] = [];
  const seen = new Set<number>();
  const push = (m: MoveDef) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    chosen.push(m);
  };

  for (const m of stabFirst) {
    if (chosen.length >= 3) break;
    push(m);
  }
  for (const m of damaging) {
    if (chosen.length >= 3) break;
    push(m);
  }

  const statusScore = (m: MoveDef) =>
    (m.ailment !== "none" ? 100 : 0) +
    (m.ailment === "burn" || m.ailment === "paralysis" || m.ailment === "poison" ? 10 : 0) +
    (m.selfChanges.some((c) => c.change > 0) ? 5 : 0) +
    (m.targetChanges.some((c) => c.change < 0) ? 5 : 0);
  for (const m of [...status].sort((a, b) => statusScore(b) - statusScore(a))) {
    if (chosen.length >= 4) break;
    push(m);
  }
  for (const m of damaging) {
    if (chosen.length >= 4) break;
    push(m);
  }

  return chosen.slice(0, 4);
}

function findNode(node: EvolutionNode, name: string): EvolutionNode | null {
  if (node.species.name === name) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

async function isFullyEvolved(api: PokemonAPI): Promise<boolean> {
  try {
    const species = await getPokemonSpecies(api.name);
    const chain = await getEvolutionChain(chainIdFromUrl(species.evolution_chain.url));
    const node = findNode(chain.chain, api.name);
    return node ? node.evolves_to.length === 0 : true;
  } catch {
    return true;
  }
}

export async function buildPokemonDef(idOrName: string | number): Promise<PokemonDef> {
  const api = await getPokemon(idOrName);
  const baseStats = {
    hp: 0,
    attack: 0,
    defense: 0,
    special_attack: 0,
    special_defense: 0,
    speed: 0,
  } as Record<StatId, number>;
  for (const s of api.stats) {
    const key = STAT_KEY[s.stat.name];
    if (key) baseStats[key] = s.base_stat;
  }

  const [moves, fullyEvolved] = await Promise.all([
    buildMoveset(api),
    isFullyEvolved(api),
  ]);

  return {
    id: api.id,
    name: api.name,
    displayName: displayName(api.name),
    types: api.types.map((t) => t.type.name as TypeName),
    baseStats,
    sprite: pickFrontSprite(api),
    backSprite: pickBackSprite(api),
    artwork: pickArtwork(api),
    cry: pickCry(api.id),
    abilities: api.abilities.map((a) => a.ability.name),
    fullyEvolved,
    moves,
  };
}

export function pickAbility(def: PokemonDef): string {
  return def.abilities[Math.floor(Math.random() * def.abilities.length)] ?? "";
}

export function createCombatant(
  side: "player" | "ai",
  def: PokemonDef,
  level: number,
  nature: NatureDef,
  ability: string,
  item: string,
): Combatant {
  const stats = computeStats(def.baseStats, level, nature);
  return {
    def,
    side,
    level,
    nature: nature.name,
    stats,
    maxHp: stats.hp,
    hp: stats.hp,
    status: "none",
    stages: emptyStages(),
    moves: def.moves.map((m) => ({ def: m, pp: m.maxPp })),
    ability,
    item,
    lockedMove: null,
    itemUsed: false,
    sturdyUsed: false,
    multiscaleUsed: false,
    flinched: false,
  };
}

export async function loadNatures(): Promise<NatureDef[]> {
  const res = await getNatures();
  const toStat = (n: string | null): StatId | null => (n ? STAT_KEY[n] ?? null : null);
  return res.results.map((r) => ({
    name: displayName(r.name),
    up: toStat(r.stat_ups?.name ?? null),
    down: toStat(r.stat_downs?.name ?? null),
  }));
}

export function randomNature(natures: NatureDef[]): NatureDef {
  return rollNature(natures);
}
