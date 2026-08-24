import { useCallback, useEffect, useRef, useState } from "react";
import { playCry } from "../audio";
import { chooseAiMove } from "../battle/ai";
import { Battle } from "../battle/engine";
import type {
  BattleEvent,
  Combatant,
  Side,
  StatStage,
  StatusId,
} from "../battle/types";

export type Phase = "intro" | "choosing" | "animating" | "victory" | "defeat";
export type FxKind = "none" | "attack" | "hit" | "faint";

export interface Floater {
  id: number;
  side: Side;
  text: string;
  kind: "damage" | "heal" | "crit";
  createdAt: number;
}

export interface BattleView {
  phase: Phase;
  turn: number;
  hp: Record<Side, number>;
  maxHp: Record<Side, number>;
  status: Record<Side, StatusId>;
  stages: Record<Side, Record<StatStage, number>>;
  pp: Record<Side, number[]>;
  locked: Record<Side, number | null>;
  fx: Record<Side, FxKind>;
  ticks: Record<Side, number>;
  floaters: Floater[];
  log: string[];
  names: Record<Side, string>;
}

function initialView(player: Combatant, ai: Combatant): BattleView {
  return {
    phase: "choosing",
    turn: 0,
    hp: { player: player.hp, ai: ai.hp },
    maxHp: { player: player.maxHp, ai: ai.maxHp },
    status: { player: player.status, ai: ai.status },
    stages: { player: { ...player.stages }, ai: { ...ai.stages } },
    pp: {
      player: player.moves.map((m) => m.pp),
      ai: ai.moves.map((m) => m.pp),
    },
    locked: { player: player.lockedMove, ai: ai.lockedMove },
    fx: { player: "none", ai: "none" },
    ticks: { player: 0, ai: 0 },
    floaters: [],
    log: [],
    names: { player: player.def.displayName, ai: ai.def.displayName },
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function delayFor(ev: BattleEvent): number {
  switch (ev.kind) {
    case "turn":
      return 450;
    case "announce":
      return 700;
    case "damage":
      return 950;
    case "heal":
      return 550;
    case "faint":
      return 1500;
    case "end":
      return 900;
    default:
      return 600;
  }
}

export function useBattle(player: Combatant, ai: Combatant, chart: number[][]) {
  const battleRef = useRef<Battle | null>(null);
  const busyRef = useRef(false);
  const floaterIdRef = useRef(0);
  const [view, setView] = useState<BattleView>(() => ({
    ...initialView(player, ai),
    phase: "intro",
  }));
  const [battleSeq, setBattleSeq] = useState(0);

  useEffect(() => {
    const battle = new Battle(player, ai, chart);
    battleRef.current = battle;
    busyRef.current = false;
    setView({ ...initialView(player, ai), phase: "intro" });
    setBattleSeq((s) => s + 1);

    const timers: number[] = [];
    const schedule = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(fn, ms));
    const inIntro = (v: BattleView) => v.phase === "intro";

    schedule(1000, () => {
      playCry(player.def.cry);
      setView((v) =>
        inIntro(v)
          ? { ...v, log: [...v.log, `Go! ${player.def.displayName}!`] }
          : v,
      );
    });
    schedule(2200, () => {
      playCry(ai.def.cry);
      setView((v) =>
        inIntro(v)
          ? {
              ...v,
              log: [...v.log, `A wild ${ai.def.displayName} appears!`],
            }
          : v,
      );
    });
    schedule(3200, () => {
      const extras = [
        `${player.def.displayName} — ${player.ability.replace(/_/g, " ")} / ${player.nature}`,
        `${ai.def.displayName} — ${ai.ability.replace(/_/g, " ")} / ${ai.nature}`,
        ...battle.startEvents().flatMap((e) => ("text" in e ? [e.text] : [])),
      ];
      setView((v) =>
        inIntro(v)
          ? { ...v, phase: "choosing", log: [...v.log, ...extras] }
          : v,
      );
    });

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [player, ai, chart]);

  const applyEvent = useCallback((ev: BattleEvent) => {
    setView((v) => {
      const b = battleRef.current;
      if (!b) return v;
      const p = b.combatants.player;
      const a = b.combatants.ai;
      const next: BattleView = {
        ...v,
        hp: { player: p.hp, ai: a.hp },
        maxHp: { player: p.maxHp, ai: a.maxHp },
        status: { player: p.status, ai: a.status },
        stages: { player: { ...p.stages }, ai: { ...a.stages } },
        pp: {
          player: p.moves.map((m) => m.pp),
          ai: a.moves.map((m) => m.pp),
        },
        locked: { player: p.lockedMove, ai: a.lockedMove },
        fx: { ...v.fx },
        ticks: { ...v.ticks },
        floaters: v.floaters,
        log: v.log,
      };
      const log = (text: string) => {
        next.log = [...next.log, text];
      };

      switch (ev.kind) {
        case "turn":
          next.turn = ev.turn;
          next.fx = { player: "none", ai: "none" };
          log(`— Turn ${ev.turn} —`);
          break;
        case "announce":
          next.fx[ev.side] = "attack";
          log(ev.text);
          break;
        case "damage":
          next.fx[ev.side] = "hit";
          next.ticks[ev.side] = v.ticks[ev.side] + 1;
          next.floaters = [
            ...next.floaters,
            {
              id: ++floaterIdRef.current,
              side: ev.side,
              text: `-${ev.amount}`,
              kind: ev.crit ? "crit" : "damage",
              createdAt: Date.now(),
            },
          ];
          if (ev.text) log(ev.text);
          break;
        case "heal":
          next.floaters = [
            ...next.floaters,
            {
              id: ++floaterIdRef.current,
              side: ev.side,
              text: `+${ev.amount}`,
              kind: "heal",
              createdAt: Date.now(),
            },
          ];
          log(ev.text);
          break;
        case "status":
          if (ev.status === "flinch") {
            next.status = { ...next.status, [ev.side]: "flinch" };
          }
          log(ev.text);
          break;
        case "faint":
          next.fx[ev.side] = "faint";
          log(ev.text);
          playCry(
            ev.side === "player"
              ? b.combatants.player.def.cry
              : b.combatants.ai.def.cry,
          );
          break;
        case "miss":
        case "no-effect":
        case "paralyzed":
        case "flinch":
        case "stat-change":
        case "ability-note":
        case "item-note":
          log(ev.text);
          break;
        case "end":
          break;
      }
      return next;
    });
  }, []);

  const chooseMove = useCallback(
    async (idx: number) => {
      const battle = battleRef.current;
      if (!battle || busyRef.current || battle.over !== null) return;
      busyRef.current = true;
      setView((v) => ({ ...v, phase: "animating" }));

      const aiIdx = chooseAiMove(battle, "ai");
      const events = battle.runTurn(idx, aiIdx);
      for (const ev of events) {
        applyEvent(ev);
        await sleep(delayFor(ev));
      }

      setView((v) => ({
        ...v,
        fx: {
          player: v.fx.player === "faint" ? "faint" : "none",
          ai: v.fx.ai === "faint" ? "faint" : "none",
        },
        phase:
          battle.over === null
            ? "choosing"
            : battle.over === "player"
              ? "victory"
              : "defeat",
      }));
      busyRef.current = false;
    },
    [applyEvent],
  );

  useEffect(() => {
    if (view.floaters.length === 0) return;
    const t = setTimeout(() => {
      setView((v) => ({
        ...v,
        floaters: v.floaters.filter((f) => Date.now() - f.createdAt < 1250),
      }));
    }, 1300);
    return () => clearTimeout(t);
  }, [view.floaters]);

  return { view, chooseMove, battleSeq };
}
