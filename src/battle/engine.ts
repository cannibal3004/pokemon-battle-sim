import { getAbility, isMagicGuard } from "./abilities";
import { calculateDamage } from "./damage";
import { effectiveSpeed, stageWord, statLabel } from "./stats";
import type {
  BattleEvent,
  Combatant,
  MoveDef,
  Side,
  StatStageChange,
  StatusId,
} from "./types";
import { OTHER } from "./types";

const STRUGGLE: MoveDef = {
  id: 0,
  name: "struggle",
  displayName: "Struggle",
  type: "normal",
  class: "physical",
  power: 20,
  accuracy: 100,
  pp: 0,
  maxPp: 0,
  priority: 0,
  ailment: "none",
  ailmentChance: 0,
  selfChanges: [],
  targetChanges: [],
  recoilPct: 25,
  drainPct: 0,
  targetsSelf: false,
};

const STATUS_TEXT: Record<Exclude<StatusId, "none" | "flinch">, string> = {
  burn: "burned",
  paralysis: "paralyzed",
  poison: "poisoned",
};

export class Battle {
  turn = 0;
  over: Side | null = null;
  readonly combatants: { player: Combatant; ai: Combatant };
  readonly chart: number[][];

  constructor(player: Combatant, ai: Combatant, chart: number[][]) {
    this.combatants = { player, ai };
    this.chart = chart;
  }

  startEvents(): BattleEvent[] {
    const evts: BattleEvent[] = [];
    for (const side of ["player", "ai"] as Side[]) {
      const c = this.combatants[side];
      const ability = getAbility(c.ability);
      if (ability?.intimidate) {
        const foe = this.combatants[OTHER[side]];
        if (foe.stages.attack > -6) {
          foe.stages.attack--;
          evts.push({
            kind: "ability-note",
            side,
            text: `${c.def.displayName}'s ${ability.name} intimidated ${foe.def.displayName}!`,
          });
          evts.push({
            kind: "stat-change",
            side: OTHER[side],
            stat: "attack",
            delta: -1,
            stages: foe.stages.attack,
            text: `${foe.def.displayName}'s Attack ${stageWord(-1)}!`,
          });
        }
      }
    }
    return evts;
  }

  runTurn(playerIdx: number, aiIdx: number): BattleEvent[] {
    if (this.over !== null) return [];
    const evts: BattleEvent[] = [];
    this.turn++;
    evts.push({ kind: "turn", turn: this.turn });

    const { player, ai } = this.combatants;
    const pPrio = player.moves[playerIdx]?.def.priority ?? 0;
    const aPrio = ai.moves[aiIdx]?.def.priority ?? 0;
    let first: Side;
    if (pPrio !== aPrio) {
      first = pPrio > aPrio ? "player" : "ai";
    } else {
      const pSpeed = effectiveSpeed(player.stats, player.stages, player.status === "paralysis");
      const aSpeed = effectiveSpeed(ai.stats, ai.stages, ai.status === "paralysis");
      if (pSpeed !== aSpeed) first = pSpeed > aSpeed ? "player" : "ai";
      else first = Math.random() < 0.5 ? "player" : "ai";
    }

    const order: Side[] = [first, OTHER[first]];
    for (const side of order) {
      if (this.over !== null) break;
      const actor = this.combatants[side];
      const target = this.combatants[OTHER[side]];
      if (actor.hp <= 0 || target.hp <= 0) continue;
      const idx = side === "player" ? playerIdx : aiIdx;
      evts.push(...this.useMove(actor, target, idx));
    }

    for (const side of ["player", "ai"] as Side[]) {
      if (this.over !== null) break;
      evts.push(...this.endOfTurn(this.combatants[side], side));
    }

    if (this.over !== null) evts.push({ kind: "end", winner: this.over });
    return evts;
  }

