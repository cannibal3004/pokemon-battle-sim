export interface NamedRef {
  name: string;
  url: string;
}

export interface StatEntry {
  base_stat: number;
  stat: NamedRef;
}

export interface MoveEntry {
  move: NamedRef;
  version_group_details: {
    level_learned_at: number;
    move_learn_method: NamedRef;
  }[];
}

export interface PokemonAPI {
  id: number;
  name: string;
  is_default: boolean;
  base_experience: number;
  types: { slot: number; type: NamedRef }[];
  abilities: { ability: NamedRef; is_hidden: boolean }[];
  stats: StatEntry[];
  moves: MoveEntry[];
  sprites: {
    front_default: string | null;
    back_default: string | null;
    official_artwork?: { front_default: string | null };
    versions?: Record<
      string,
      Record<
        string,
        {
          animated?: {
            front_default?: string | null;
            back_default?: string | null;
          };
          front_default?: string | null;
        } | null
      >
    >;
  };
}

export interface MoveStatChange {
  stat: NamedRef;
  change: number;
}

export interface MoveEffectChange {
  stat: NamedRef;
  change: number;
  chance: number | null;
}

export interface MoveMeta {
  min_hits?: number | null;
  max_hits?: number | null;
  ailment: NamedRef;
  ailment_chance: number;
  drain: number;
  recoil?: number;
  flinch_chance: number;
  stat_chance: number;
  category: NamedRef;
}

export interface MoveAPI {
  id: number;
  name: string;
  power: number | null;
  pp: number | null;
  accuracy: number | null;
  priority: number;
  type: NamedRef;
  damage_class: NamedRef;
  target: NamedRef;
  meta: MoveMeta;
  stat_changes: MoveStatChange[];
  stats?: MoveStatChange[];
  effect_changes: MoveEffectChange[];
  effect_chance?: number;
}

export interface TypeAPI {
  name: string;
  damage_relations: {
    no_damage_to: NamedRef[];
    half_damage_to: NamedRef[];
    double_damage_to: NamedRef[];
  };
}

export interface NatureAPI {
  name: string;
  stat_ups: NamedRef | null;
  stat_downs: NamedRef | null;
}

export interface EvolutionChainAPI {
  chain: EvolutionNode;
}

export interface PokemonSpeciesAPI {
  name: string;
  evolves_from: NamedRef | null;
  evolution_chain: NamedRef;
}

export interface EvolutionNode {
  species: NamedRef;
  evolves_to: EvolutionNode[];
}

export interface ListResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
