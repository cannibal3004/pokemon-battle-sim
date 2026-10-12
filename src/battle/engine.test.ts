import { describe, expect, it } from "vitest";
import { combatant, makeBattle, move, withRandom } from "./testUtils";
import type { BattleEvent } from "./types";

const textOf = (e: BattleEvent) => ("text" in e ? e.text : "");
const amountOf = (e: BattleEvent) => ("amount" in e ? e.amount : 0);

const tackle = move({ name: "tackle", power: 40 });
const scratch = move({ name: "scratch", power: 40 });
const thunderWave = move({ name: "thunder-wave", class: "status", power: 0,
  type: "electric", ailment: "paralysis", ailmentChance: 100 });
const recover = move({ name: "recover", class: "status", power: 0,
  selfChanges: [{ stat: "special_defense", change: 1, chance: 100 }], targetsSelf: true });
const nuke = move({ name: "nuke", power: 5000 });
const mkFoe = (name: string, ability: string) =>
  combatant({ name, side: "ai", ability, moves: [], stats: { speed: 10 } });

describe("choice item lock", () => {
  it("locks the first move used", () => {
    const a = combatant({ name: "H", side: "player", item: "choice_band", moves: [tackle, scratch] });
    const b = makeBattle([a], [combatant({ name: "F", side: "ai", moves: [tackle] })]);
    b.runTurn(1, 0);
    expect(a.lockedMove).toBe(1);
    b.runTurn(0, 0);
    expect(a.lockedMove).toBe(1);
  });
  it("clears the lock when the Pokemon switches out and returns", () => {
    const a = combatant({ name: "H", side: "player", item: "choice_band", moves: [tackle, scratch] });
    const bench = combatant({ name: "B", side: "player", moves: [tackle] });
    const b = makeBattle([a, bench], [combatant({ name: "F", side: "ai", moves: [tackle] })]);
    b.runTurn(1, 0);
    expect(a.lockedMove).toBe(1);
    b.voluntarySwitch(1);
    b.voluntarySwitch(0);
    expect(a.lockedMove).toBeNull();
    b.runTurn(0, 0);
    expect(a.lockedMove).toBe(0);
  });
  it("clears the lock when a locked Pokemon leaves the field", () => {
    const foe = combatant({ name: "AF", side: "ai", item: "choice_specs", moves: [tackle, scratch] });
    const foe2 = combatant({ name: "AF2", side: "ai", moves: [tackle] });
    const b = makeBattle([combatant({ name: "P", side: "player", moves: [tackle] })], [foe, foe2]);
    b.runTurn(0, 1);
    expect(foe.lockedMove).toBe(1);
    b.sendIn("ai", 1);
    expect(foe.lockedMove).toBeNull();
  });
});
describe("one-shot survival effects", () => {
  it("Sturdy triggers again after switching out and back in", () => {
    const rocky = combatant({ name: "Rocky", side: "ai", ability: "sturdy", moves: [tackle] });
    const bench = combatant({ name: "B", side: "ai", moves: [tackle] });
    const p = combatant({ name: "P", side: "player", moves: [nuke, tackle] });
    const b = makeBattle([p], [rocky, bench]);
    b.runTurn(0, 0);
    expect(rocky.hp).toBe(1);
    expect(rocky.sturdyUsed).toBe(true);

    rocky.hp = 200;
    b.sendIn("ai", 1);
    expect(rocky.sturdyUsed).toBe(false);
    b.sendIn("ai", 0);
    b.runTurn(0, 0);
    expect(rocky.hp).toBe(1);
  });
  it("Multiscale halves the first hit after each entry, not once per battle", () => {
    const draco = mkFoe("D", "multiscale");
    const bench = mkFoe("B", "multiscale");
    const p = combatant({ name: "P", side: "player", moves: [tackle], stats: { speed: 200 } });
    const b = makeBattle([p], [draco, bench]);
    const roll = [0.999, 0];

    withRandom(roll, () => b.runTurn(0, 0));
    const firstHit = 200 - draco.hp;
    expect(draco.multiscaleUsed).toBe(true);

    draco.hp = 200;
    b.sendIn("ai", 1);
    expect(draco.multiscaleUsed).toBe(false);
    b.sendIn("ai", 0);
    withRandom(roll, () => b.runTurn(0, 0));
    expect(200 - draco.hp).toBe(firstHit);
  });
  it("Multiscale actually halves the incoming hit", () => {
    const shielded = mkFoe("S", "multiscale");
    const plain = mkFoe("P", "");
    const p1 = combatant({ name: "A", side: "player", moves: [tackle], stats: { speed: 200 } });
    const p2 = combatant({ name: "A", side: "player", moves: [tackle], stats: { speed: 200 } });
    const roll = [0.999, 0];
    withRandom(roll, () => makeBattle([p1], [shielded]).runTurn(0, 0));
    withRandom(roll, () => makeBattle([p2], [plain]).runTurn(0, 0));
    expect(200 - shielded.hp).toBe(Math.max(1, Math.floor((200 - plain.hp) / 2)));
  });
  it("Focus Sash stays consumed after switching (it is a spent item)", () => {
    const mon = combatant({ name: "Sash", side: "ai", item: "focus_sash", moves: [tackle] });
    const bench = combatant({ name: "B", side: "ai", moves: [tackle] });
    const p = combatant({ name: "P", side: "player", moves: [nuke, tackle] });
    const b = makeBattle([p], [mon, bench]);
    b.runTurn(0, 0);
    expect(mon.hp).toBe(1);
    expect(mon.itemUsed).toBe(true);

    mon.hp = 200;
    b.sendIn("ai", 1);
    expect(mon.itemUsed).toBe(true);
    b.sendIn("ai", 0);
    b.runTurn(0, 0);
    expect(mon.hp).toBe(0);
  });
});
describe("status moves", () => {
  it("does not overwrite an existing non-volatile status", () => {
    const user = combatant({ name: "Zap", side: "player", moves: [thunderWave] });
    const foe = combatant({ name: "F", side: "ai", status: "burn", moves: [tackle] });
    const b = makeBattle([user], [foe]);
    const events = b.runTurn(0, 0);
    expect(foe.status).toBe("burn");
    expect(events.some((e) => e.kind === "no-effect")).toBe(true);
  });
  it("applies a status to a healthy target", () => {
    const user = combatant({ name: "Zap", side: "player", moves: [thunderWave] });
    const foe = combatant({ name: "F", side: "ai", moves: [tackle] });
    const b = makeBattle([user], [foe]);
    b.runTurn(0, 0);
    expect(foe.status).toBe("paralysis");
  });
  it("reports 'already' when the target has the same status", () => {
    const user = combatant({ name: "Zap", side: "player", moves: [thunderWave] });
    const foe = combatant({ name: "F", side: "ai", status: "paralysis", moves: [tackle] });
    const b = makeBattle([user], [foe]);
    const events = b.runTurn(0, 0);
    expect(foe.status).toBe("paralysis");
    expect(events.some((e) => textOf(e).includes("already"))).toBe(true);
  });
  it("self-targeting status moves do not also affect the foe", () => {
    const user = combatant({ name: "Setup", side: "player", moves: [recover] });
    const foe = combatant({ name: "F", side: "ai", moves: [tackle] });
    const b = makeBattle([user], [foe]);
    b.runTurn(0, 0);
    expect(user.stages.special_defense).toBe(1);
    expect(foe.stages.special_defense).toBe(0);
  });
});
describe("end-of-turn residual damage", () => {
  it("does not tick residual damage on a Pokemon that just switched in", () => {
    const fresh = combatant({ name: "Fresh", side: "ai", status: "poison", moves: [tackle] });
    const dying = combatant({ name: "Dying", side: "ai", hp: 1, moves: [tackle] });
    const p = combatant({ name: "P", side: "player", moves: [nuke, tackle] });
    const b = makeBattle([p], [dying, fresh]);
    const events = b.runTurn(0, 0);
    expect(b.aiActive).toBe(1);
    expect(fresh.hp).toBe(fresh.maxHp);
    expect(events.some((e) => textOf(e).includes("hurt by poison"))).toBe(false);
  });
  it("ticks residual damage on a voluntarily switched-in Pokemon", () => {
    // A voluntary switch is the turn's action, so the replacement is on the
    // field for the whole turn and does take end-of-turn residual damage —
    // unlike a forced send-in after a faint (tested above).
    const poisoned = combatant({ name: "P2", side: "player", status: "poison", moves: [tackle] });
    const lead = combatant({ name: "Lead", side: "player", moves: [tackle] });
    const b = makeBattle([lead, poisoned], [combatant({ name: "F", side: "ai", moves: [] })]);
    b.voluntarySwitch(1);
    expect(poisoned.hp).toBeLessThan(poisoned.maxHp);
  });
  it("Leftovers heals at the end of the turn", () => {
    const mon = combatant({ name: "C", side: "player", item: "leftovers", moves: [tackle] });
    mon.hp = 100;
    // Foe has no moves, so the only HP change this turn is the Leftovers heal.
    const b = makeBattle([mon], [combatant({ name: "F", side: "ai", moves: [] })]);
    b.runTurn(0, 0);
    expect(mon.hp).toBe(112);
  });
});
describe("Life Orb", () => {
  it("costs 10% of the user's max HP per attack, not 10% of damage dealt", () => {
    const orb = combatant({ name: "Orb", side: "player", item: "life_orb", moves: [tackle] });
    const foe = combatant({ name: "F", side: "ai", moves: [tackle] });
    const b = makeBattle([orb], [foe]);
    const events = b.runTurn(0, 0);
    const recoil = events.filter(
      (e) => e.kind === "damage" && e.source === "recoil" && e.side === "player",
    );
    expect(recoil).toHaveLength(1);
    // 10% of 200 max HP = 20. A damage-based recoil would be far smaller.
    expect(amountOf(recoil[0])).toBe(20);
  });
});
describe("double KO", () => {
  it("processes the target's faint when recoil also KOs the user", () => {
    // Regression: the recoil path returned early, swallowing the target's faint
    // and deadlocking the battle on a 0 HP enemy with no switch prompt.
    const orb = combatant({ name: "Orb", side: "player", item: "life_orb", hp: 1,
      moves: [nuke], stats: { speed: 300 } });
    const bench = combatant({ name: "Bench", side: "player", moves: [tackle] });
    const foe = combatant({ name: "Foe", side: "ai", moves: [tackle] });
    const b = makeBattle([orb, bench], [foe]);
    const events = b.runTurn(0, 0);
    expect(foe.hp).toBe(0);
    expect(events.some((e) => e.kind === "faint" && e.side === "ai")).toBe(true);
    expect(orb.hp).toBe(0);
    expect(b.over).toBe("player");
  });
  it("drains before recoil so a surviving user is healed first", () => {
    // Drain is part of the attack; running recoil first would faint the user and
    // then either skip the heal or heal a fainted Pokemon back above 0.
    const drain = move({ name: "drain", power: 80, drainPct: 50 });
    const user = combatant({ name: "Drain", side: "player", item: "life_orb", hp: 10,
      moves: [drain], stats: { speed: 300 } });
    const foe = combatant({ name: "Foe", side: "ai", moves: [] });
    const b = makeBattle([user], [foe]);
    const events = b.runTurn(0, 0);
    expect(user.hp).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === "faint" && e.side === "player")).toBe(false);
  });
});
describe("switching", () => {
  it("resets the stat stages of the Pokemon that leaves the field", () => {
    const a = combatant({ name: "Setup", side: "player", moves: [recover, tackle] });
    const bench = combatant({ name: "B", side: "player", moves: [tackle] });
    const b = makeBattle([a, bench], [combatant({ name: "F", side: "ai", moves: [tackle] })]);
    b.runTurn(0, 0);
    expect(a.stages.special_defense).toBe(1);
    b.voluntarySwitch(1);
    expect(a.stages.special_defense).toBe(0);
  });
  it("a voluntary switch still lets the foe attack", () => {
    const a = combatant({ name: "S", side: "player", moves: [tackle] });
    const bench = combatant({ name: "B", side: "player", moves: [tackle] });
    const b = makeBattle([a, bench], [combatant({ name: "F", side: "ai", moves: [tackle] })]);
    const events = b.voluntarySwitch(1);
    expect(b.turn).toBe(1);
    expect(events.some((e) => e.kind === "damage" && e.side === "player")).toBe(true);
  });
  it("a Pokemon that switches in does not act on the turn it entered", () => {
    const a = combatant({ name: "Slow", side: "player", moves: [tackle] });
    const fast = combatant({ name: "Fast", side: "player", moves: [nuke] });
    fast.stats.speed = 999;
    const foe = combatant({ name: "F", side: "ai", moves: [tackle] });
    const b = makeBattle([a, fast], [foe]);
    b.voluntarySwitch(1);
    expect(foe.hp).toBe(foe.maxHp);
  });
});
describe("fainting", () => {
  it("ends the battle when a side has no survivors", () => {
    const p = combatant({ name: "Only", side: "player", moves: [tackle] });
    const a1 = combatant({ name: "A1", side: "ai", moves: [nuke] });
    const b = makeBattle([p], [a1]);
    const events = b.runTurn(0, 0);
    expect(b.over).toBe("ai");
    expect(events.some((e) => e.kind === "end")).toBe(true);
  });
  it("emits no further events once the battle is over", () => {
    const p = combatant({ name: "Only", side: "player", moves: [tackle] });
    const a1 = combatant({ name: "A1", side: "ai", moves: [nuke] });
    const b = makeBattle([p], [a1]);
    b.runTurn(0, 0);
    expect(b.runTurn(0, 0)).toHaveLength(0);
  });
});

