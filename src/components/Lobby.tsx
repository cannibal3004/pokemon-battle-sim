import { useEffect, useMemo, useRef, useState } from "react";
import { getPokemonList } from "../api/pokeapi";
import { ITEM_DEFS, getItemDef } from "../battle/items";
import type { PokemonDef, StatId } from "../battle/types";
import { buildPokemonDef, dexSprite, GENERATIONS, randomTeamIds } from "../data/pokemon";
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

interface DexEntry {
  id: number;
  name: string;
}

function dexIdFromUrl(url: string): number {
  const last = url.split("/").filter(Boolean).pop() ?? "";
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}

interface TeamSlot {
  def: PokemonDef;
  item: string;
}

interface LobbyProps {
  onStart: (setup: MatchSetup) => void;
}

export function Lobby({ onStart }: LobbyProps) {
  const [list, setList] = useState<DexEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDef, setSelectedDef] = useState<PokemonDef | null>(null);
  const [team, setTeam] = useState<TeamSlot[]>([]);
  const [level, setLevel] = useState(50);
  const [gen, setGen] = useState(0);
  const [aiIds, setAiIds] = useState<number[] | null>(null);
  const [aiTeam, setAiTeam] = useState<PokemonDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const teamIdsRef = useRef<number[]>([]);

  useEffect(() => {
    teamIdsRef.current = team.map((s) => s.def.id);
  }, [team]);

  // Load the dex slice for the selected generation.
  useEffect(() => {
    const g = GENERATIONS[gen];
    let cancelled = false;
    setList(null);
    getPokemonList(g.end - g.start + 1, g.start - 1)
      .then((r) => {
        if (!cancelled)
          setList(r.results.map((p) => ({ id: dexIdFromUrl(p.url), name: p.name })));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [gen]);

  // Roll a challenger team from the same generation (and on mount).
  useEffect(() => {
    const g = GENERATIONS[gen];
    setAiIds(randomTeamIds(6, g.start, g.end, teamIdsRef.current));
  }, [gen]);

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
    if (aiIds === null) return;
    let cancelled = false;
    setAiTeam(null);
    Promise.all(aiIds.map((id) => buildPokemonDef(id)))
      .then((defs) => {
        if (!cancelled) setAiTeam(defs);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [aiIds]);

  // The challenger team is rolled when the generation changes, so a species the
  // player picks afterwards can still collide with it. Repair any collision by
  // swapping the offending challenger slot for a species neither side holds.
  const repairingRef = useRef(false);
  useEffect(() => {
    if (!aiTeam || team.length === 0 || repairingRef.current) return;
    const playerIds = new Set(team.map((s) => s.def.id));
    const clash = aiTeam.findIndex((d) => playerIds.has(d.id));
    if (clash === -1) return;

    repairingRef.current = true;
    const g = GENERATIONS[gen];
    const exclude = [...playerIds, ...aiTeam.map((d) => d.id)];
    const candidates = randomTeamIds(6, g.start, g.end, exclude);

    buildPokemonDef(candidates[0])
      .then((d) => {
        setAiTeam((cur) => {
          if (!cur) return cur;
          const next = [...cur];
          next[clash] = d;
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        repairingRef.current = false;
      });
  }, [team, aiTeam, gen]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return list;
    return list.filter(
      (p) => p.name.includes(q) || p.id === Number(q) || String(p.id) === q,
    );
  }, [list, query]);

  const teamIds = team.map((s) => s.def.id);

  const addToTeam = (def: PokemonDef) => {
    setSelectedId(def.id);
    setTeam((t) =>
      t.length >= 6 || t.some((s) => s.def.id === def.id) ? t : [...t, { def, item: "none" }],
    );
  };

  const removeFromTeam = (i: number) =>
    setTeam((t) => t.filter((_, j) => j !== i));

  const setSlotItem = (i: number, item: string) =>
    setTeam((t) => t.map((s, j) => (j === i ? { ...s, item } : s)));

  const ready = team.length === 6 && aiTeam !== null;
  const lastItemDef =
    team.length > 0 ? getItemDef(team[team.length - 1].item) : undefined;

  return (
    <div className="lobby">
      <header className="lobby-header">
        <h1>Pok&eacute;mon Battle Arena</h1>
        <p>
          Build a team of six, load each one out, and battle a full enemy squad.
        </p>
      </header>

      {error && <div className="fatal">Failed to load Pok&eacute;API data: {error}</div>}

      <div className="lobby-grid">
        <section className="panel picker">
          <h2>Choose your Pok&eacute;mon</h2>
          <div className="field gen-field">
            <span>Generation</span>
            <select value={gen} onChange={(e) => setGen(Number(e.target.value))}>
              {GENERATIONS.map((g, i) => (
                <option key={g.id} value={i}>
                  {g.name} &middot; {g.region}
                </option>
              ))}
            </select>
          </div>
          <input
            className="search"
            type="text"
            placeholder="Search by name or #"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="dex-grid">
            {!list && <div className="loading">Loading Pok&eacute;dex...</div>}
            {filtered.map((p) => (
              <button
                key={p.id}
                className={`dex-card ${selectedId === p.id ? "selected" : ""}${
                  teamIds.includes(p.id) ? " in-team" : ""
                }`}
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
            <h3 className="side-label you">
              Your team <span className="team-count">{team.length}/6</span>
              <span className="team-hint">first slot leads</span>
            </h3>

            <div className="team-roster">
              {Array.from({ length: 6 }).map((_, i) => {
                const s = team[i];
                return (
                  <div key={i} className={`team-slot${s ? " filled" : " empty"}`}>
                    {s ? (
                      <>
                        <button
                          className="slot-remove"
                          title="Remove from team"
                          onClick={() => removeFromTeam(i)}
                        >
                          &times;
                        </button>
                        <img src={dexSprite(s.def.id)} alt="" />
                        <span className="slot-name">{s.def.displayName}</span>
                        <TypeBadges types={s.def.types} />
                        <select
                          className="slot-item"
                          value={s.item}
                          onChange={(e) => setSlotItem(i, e.target.value)}
                          title="Held item"
                        >
                          {ITEM_DEFS.map((it) => (
                            <option key={it.name} value={it.name}>
                              {it.displayName}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="slot-empty">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedDef ? (
              <div className="fighter-card">
                <img className="artwork" src={selectedDef.artwork} alt={selectedDef.name} />
                <div className="fighter-info">
                  <div className="name-row">
                    <strong>{selectedDef.displayName}</strong>
                    <span className="lvl">Lv{level}</span>
                  </div>
                  <TypeBadges types={selectedDef.types} />
                  {teamIds.includes(selectedDef.id) ? (
                    <span className="on-team-note">Already on your team</span>
                  ) : (
                    <button
                      className="add-btn"
                      disabled={team.length >= 6}
                      onClick={() => addToTeam(selectedDef)}
                    >
                      {team.length >= 6 ? "Team is full" : "Add to team"}
                    </button>
                  )}
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
                {selectedId !== null
                  ? "Loading moveset..."
                  : "Click Pok\u00e9mon in the dex to add them to your team"}
              </div>
            )}

            <label className="field">
              <span>Team level</span>
              <input
                type="range"
                min={20}
                max={100}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
              <em>Lv {level}</em>
            </label>
          </div>

          <div className="vs-divider">VS</div>

          <div className="setup-col">
            <h3 className="side-label foe">Challenger's team</h3>
            {aiTeam ? (
              <div className="ai-team-grid">
                {aiTeam.map((d) => (
                  <div key={d.id} className="ai-card">
                    <img src={d.artwork} alt="" />
                    <span className="ai-name">{d.displayName}</span>
                    <TypeBadges types={d.types} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="placeholder">Summoning challenger team...</div>
            )}
            <button
              className="reroll"
              onClick={() => {
                const g = GENERATIONS[gen];
                setAiIds(randomTeamIds(6, g.start, g.end, teamIds));
              }}
              disabled={aiTeam === null}
            >
              Reroll challenger team
            </button>
          </div>

          <button
            className="start-btn"
            disabled={!ready}
            onClick={() =>
              team.length === 6 &&
              aiTeam &&
              onStart({ playerTeam: team, aiTeam, level, gen })
            }
          >
            {team.length < 6 ? `Pick ${6 - team.length} more to start` : "Start battle"}
          </button>
          {lastItemDef && lastItemDef.name !== "none" && (
            <p className="item-desc">Last picked item: {lastItemDef.description}</p>
          )}
        </section>
      </div>
    </div>
  );
}