  private useMove(actor: Combatant, target: Combatant, idx: number): BattleEvent[] {
    const evts: BattleEvent[] = [];
    const side = actor.side;
    if (actor.moves.length === 0) return evts;

    let moveIdx = Math.max(0, Math.min(idx, actor.moves.length - 1));
    if (actor.lockedMove !== null && actor.moves[actor.lockedMove]) moveIdx = actor.lockedMove;
    const move = actor.moves[moveIdx].def;

    if (actor.flinched) {
      actor.flinched = false;
      evts.push({
        kind: "flinch",
        side,
        text: `${actor.def.displayName} flinched and couldn't move!`,
      });
      return evts;
    }

    if (actor.status === "paralysis" && Math.random() < 0.25) {
      evts.push({
        kind: "paralyzed",
        side,
        text: `${actor.def.displayName} is fully paralyzed and can't move!`,
      });
      return evts;
    }

    if (actor.item === "assault_vest" && move.class === "status") {
      evts.push({
        kind: "item-note",
        side,
        text: `${actor.def.displayName} can't use ${move.displayName} with Assault Vest!`,
      });
      return evts;
    }

    const hadPp = actor.moves[moveIdx].pp > 0;
    const mv = hadPp ? move : STRUGGLE;

    if (!hadPp) {
      evts.push({ kind: "announce", side, text: `${actor.def.displayName} has no PP left!` });
    } else {
      evts.push({ kind: "announce", side, text: `${actor.def.displayName} used ${mv.displayName}!` });
      const isChoice = actor.item === "choice_band" || actor.item === "choice_specs";
      if (isChoice && actor.lockedMove === null) actor.lockedMove = moveIdx;
    }

    if (mv.accuracy < 100 && Math.random() * 100 >= mv.accuracy) {
      if (hadPp) actor.moves[moveIdx].pp--;
      evts.push({ kind: "miss", side, text: `${actor.def.displayName}'s ${hadPp ? mv.displayName : "attack"} missed!` });
      return evts;
    }

    if (mv.class === "status") {
      this.applyStatusMove(actor, target, mv, evts);
    } else {
      this.applyDamageMove(actor, target, mv, evts);
    }

    if (hadPp) actor.moves[moveIdx].pp--;
    return evts;
  }

  private applyDamageMove(
    actor: Combatant,
    target: Combatant,
    mv: MoveDef,
    evts: BattleEvent[],
  ) {
    const result = calculateDamage(actor, target, mv, this.chart);
    if (result.immune) {
      evts.push({
        kind: "no-effect",
        side: target.side,
        text: `It doesn't affect ${target.def.displayName}!`,
      });
      return;
    }

    let dmg = result.amount;
    const targetAbility = getAbility(target.ability);
    if (targetAbility?.multiscale && !target.multiscaleUsed) {
      target.multiscaleUsed = true;
      dmg = Math.max(1, Math.floor(dmg / 2));
      evts.push({
        kind: "ability-note",
        side: target.side,
        text: `${target.def.displayName}'s Multiscale halved the damage!`,
      });
    }

    if (dmg >= target.hp) {
      if (target.item === "focus_sash" && !target.itemUsed) {
        target.itemUsed = true;
        dmg = target.hp - 1;
        evts.push({
          kind: "item-note",
          side: target.side,
          text: `${target.def.displayName}'s Focus Sash saved it from fainting!`,
        });
      } else if (targetAbility?.sturdy && !target.sturdyUsed) {
        target.sturdyUsed = true;
        dmg = target.hp - 1;
        evts.push({
          kind: "ability-note",
          side: target.side,
          text: `${target.def.displayName}'s Sturdy saved it from fainting!`,
        });
      }
    }

    target.hp = Math.max(0, target.hp - dmg);
    let text = `${target.def.displayName} took ${dmg} damage.`;
    if (result.crit) text += " A critical hit!";
    else if (result.effectiveness > 1) text += " It's super effective!";
    else if (result.effectiveness > 0 && result.effectiveness < 1) text += " It's not very effective...";
    evts.push({
      kind: "damage",
      side: target.side,
      amount: dmg,
      maxHp: target.maxHp,
      crit: result.crit,
      stab: result.stab,
      effectiveness: result.effectiveness,
      source: "move",
      text,
    });

    let recoil = 0;
    if (mv.recoilPct > 0) recoil += Math.floor((dmg * mv.recoilPct) / 100);
    if (actor.item === "life_orb") recoil += Math.floor(dmg * 0.1);
    if (recoil > 0) {
      const rd = Math.min(actor.hp - 1, recoil);
      if (rd > 0) {
        actor.hp -= rd;
        evts.push({
          kind: "damage",
          side: actor.side,
          amount: rd,
          maxHp: actor.maxHp,
          crit: false,
          stab: false,
          effectiveness: 1,
          source: "recoil",
          text: `${actor.def.displayName} took recoil damage.`,
        });
      }
    }

    if (mv.drainPct > 0) {
      const heal = Math.min(actor.maxHp - actor.hp, Math.floor((dmg * mv.drainPct) / 100));
      if (heal > 0) {
        actor.hp += heal;
        evts.push({
          kind: "heal",
          side: actor.side,
          amount: heal,
          maxHp: actor.maxHp,
          text: `${actor.def.displayName} drained ${heal} HP!`,
        });
      }
    }

    if (target.hp <= 0) this.faint(target, evts);
  }

