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

export type Teams = { player: Combatant[]; ai: Combatant[] };
export type Phase = "intro" | "choosing" | "switching" | "animating" | "victory" | "defeat";
export type FxKind = "none" | "attack" | "hit" | "faint";

export interface Floater {
  id: number;
  side: Side;
  text: string;
  kind: "damage" | "heal" | "crit";
  createdAt: number;
}

export interface TeamMemberView {
  name: string;
  hp: number;
  maxHp: number;
  status: StatusId;
  fainted: boolean;
}

export interface BattleView {
  phase: Phase;
  turn: number;
  activeIdx: Record<Side, number>;
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
  team: Record<Side, TeamMemberView[]>;
  mustSwitch: boolean;
}

function memberViews(team: Combatant[]): TeamMemberView[] {
  return team.map((c) => ({
    name: c.def.displayName,
    hp: c.hp,
    maxHp: c.maxHp,
    status: c.status,
    fainted: c.hp <= 0,
  }));
}

function initialView(teams: Teams): BattleView {
  const p = teams.player[0];
  const a = teams.ai[0];
  return {
    phase: "choosing",
    turn: 0,
    activeIdx: { player: 0, ai: 0 },
    hp: { player: p.hp, ai: a.hp },
    maxHp: { player: p.maxHp, ai: a.maxHp },
    status: { player: p.status, ai: a.status },
    stages: { player: { ...p.stages }, ai: { ...a.stages } },
    pp: {
      player: p.moves.map((m) => m.pp),
      ai: a.moves.map((m) => m.pp),
    },
    locked: { player: p.lockedMove, ai: a.lockedMove },
    fx: { player: "none", ai: "none" },
    ticks: { player: 0, ai: 0 },
    floaters: [],
    log: [],
    names: { player: p.def.displayName, ai: a.def.displayName },
    team: { player: memberViews(teams.player), ai: memberViews(teams.ai) },
    mustSwitch: false,
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
    case "switch":
      return 1700;
    case "end":
      return 900;
    default:
      return 600;
  }
}

export function useBattle(teams: Teams, chart: number[][]) {
  const battleRef = useRef<Battle | null>(null);
  const busyRef = useRef(false);
  const floaterIdRef = useRef(0);
  const [view, setView] = useState<BattleView>(() => ({
    ...initialView(teams),
    phase: "intro",
  }));
  const [battleSeq, setBattleSeq] = useState(0);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    const battle = new Battle(teams, chart);
    battleRef.current = battle;
    busyRef.current = false;
    setView({ ...initialView(teams), phase: "intro" });
    setBattleSeq((s) => s + 1);

    const p = teams.player[0];
    const a = teams.ai[0];
    const timers: number[] = [];
    const schedule = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(fn, ms));
    const inIntro = (v: BattleView) => v.phase === "intro";

    schedule(1000, () => {
      playCry(p.def.cry);
      setView((v) =>
        inIntro(v) ? { ...v, log: [...v.log, `Go! ${p.def.displayName}!`] } : v,
      );
    });
    schedule(2200, () => {
      playCry(a.def.cry);
      setView((v) =>
        inIntro(v)
          ? { ...v, log: [...v.log, `A wild ${a.def.displayName} appears!`] }
          : v,
      );
    });
    schedule(3200, () => {
      const extras = [
        `${p.def.displayName} — ${p.ability.replace(/_/g, " ")} / ${p.nature}`,
        `${a.def.displayName} — ${a.ability.replace(/_/g, " ")} / ${a.nature}`,
        ...battle.startEvents().flatMap((e) => ("text" in e ? [e.text] : [])),
      ];
      setView((v) => (inIntro(v) ? { ...v, phase: "choosing", log: [...v.log, ...extras] } : v));
    });

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [teams, chart]);

  const applyEvent = useCallback((ev: BattleEvent) => {
    const b = battleRef.current;
    if (!b) return;
    // Cries are side effects — play them outside the state updater, which
    // StrictMode double-invokes in development (would double every cry).
    if (ev.kind === "faint") playCry(ev.cry);
    if (ev.kind === "switch") playCry(b.combatants[ev.side].def.cry);

    setView((v) => {
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
          break;
        case "switch": {
          const c = b.combatants[ev.side];
          next.activeIdx = { ...next.activeIdx, [ev.side]: ev.index };
          next.names = { ...next.names, [ev.side]: c.def.displayName };
          next.fx = { ...next.fx, [ev.side]: "none" };
          log(ev.text);
          break;
        }
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

      return {
        ...next,
        team: { player: memberViews(b.teams.player), ai: memberViews(b.teams.ai) },
      };
    });
  }, []);

  /** Decide the resting phase once an event stream finishes. */
  const settle = useCallback((battle: Battle) => {
    setView((v) => ({
      ...v,
      fx: {
        player: v.fx.player === "faint" ? "faint" : "none",
        ai: v.fx.ai === "faint" ? "faint" : "none",
      },
      phase:
        battle.over !== null
          ? battle.over === "player"
            ? "victory"
            : "defeat"
          : battle.player.hp <= 0
            ? "switching"
            : "choosing",
      mustSwitch: battle.over === null && battle.player.hp <= 0,
    }));
  }, []);

  const chooseMove = useCallback(
    async (idx: number) => {
      const battle = battleRef.current;
      if (!battle || busyRef.current || battle.over !== null) return;
      if (viewRef.current.phase !== "choosing") return;
      busyRef.current = true;
      setView((v) => ({ ...v, phase: "animating" }));

      const aiIdx = chooseAiMove(battle, "ai");
      const events = battle.runTurn(idx, aiIdx);
      for (const ev of events) {
        applyEvent(ev);
        await sleep(delayFor(ev));
      }

      settle(battle);
      busyRef.current = false;
    },
    [applyEvent, settle],
  );

  /** Player picked a replacement (forced after a faint, or voluntary). */
  const chooseSwitch = useCallback(
    async (idx: number) => {
      const battle = battleRef.current;
      if (!battle || busyRef.current || battle.over !== null) return;
      const cur = viewRef.current;
      if (cur.phase !== "switching") return;
      const c = battle.teams.player[idx];
      if (!c || c.hp <= 0 || idx === battle.playerActive) return;
      busyRef.current = true;
      setView((v) => ({ ...v, phase: "animating" }));

      const events = cur.mustSwitch ? battle.sendIn("player", idx) : battle.voluntarySwitch(idx);
      for (const ev of events) {
        applyEvent(ev);
        await sleep(delayFor(ev));
      }

      settle(battle);
      busyRef.current = false;
    },
    [applyEvent, settle],
  );

  /** Open the voluntary switch picker (costs the turn). */
  const openSwitch = useCallback(() => {
    const battle = battleRef.current;
    if (!battle || busyRef.current || battle.over !== null) return;
    if (viewRef.current.phase !== "choosing") return;
    setView((v) => ({ ...v, phase: "switching", mustSwitch: false }));
  }, []);

  const cancelSwitch = useCallback(() => {
    const cur = viewRef.current;
    if (cur.phase !== "switching" || cur.mustSwitch || busyRef.current) return;
    setView((v) => ({ ...v, phase: "choosing", mustSwitch: false }));
  }, []);

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

  return { view, chooseMove, chooseSwitch, openSwitch, cancelSwitch, battleSeq };
}