describe("sleep", () => {
  const mkAsleep = (turns: number) =>
    combatant({ name: "Sleeper", side: "player", status: "sleep", sleepTurns: turns,
      moves: [tackle], stats: { speed: 300 } });
  const idle = () => combatant({ name: "F", side: "ai", moves: [], stats: { speed: 10 } });

  it("skips turns while the counter lasts, then wakes and attacks", () => {
    const sleeper = mkAsleep(2);
    const foe = idle();
    const b = makeBattle([sleeper], [foe]);

    expect(textOf(b.runTurn(0, 0)[1])).toContain("fast asleep");
    expect(sleeper.sleepTurns).toBe(1);
    expect(foe.hp).toBe(foe.maxHp);

    b.runTurn(0, 0);
    expect(sleeper.sleepTurns).toBe(0);
    expect(foe.hp).toBe(foe.maxHp);

    // Counter exhausted: wakes and attacks on the same turn (Gen II onward).
    withRandom([0.999, 0], () => b.runTurn(0, 0));
    expect(sleeper.status).toBe("none");
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it("does not wake early and keeps the status until the counter runs out", () => {
    const sleeper = mkAsleep(3);
    const b = makeBattle([sleeper], [idle()]);
    b.runTurn(0, 0);
    expect(sleeper.status).toBe("sleep");
    expect(sleeper.sleepTurns).toBe(2);
  });
});

describe("freeze", () => {
  const frozen = () =>
    combatant({ name: "Icy", side: "player", status: "freeze", moves: [tackle],
      stats: { speed: 300 } });
  const idle = () => combatant({ name: "F", side: "ai", moves: [], stats: { speed: 10 } });

  it("blocks the turn when the thaw roll fails", () => {
    const mon = frozen();
    const foe = idle();
    const b = makeBattle([mon], [foe]);
    // 0.999 >= 0.2 -> stays frozen.
    const events = withRandom([0.999], () => b.runTurn(0, 0));
    expect(mon.status).toBe("freeze");
    expect(foe.hp).toBe(foe.maxHp);
    expect(textOf(events[1])).toContain("frozen solid");
  });

  it("thaws on a successful roll and attacks that same turn", () => {
    const mon = frozen();
    const foe = idle();
    const b = makeBattle([mon], [foe]);
    // 0.1 < 0.2 -> thaws; then crit + damage rolls.
    const events = withRandom([0.1, 0.999, 0], () => b.runTurn(0, 0));
    expect(mon.status).toBe("none");
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(textOf(events[1])).toContain("thawed out");
  });
});


describe("damaging-move secondary effects", () => {
  // Before this feature, applyDamageMove ignored mv.ailment entirely: Ice Beam
  // could not freeze and Flamethrower could not burn.
  const iceBeam = move({
    name: "ice-beam", power: 90, class: "special", type: "ice",
    ailment: "freeze", ailmentChance: 10,
  });

  const mkPair = () => {
    const atk = combatant({ name: "A", side: "player", moves: [iceBeam], stats: { speed: 300 } });
    const def = combatant({ name: "D", side: "ai", moves: [], stats: { speed: 10 } });
    return { atk, def, b: makeBattle([atk], [def]) };
  };

  it("inflicts the secondary status when the roll succeeds", () => {
    const { def, b } = mkPair();
    withRandom([0.999, 0, 0.05], () => b.runTurn(0, 0));
    expect(def.status).toBe("freeze");
  });

  it("respects the ailment chance when the roll fails", () => {
    const { def, b } = mkPair();
    withRandom([0.999, 0, 0.5], () => b.runTurn(0, 0));
    expect(def.status).toBe("none");
  });

  it("does not replace an existing status, and stays silent about it", () => {
    // A secondary effect that cannot apply is not announced: the move just does
    // its damage. Only status moves report "But it failed to affect ...!".
    const { def, b } = mkPair();
    def.status = "burn";
    const events = withRandom([0.999, 0, 0.05], () => b.runTurn(0, 0));
    expect(def.status).toBe("burn");
    expect(events.some((e) => e.kind === "status")).toBe(false);
    expect(events.some((e) => e.kind === "no-effect")).toBe(false);
    expect(def.hp).toBeLessThan(def.maxHp);
  });
});

describe("multi-hit moves", () => {
  const bulletSeed = move({
    name: "bullet-seed", power: 25, class: "physical", type: "grass",
    minHits: 2, maxHits: 5,
  });

  const mkPair = () => {
    const atk = combatant({ name: "A", side: "player", moves: [bulletSeed], stats: { speed: 300 } });
    const def = combatant({ name: "D", side: "ai", moves: [], stats: { speed: 10 } });
    return { def, b: makeBattle([atk], [def]) };
  };

  it("rolls the hit count within min..max and lands that many hits", () => {
    const { def, b } = mkPair();
    // crit(no), factor, hitRoll 0 -> 2 hits, then hit 2: crit(no), factor.
    const events = withRandom([0.999, 0, 0, 0.999, 0], () => b.runTurn(0, 0));
    const hits = events.filter((e) => e.kind === "damage" && e.source === "move");
    expect(hits).toHaveLength(2);
    expect(textOf(hits[1])).toContain("(2/2)");
    expect(def.hp).toBeLessThan(def.maxHp);
  });

  it("rolls the maximum when the hit roll is at the top", () => {
    const { b } = mkPair();
    // hitRoll 0.999 -> 5 hits: damage rolls needed for hits 2-5 as well.
    const events = withRandom(
      [0.999, 0, 0.999, 0.999, 0, 0.999, 0, 0.999, 0, 0.999, 0],
      () => b.runTurn(0, 0),
    );
    const hits = events.filter((e) => e.kind === "damage" && e.source === "move");
    expect(hits).toHaveLength(5);
  });

  it("stops hitting once the target faints", () => {
    const { def, b } = mkPair();
    def.hp = 1;
    const events = withRandom([0.999, 0, 0.999], () => b.runTurn(0, 0));
    const hits = events.filter((e) => e.kind === "damage" && e.source === "move");
    expect(hits).toHaveLength(1);
    expect(def.hp).toBe(0);
  });

  it("a single-hit move is unaffected", () => {
    const atk = combatant({ name: "A", side: "player", moves: [tackle], stats: { speed: 300 } });
    const def = combatant({ name: "D", side: "ai", moves: [], stats: { speed: 10 } });
    const b = makeBattle([atk], [def]);
    const events = withRandom([0.999, 0], () => b.runTurn(0, 0));
    const hits = events.filter((e) => e.kind === "damage" && e.source === "move");
    expect(hits).toHaveLength(1);
    expect(textOf(hits[0])).not.toContain("(1/1)");
  });
});
