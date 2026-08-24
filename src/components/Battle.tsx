import { useEffect, useMemo, useRef, useState } from "react";
import { rollAiItem, getItemDef } from "../battle/items";
import type { Combatant, NatureDef, PokemonDef } from "../battle/types";
import { buildPokemonDef, createCombatant, pickAbility, randomNature } from "../data/pokemon";
import { useBattle } from "../hooks/useBattle";
import { HpBar } from "./HpBar";
import { StageTable, StatusBadge, TYPE_COLORS, TypeBadges } from "./badges";

export interface MatchSetup {
  playerDef: PokemonDef;
  aiDef: PokemonDef;
  level: number;
  playerItem: string;
}

interface BattleScreenProps {
  setup: MatchSetup;
  chart: number[][];
  natures: NatureDef[];
  onExit: () => void;
}

function makeCombatants(setup: MatchSetup, natures: NatureDef[]): { player: Combatant; ai: Combatant } {
  return {
    player: createCombatant(
      "player",
      setup.playerDef,
      setup.level,
      randomNature(natures),
      pickAbility(setup.playerDef),
      setup.playerItem,
    ),
    ai: createCombatant(
      "ai",
      setup.aiDef,
      setup.level,
      randomNature(natures),
      pickAbility(setup.aiDef),
      rollAiItem(),
    ),
  };
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

export function BattleScreen({ setup, chart, natures, onExit }: BattleScreenProps) {
  const [aiDef, setAiDef] = useState(setup.aiDef);
  const [summoning, setSummoning] = useState(false);
  const effectiveSetup = useMemo<MatchSetup>(
    () => ({ ...setup, aiDef }),
    [setup, aiDef],
  );
  const [combatants, setCombatants] = useState(() => makeCombatants(setup, natures));
  const { view, chooseMove, battleSeq } = useBattle(
    combatants.player,
    combatants.ai,
    chart,
  );
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.log.length]);

  const { player, ai } = combatants;

  const moveDisabled = (i: number): boolean => {
    if (view.phase !== "choosing") return true;
    if ((view.pp.player[i] ?? 0) <= 0) return true;
    if (view.locked.player !== null && view.locked.player !== i) return true;
    const m = player.moves[i]?.def;
    if (!m) return true;
    if (player.item === "assault_vest" && m.class === "status") return true;
    return false;
  };

  const allOut = useMemo(
    () => player.moves.every((_, i) => (view.pp.player[i] ?? 0) <= 0),
    [player.moves, view.pp.player],
  );

  const playerItemDef = getItemDef(player.item);
  const aiItemDef = getItemDef(ai.item);
  const over = view.phase === "victory" || view.phase === "defeat";

  const newOpponent = async () => {
    if (summoning) return;
    setSummoning(true);
    try {
      let id = 1 + Math.floor(Math.random() * 251);
      if (id === setup.playerDef.id) id = (id % 251) + 2;
      const def = await buildPokemonDef(id);
      setAiDef(def);
      setCombatants(makeCombatants({ ...setup, aiDef: def }, natures));
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
            <TypeBadges types={aiDef.types} />
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

        <SpriteZone
          key={`ai-${battleSeq}`}
          side="ai"
          sprite={aiDef.sprite}
          backSprite={aiDef.backSprite}
          fx={view.fx.ai}
          tick={view.ticks.ai}
          floaters={view.floaters.filter((f) => f.side === "ai")}
        />

        <SpriteZone
          key={`player-${battleSeq}`}
          side="player"
          sprite={setup.playerDef.sprite}
          backSprite={setup.playerDef.backSprite}
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
            <TypeBadges types={setup.playerDef.types} />
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
        <div className="move-grid">
          {player.moves.map((m, i) => (
            <button
              key={m.def.id}
              className="move-btn"
              disabled={moveDisabled(i)}
              onClick={() => chooseMove(i)}
            >
              <span className="move-name">{m.def.displayName}</span>
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
                ? `${view.names.player} won the battle!`
                : `${view.names.ai} won the battle.`}
            </p>
            <div className="result-buttons">
              <button
                onClick={() => setCombatants(makeCombatants(effectiveSetup, natures))}
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
