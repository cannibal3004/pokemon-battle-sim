import { useEffect, useMemo, useState } from "react";
import { getPokemonList } from "../api/pokeapi";
import { ITEM_DEFS, getItemDef } from "../battle/items";
import type { PokemonDef, StatId } from "../battle/types";
import { buildPokemonDef } from "../data/pokemon";
import type { MatchSetup } from "./Battle";
import { TypeBadges } from "./badges";

const STAT_ROWS: { stat: StatId; label: string }[] = [
  { stat: "hp", label: "HP" },
  { stat: "attack", label: "Atk" },
  { stat: "defense", label: "Def" },
  { stat: "special_attack", label: "SpA" },
  { stat: "special_defense", label: "SpD" },
  { stat: "speed", label: "Spe" },
];

function dexSprite(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

interface DexEntry {
  id: number;
  name: string;
}

function dexIdFromUrl(url: string): number {
  const last = url.split("/").filter(Boolean).pop() ?? "";
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}

function randomAiId(exclude: number | null): number {
  let id = 1 + Math.floor(Math.random() * 251);
  if (id === exclude) id = ((id % 251) + 2) as number;
  return id;
}

interface LobbyProps {
  onStart: (setup: MatchSetup) => void;
}

export function Lobby({ onStart }: LobbyProps) {
  const [list, setList] = useState<DexEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDef, setSelectedDef] = useState<PokemonDef | null>(null);
  const [level, setLevel] = useState(50);
  const [item, setItem] = useState("none");
  const [aiId, setAiId] = useState(() => randomAiId(null));
  const [aiDef, setAiDef] = useState<PokemonDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPokemonList(151, 0)
      .then((r) =>
        setList(
          r.results.map((p) => ({ id: dexIdFromUrl(p.url), name: p.name })),
        ),
      )
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setSelectedDef(null);
    buildPokemonDef(selectedId)
      .then((d) => {
        if (!cancelled) setSelectedDef(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    setAiDef(null);
    buildPokemonDef(aiId)
      .then((d) => {
        if (!cancelled) setAiDef(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [aiId]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return list;
    return list.filter(
      (p) => p.name.includes(q) || p.id === Number(q) || String(p.id) === q,
    );
  }, [list, query]);

  const itemDef = getItemDef(item);

  return (
    <div className="lobby">
      <header className="lobby-header">
        <h1>Pok&eacute;mon Battle Arena</h1>
        <p>Pick your fighter, choose a loadout, and battle a random challenger.</p>
      </header>

      {error && <div className="fatal">Failed to load Pok&eacute;API data: {error}</div>}

      <div className="lobby-grid">
        <section className="panel picker">
          <h2>Choose your Pok&eacute;mon</h2>
          <input
            className="search"
            type="text"
            placeholder="Search by name or # (Kanto dex)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="dex-grid">
            {!list && <div className="loading">Loading Pok&eacute;dex...</div>}
            {filtered.map((p) => (
              <button
                key={p.id}
                className={`dex-card ${selectedId === p.id ? "selected" : ""}`}
                onClick={() => setSelectedId(p.id)}
              >
                <img src={dexSprite(p.id)} alt={p.name} loading="lazy" />
                <span className="dex-name">
                  <em>#{String(p.id).padStart(3, "0")}</em> {p.name}
                </span>
              </button>
            ))}
            {list && filtered.length === 0 && (
              <div className="loading">No Pok&eacute;mon found.</div>
            )}
          </div>
        </section>

        <section className="panel setup">
          <h2>Battle setup</h2>

          <div className="setup-col">
            <h3 className="side-label you">Your fighter</h3>
            {selectedDef ? (
              <div className="fighter-card">
                <img className="artwork" src={selectedDef.artwork} alt={selectedDef.name} />
                <div className="fighter-info">
                  <div className="name-row">
                    <strong>{selectedDef.displayName}</strong>
                    <span className="lvl">Lv{level}</span>
                  </div>
                  <TypeBadges types={selectedDef.types} />
                  <div className="base-stats">
                    {STAT_ROWS.map((r) => (
                      <div key={r.stat} className="stat-row">
                        <span className="stat-label">{r.label}</span>
                        <span className="stat-track">
                          <span
                            className="stat-fill"
                            style={{
                              width: `${Math.min(100, (selectedDef.baseStats[r.stat] / 180) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="stat-num">{selectedDef.baseStats[r.stat]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="moves-preview">
                    {selectedDef.moves.map((m) => (
                      <span key={m.id} className="move-chip">
                        {m.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="placeholder">
                {selectedId !== null ? "Loading moveset..." : "Select a Pok&eacute;mon from the dex"}
              </div>
            )}

            <label className="field">
              <span>Level</span>
              <input
                type="range"
                min={20}
                max={100}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
              <em>Lv {level}</em>
            </label>

            <label className="field">
              <span>Held item</span>
              <select value={item} onChange={(e) => setItem(e.target.value)}>
                {ITEM_DEFS.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.displayName}
                  </option>
                ))}
              </select>
            </label>
            {itemDef && <p className="item-desc">{itemDef.description}</p>}
          </div>

          <div className="vs-divider">VS</div>

          <div className="setup-col">
            <h3 className="side-label foe">Challenger</h3>
            {aiDef ? (
              <div className="fighter-card">
                <img className="artwork" src={aiDef.artwork} alt={aiDef.name} />
                <div className="fighter-info">
                  <div className="name-row">
                    <strong>{aiDef.displayName}</strong>
                    <span className="lvl">Lv{level}</span>
                  </div>
                  <TypeBadges types={aiDef.types} />
                  <div className="mystery">
                    Nature, ability &amp; item revealed in battle.
                  </div>
                </div>
              </div>
            ) : (
              <div className="placeholder">Summoning challenger...</div>
            )}
            <button
              className="reroll"
              onClick={() => setAiId(randomAiId(selectedId))}
              disabled={aiDef === null}
            >
              Reroll challenger
            </button>
          </div>

          <button
            className="start-btn"
            disabled={!selectedDef || !aiDef}
            onClick={() =>
              selectedDef && aiDef && onStart({ playerDef: selectedDef, aiDef, level, playerItem: item })
            }
          >
            Start battle
          </button>
        </section>
      </div>
    </div>
  );
}