  private applyStatusMove(
    actor: Combatant,
    target: Combatant,
    mv: MoveDef,
    evts: BattleEvent[],
  ) {
    const applyChanges = (who: Combatant, changes: StatStageChange[]) => {
      for (const ch of changes) {
        if (Math.random() * 100 >= ch.chance) {
          evts.push({ kind: "miss", side: actor.side, text: "But it failed!" });
          continue;
        }
        const before = who.stages[ch.stat];
        const after = Math.max(-6, Math.min(6, before + ch.change));
        if (after === before) {
          evts.push({
            kind: "no-effect",
            side: who.side,
            text: `${who.def.displayName}'s ${statLabel(ch.stat)} can't change any further!`,
          });
          continue;
        }
        who.stages[ch.stat] = after;
        const delta = after - before;
        evts.push({
          kind: "stat-change",
          side: who.side,
          stat: ch.stat,
          delta,
          stages: after,
          text: `${who.def.displayName}'s ${statLabel(ch.stat)} ${stageWord(delta)}!`,
        });
      }
    };

    applyChanges(actor, mv.selfChanges);
    if (mv.targetsSelf) applyChanges(actor, mv.targetChanges);
    else applyChanges(target, mv.targetChanges);

    if (mv.ailment !== "none" && Math.random() * 100 < mv.ailmentChance) {
      if (mv.ailment === "flinch") {
        target.flinched = true;
        evts.push({
          kind: "status",
          side: target.side,
          status: "flinch",
          text: `${target.def.displayName} flinched!`,
        });
      } else if (target.status === "none") {
        target.status = mv.ailment;
        evts.push({
          kind: "status",
          side: target.side,
          status: mv.ailment,
          text: `${target.def.displayName} was ${STATUS_TEXT[mv.ailment as Exclude<StatusId, "none" | "flinch">]}!`,
        });
      } else if (target.status !== mv.ailment) {
        target.status = mv.ailment;
        evts.push({
          kind: "status",
          side: target.side,
          status: mv.ailment,
          text: `${target.def.displayName} was ${STATUS_TEXT[mv.ailment as Exclude<StatusId, "none" | "flinch">]}!`,
        });
      } else {
        evts.push({
          kind: "no-effect",
          side: target.side,
          text: `${target.def.displayName} is already ${STATUS_TEXT[mv.ailment as Exclude<StatusId, "none" | "flinch">]}!`,
        });
      }
    }
  }

  private endOfTurn(c: Combatant, side: Side): BattleEvent[] {
    const evts: BattleEvent[] = [];
    c.flinched = false;
    if (c.hp <= 0) return evts;

    const magicGuard = isMagicGuard(c);
    if (!magicGuard && c.status === "poison") {
      const dmg = Math.max(1, Math.floor(c.maxHp / 8));
      c.hp = Math.max(0, c.hp - dmg);
      evts.push({
        kind: "damage",
        side,
        amount: dmg,
        maxHp: c.maxHp,
        crit: false,
        stab: false,
        effectiveness: 1,
        source: "poison",
        text: `${c.def.displayName} is hurt by poison.`,
      });
      if (c.hp <= 0) {
        this.faint(c, evts);
        return evts;
      }
    } else if (!magicGuard && c.status === "burn") {
      const dmg = Math.max(1, Math.floor(c.maxHp / 16));
      c.hp = Math.max(0, c.hp - dmg);
      evts.push({
        kind: "damage",
        side,
        amount: dmg,
        maxHp: c.maxHp,
        crit: false,
        stab: false,
        effectiveness: 1,
        source: "burn",
        text: `${c.def.displayName} is hurt by its burn.`,
      });
      if (c.hp <= 0) {
        this.faint(c, evts);
        return evts;
      }
    }

    if (c.item === "leftovers" && c.hp > 0) {
      const heal = Math.min(c.maxHp - c.hp, Math.max(1, Math.floor(c.maxHp / 16)));
      if (heal > 0) {
        c.hp += heal;
        evts.push({
          kind: "heal",
          side,
          amount: heal,
          maxHp: c.maxHp,
          text: `${c.def.displayName} recovered HP from its Leftovers.`,
        });
      }
    }
    return evts;
  }

  private faint(c: Combatant, evts: BattleEvent[]) {
    c.hp = 0;
    evts.push({ kind: "faint", side: c.side, text: `${c.def.displayName} fainted!` });
    this.over = OTHER[c.side];
  }
}
