import { useEffect, useMemo, useRef, useState } from "react";
import { rollAiItem, getItemDef } from "../battle/items";
import type { Combatant, NatureDef, PokemonDef, Side } from "../battle/types";
import {
  buildPokemonDef,
  createCombatant,
  dexSprite,
  GENERATIONS,
  pickAbility,
  randomNature,
  randomTeamIds,
} from "../data/pokemon";
import { useBattle, type TeamMemberView, type Teams } from "../hooks/useBattle";
import { useBattleKeys } from "../hooks/useBattleKeys";
import { HpBar } from "./HpBar";
import { StageTable, StatusBadge, TYPE_COLORS, TypeBadges } from "./badges";

export interface MatchSetup {
  playerTeam: { def: PokemonDef; item: string }[];
  aiTeam: PokemonDef[];
  level: number;
  gen: number;
}

interface BattleScreenProps {
  setup: MatchSetup;
  chart: number[][];
  natures: NatureDef[];
  onExit: () => void;
}

function makeTeams(setup: MatchSetup, natures: NatureDef[]): Teams {
  return {
    player: setup.playerTeam.map((m) =>
      createCombatant(
        "player",
        m.def,
        setup.level,
        randomNature(natures),
        pickAbility(m.def),
        m.item,
      ),
    ),
    ai: setup.aiTeam.map((def) =>
      createCombatant(
        "ai",
        def,
        setup.level,
        randomNature(natures),
        pickAbility(def),
        rollAiItem(),
      ),
    ),
  };
}

function PipHp({ hp, max }: { hp: number; max: number }) {
  return (
    <span className="pip-hp">
      <span className="pip-hp-fill" style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} />
    </span>
  );
}

function TeamStrip({
  side,
  members,
  activeIdx,
  defs,
}: {
  side: Side;
  members: TeamMemberView[];
  activeIdx: number;
  defs: PokemonDef[];
}) {
  return (
    <div className={`team-strip ${side}`}>
      {members.map((m, i) => (
        <div
          key={defs[i]?.id ?? i}
          className={`team-pip${i === activeIdx ? " active" : ""}${m.fainted ? " fainted" : ""}`}
        >
          <img src={dexSprite(defs[i]?.id ?? 0)} alt="" />
          <span className="pip-name">{m.name}</span>
          <PipHp hp={m.hp} max={m.maxHp} />
        </div>
      ))}
    </div>
  );
}

