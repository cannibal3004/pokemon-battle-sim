import { getType } from "../api/pokeapi";
import { TYPE_NAMES, type TypeName } from "../battle/types";

let chartPromise: Promise<number[][]> | null = null;

export function getTypeChart(): Promise<number[][]> {
  if (!chartPromise) {
    chartPromise = (async () => {
      const types = await Promise.all(TYPE_NAMES.map((n) => getType(n)));
      const byName = new Map(types.map((t) => [t.name, t]));
      return TYPE_NAMES.map((atk) =>
        TYPE_NAMES.map((def) => {
          const atkType = byName.get(atk);
          if (!atkType) return 1;
          let mult = 1;
          if (atkType.damage_relations.double_damage_to.some((t) => t.name === def)) mult *= 2;
          if (atkType.damage_relations.half_damage_to.some((t) => t.name === def)) mult *= 0.5;
          if (atkType.damage_relations.no_damage_to.some((t) => t.name === def)) mult *= 0;
          return mult;
        }),
      );
    })();
  }
  return chartPromise;
}

export function typeIndex(name: TypeName): number {
  return TYPE_NAMES.indexOf(name);
}

export function effectiveness(chart: number[][], atkType: TypeName, defTypes: TypeName[]): number {
  let mult = 1;
  for (const def of defTypes) {
    mult *= chart[typeIndex(atkType)][typeIndex(def)];
  }
  return mult;
}
