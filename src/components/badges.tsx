import type { StatStage, StatusId, TypeName } from "../battle/types";

export const TYPE_COLORS: Record<TypeName, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};

export function TypeBadge({ type }: { type: TypeName }) {
  return (
    <span
      className="type-badge"
      style={{ backgroundColor: TYPE_COLORS[type] }}
    >
      {type}
    </span>
  );
}

export function TypeBadges({ types }: { types: TypeName[] }) {
  return (
    <span className="badges-row">
      {types.map((t) => (
        <TypeBadge key={t} type={t} />
      ))}
    </span>
  );
}

const STATUS_META: Record<Exclude<StatusId, "none">, { code: string; color: string }> = {
  burn: { code: "BRN", color: "#f08a3c" },
  paralysis: { code: "PAR", color: "#f7d02c" },
  poison: { code: "PSN", color: "#a33ea1" },
  sleep: { code: "SLP", color: "#8b8fa8" },
  freeze: { code: "FRZ", color: "#96d9d6" },
  flinch: { code: "FLN", color: "#8ab4d8" },
};

export function StatusBadge({ status }: { status: StatusId }) {
  if (status === "none") return null;
  const meta = STATUS_META[status];
  return (
    <span
      className="status-badge"
      style={{ backgroundColor: meta.color }}
      title={status}
    >
      {meta.code}
    </span>
  );
}

const STAGE_ROWS: { stat: StatStage; label: string }[] = [
  { stat: "attack", label: "ATK" },
  { stat: "defense", label: "DEF" },
  { stat: "special_attack", label: "SP.A" },
  { stat: "special_defense", label: "SP.D" },
  { stat: "speed", label: "SPE" },
];

export function StageTable({ stages }: { stages: Record<StatStage, number> }) {
  const any = STAGE_ROWS.some((r) => stages[r.stat] !== 0);
  if (!any) return null;
  return (
    <div className="stage-table">
      {STAGE_ROWS.map((r) => {
        const s = stages[r.stat];
        if (s === 0) return null;
        return (
          <span key={r.stat} className={s > 0 ? "stage-up" : "stage-down"}>
            {r.label} {s > 0 ? `+${s}` : s}
          </span>
        );
      })}
    </div>
  );
}