function SpriteZone({
  side,
  sprite,
  backSprite,
  fx,
  tick,
  floaters,
}: {
  side: "player" | "ai";
  sprite: string;
  backSprite: string;
  fx: string;
  tick: number;
  floaters: { id: number; text: string; kind: string }[];
}) {
  const isPlayer = side === "player";
  const useBack = isPlayer && backSprite !== "";
  const src = useBack ? backSprite : sprite;
  const flipped = isPlayer ? !useBack : true;
  return (
    <div className={`sprite-zone ${side}`}>
      {isPlayer && <div className="battle-ball" aria-hidden />}
      <div className="platform" />
      <div className={`sprite-wrap intro-${side}`}>
        <div className={`sprite-flip${flipped ? " flipped" : ""}`}>
          <img
            key={tick}
            className={`sprite ${fx}`}
            src={src}
            alt=""
            draggable={false}
          />
        </div>
      </div>
      {floaters.map((f) => (
        <span key={f.id} className={`floater ${f.kind}`}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

export function BattleScreen({ setup: initialSetup, chart, natures, onExit }: BattleScreenProps) {
  const [setup, setSetup] = useState(initialSetup);
  const [summoning, setSummoning] = useState(false);
  const [combatants, setCombatants] = useState<Teams>(() => makeTeams(initialSetup, natures));
  const { view, chooseMove, chooseSwitch, openSwitch, cancelSwitch, battleSeq } =
    useBattle(combatants, chart);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.log.length]);

  const playerTeam = combatants.player;
  const aiTeam = combatants.ai;
  const playerActive: Combatant = playerTeam[view.activeIdx.player];
  const aiActive: Combatant = aiTeam[view.activeIdx.ai];

  const moveDisabled = (i: number): boolean => {
    if (view.phase !== "choosing") return true;
    if ((view.pp.player[i] ?? 0) <= 0) return true;
    if (view.locked.player !== null && view.locked.player !== i) return true;
    const m = playerActive.moves[i]?.def;
    if (!m) return true;
    if (playerActive.item === "assault_vest" && m.class === "status") return true;
    return false;
  };

  useBattleKeys({
    view,
    chooseMove,
    chooseSwitch,
    openSwitch,
    cancelSwitch,
    moveEnabled: (i) => !moveDisabled(i),
    teamSize: playerTeam.length,
  });

  const allOut = useMemo(
    () => playerActive.moves.every((_, i) => (view.pp.player[i] ?? 0) <= 0),
    [playerActive.moves, view.pp.player],
  );

  const playerItemDef = getItemDef(playerActive.item);
  const aiItemDef = getItemDef(aiActive.item);
  const over = view.phase === "victory" || view.phase === "defeat";

  const newOpponent = async () => {
    if (summoning) return;
    setSummoning(true);
    try {
      const g = GENERATIONS[setup.gen];
      const ids = randomTeamIds(6, g.start, g.end, setup.playerTeam.map((m) => m.def.id));
      const aiTeamDefs = await Promise.all(ids.map(buildPokemonDef));
      const next = { ...setup, aiTeam: aiTeamDefs };
      setSetup(next);
      setCombatants(makeTeams(next, natures));
    } finally {
      setSummoning(false);
    }
  };

  return (
    <div className="battle-screen">
      <button className="exit-btn" onClick={onExit} disabled={view.phase === "animating"}>
        &larr; Exit
      </button>

      <div className="arena">
        <div className="info-card">
          <div className="name-row">
            <strong>{view.names.ai}</strong>
            <span className="lvl">Lv{setup.level}</span>
          </div>
          <div className="card-mid">
            <TypeBadges types={aiActive.def.types} />
            <StatusBadge status={view.status.ai} />
          </div>
          <HpBar current={view.hp.ai} max={view.maxHp.ai} />
          <div className="card-foot">
            <span className="meta">
              {aiItemDef && aiItemDef.name !== "none" ? aiItemDef.displayName : "No item"}
            </span>
            <StageTable stages={view.stages.ai} />
          </div>
        </div>

        <TeamStrip
          side="ai"
          members={view.team.ai}
          activeIdx={view.activeIdx.ai}
          defs={aiTeam.map((c) => c.def)}
        />

        <SpriteZone
          key={`ai-${battleSeq}-${aiActive.def.id}`}
          side="ai"
          sprite={aiActive.def.sprite}
          backSprite={aiActive.def.backSprite}
          fx={view.fx.ai}
          tick={view.ticks.ai}
          floaters={view.floaters.filter((f) => f.side === "ai")}
        />

        <TeamStrip
          side="player"
          members={view.team.player}
          activeIdx={view.activeIdx.player}
          defs={playerTeam.map((c) => c.def)}
        />

        <SpriteZone
          key={`player-${battleSeq}-${playerActive.def.id}`}
          side="player"
          sprite={playerActive.def.sprite}
          backSprite={playerActive.def.backSprite}
          fx={view.fx.player}
          tick={view.ticks.player}
          floaters={view.floaters.filter((f) => f.side === "player")}
        />

        <div className="info-card">
          <div className="name-row">
            <strong>{view.names.player}</strong>
            <span className="lvl">Lv{setup.level}</span>
          </div>
          <div className="card-mid">
            <TypeBadges types={playerActive.def.types} />
            <StatusBadge status={view.status.player} />
          </div>
          <HpBar current={view.hp.player} max={view.maxHp.player} />
          <div className="card-foot">
            <span className="meta">
              {playerItemDef && playerItemDef.name !== "none"
                ? playerItemDef.displayName
                : "No item"}
            </span>
            <StageTable stages={view.stages.player} />
          </div>
        </div>
      </div>

      <div className="battle-bottom">
        <div className="action-panel">
          {view.phase === "switching" ? (
            <div className="switch-picker">
              <h3>
                {view.mustSwitch
                  ? "Send out a replacement"
                  : "Switch to which Pok\u00e9mon? (costs your turn)"}
              </h3>
              <div className="team-pick-grid">
                {playerTeam.map((m, i) => {
                  const disabled = m.hp <= 0 || i === view.activeIdx.player;
                  return (
                    <button
                      key={m.def.id}
                      className="team-pick"
                      disabled={disabled}
                      onClick={() => chooseSwitch(i)}
                    >
                      <img src={dexSprite(m.def.id)} alt="" />
                      <span className="pick-name">{m.def.displayName}</span>
                      <PipHp hp={m.hp} max={m.maxHp} />
                    </button>
                  );
                })}
              </div>
              {!view.mustSwitch && (
                <button className="switch-cancel" onClick={cancelSwitch}>
                  Cancel &mdash; fight instead
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="move-grid">
                {playerActive.moves.map((m, i) => (
                  <button
                    key={m.def.id}
                    className="move-btn"
                    disabled={moveDisabled(i)}
                    onClick={() => chooseMove(i)}
                  >
                    <span className="move-name">
                      <span className="key-hint" aria-hidden="true">
                        {i + 1}
                      </span>
                      {m.def.displayName}
                    </span>
                    <span className="move-meta">
                      <span
                        className="type-badge"
                        style={{ backgroundColor: TYPE_COLORS[m.def.type] }}
                      >
                        {m.def.type}
                      </span>
                      <span>{m.def.class === "status" ? "Status" : m.def.power}</span>
                      <span className="pp">
                        PP {view.pp.player[i] ?? 0}/{m.def.maxPp}
                      </span>
                    </span>
                  </button>
                ))}
                {allOut && view.phase === "choosing" && (
                  <button className="move-btn struggle" onClick={() => chooseMove(0)}>
                    <span className="move-name">Struggle</span>
                    <span className="move-meta">
                      <span>Normal</span>
                      <span>20</span>
                    </span>
                  </button>
                )}
              </div>
              <button
                className="switch-btn"
                onClick={openSwitch}
                disabled={view.phase !== "choosing"}
              >
                <span className="key-hint" aria-hidden="true">
                  S
                </span>
                Switch
              </button>
              <p className="keys-help">
                Keys: 1&ndash;4 moves &middot; S switch &middot; Esc cancel
              </p>
            </>
          )}
        </div>
        <div className="log" ref={logRef}>
          {view.log.map((line, i) => (
            <div key={i} className={line.startsWith("—") ? "log-turn" : "log-line"}>
              {line}
            </div>
          ))}
        </div>
      </div>

      {over && (
        <div className="result-overlay">
          <div className="result-panel">
            <h2 className={view.phase === "victory" ? "win" : "lose"}>
              {view.phase === "victory" ? "Victory!" : "Defeat..."}
            </h2>
            <p>
              {view.phase === "victory"
                ? "Your team defeated the enemy team!"
                : "Your team was defeated."}
            </p>
            <div className="result-buttons">
              <button
                onClick={() => setCombatants(makeTeams(setup, natures))}
                disabled={summoning}
              >
                Rematch
              </button>
              <button onClick={newOpponent} disabled={summoning}>
                {summoning ? "Summoning..." : "New Opponent"}
              </button>
              <button className="ghost" onClick={onExit} disabled={summoning}>
                Change Team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
