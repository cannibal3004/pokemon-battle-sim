export function HpBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const cls = pct > 50 ? "hp-green" : pct > 20 ? "hp-yellow" : "hp-red";
  return (
    <div className="hp-bar">
      <div className={`hp-fill ${cls}`} style={{ width: `${pct}%` }} />
      <span className="hp-text">
        {Math.max(0, Math.ceil(current))}/{max}
      </span>
    </div>
  );
}
