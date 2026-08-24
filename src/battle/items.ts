export interface ItemDef {
  name: string;
  displayName: string;
  sprite: string;
  description: string;
}

const sprite = (n: string) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${n}.png`;

export const ITEM_DEFS: ItemDef[] = [
  { name: "none", displayName: "None", sprite: "", description: "No held item." },
  { name: "choice_band", displayName: "Choice Band", sprite: sprite("choice-band"), description: "Attack x1.5, but the Pokemon is locked into its first move." },
  { name: "choice_specs", displayName: "Choice Specs", sprite: sprite("choice-specs"), description: "Sp. Atk x1.5, but the Pokemon is locked into its first move." },
  { name: "life_orb", displayName: "Life Orb", sprite: sprite("life-orb"), description: "Damage dealt x1.3, but loses 10% max HP after each attack." },
  { name: "focus_sash", displayName: "Focus Sash", sprite: sprite("focus-sash"), description: "Survives one hit that would normally faint it at 1 HP." },
  { name: "leftovers", displayName: "Leftovers", sprite: sprite("leftovers"), description: "Recovers 1/16 max HP at the end of each turn." },
  { name: "eviolite", displayName: "Eviolite", sprite: sprite("eviolite"), description: "Defense and Sp. Def x1.5 (only if not fully evolved)." },
  { name: "assault_vest", displayName: "Assault Vest", sprite: sprite("assault-vest"), description: "Sp. Def x1.5, but cannot use status moves." },
];

export function getItemDef(name: string): ItemDef | undefined {
  return ITEM_DEFS.find((i) => i.name === name);
}

export const AI_ITEM_POOL = ITEM_DEFS.filter(
  (i) => i.name !== "none" && i.name !== "eviolite",
);

export function rollAiItem(): string {
  if (Math.random() < 0.45) return "none";
  return AI_ITEM_POOL[Math.floor(Math.random() * AI_ITEM_POOL.length)].name;
}
