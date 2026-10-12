import { describe, expect, it } from "vitest";
import { chooseAiMove, chooseAiSwitch } from "./ai";
import { combatant, makeBattle, move, withRandom } from "./testUtils";
import type { Combatant, MoveDef, StatusId } from "./types";

/**
 * Scoring is jittered (0.85 + random * 0.3). Pinning the roll to 0.5 makes the
 * multiplier exactly 1.0 so tests assert on the score model itself.
 */
function pick(
  aiMoves: MoveDef[],
  foeOver: { status?: StatusId; hp?: number } = {},
): { idx: number; ai: Combatant; foe: Combatant } {
  const ai = combatant({ name: "AI", side: "ai", moves: aiMoves });
  const foe = combatant({
    name: "Foe",
    side: "player",
    moves: [],
    status: foeOver.status ?? "none",
    hp: foeOver.hp,
  });
  const b = makeBattle([foe], [ai]);
  return { idx: withRandom(0.5, () => chooseAiMove(b, "ai")), ai, foe };
}

const tackle = move({ name: "tackle", power: 40 });
const weakHit = move({ name: "scratch", power: 20 });

// PokeAPI reports ailment_chance 0 for dedicated status moves and
// data/pokemon normalizes that to 100, so these mirror what the engine sees.
const spore = move({ name: "spore", class: "status", accuracy: 100, ailment: "sleep", ailmentChance: 100 });
const hypnosis = move({ name: "hypnosis", class: "status", accuracy: 60, ailment: "sleep", ailmentChance: 100 });
const glare = move({ name: "glare", class: "status", accuracy: 100, ailment: "paralysis", ailmentChance: 100 });
const freeze = move({ name: "freeze-move", class: "status", accuracy: 100, ailment: "freeze", ailmentChance: 100 });

describe("AI status awareness", () => {
  it("prefers the accurate sleep move over the inaccurate one", () => {
    // Hypnosis and Spore both inflict sleep, so the old score (35 + chance*0.25)
    // rated them identically and ignored the 60 vs 100 accuracy gap entirely.
    expect(pick([hypnosis, spore]).idx).toBe(1);
  });

  it("will not waste a status move on a foe that already has a status", () => {
    // Only one non-volatile status is allowed, so this always fails. The old
    // code only zeroed the score when the statuses matched, so a paralyzed foe
    // still drew a Hypnosis that the engine then rejected.
    expect(pick([hypnosis, weakHit], { status: "paralysis" }).idx).toBe(1);
  });

  it("will not waste a status move when the foe already has that status", () => {
    expect(pick([spore, weakHit], { status: "sleep" }).idx).toBe(1);
  });

  it("values sleep above paralysis when both are equally accurate", () => {
    expect(pick([glare, spore]).idx).toBe(1);
  });

  it("treats sleep and freeze as comparable, and both above paralysis", () => {
    // An earlier version of this test asserted sleep > freeze on real-game
    // intuition, which is wrong here: freeze denies turns until a 20% thaw roll
    // succeeds (~5 turns) while sleep lasts 1-3, and this engine has no
    // fire-type thaw to shorten it. So they are scored equal, and the tie is
    // broken by jitter rather than by a ranking nobody can defend.
    const withFreezeFirst = pick([freeze, glare]).idx;
    const withSleepFirst = pick([spore, glare]).idx;
    expect(withFreezeFirst).toBe(0);
    expect(withSleepFirst).toBe(0);
  });

  it("takes the knockout instead of setting up a status", () => {
    expect(pick([spore, tackle], { hp: 1 }).idx).toBe(1);
  });

  it("prefers a reliable sleep move over a weak attack", () => {
    expect(pick([weakHit, spore]).idx).toBe(1);
  });
});

describe("AI move availability", () => {
  const fresh = (moves: MoveDef[]) => ({
    ai: combatant({ name: "AI", side: "ai", moves }),
    foe: combatant({ name: "Foe", side: "player", moves: [] }),
  });

  it("still respects the Choice lock", () => {
    const { ai, foe } = fresh([spore, tackle]);
    ai.lockedMove = 0;
    const b = makeBattle([foe], [ai]);
    expect(withRandom(0.5, () => chooseAiMove(b, "ai"))).toBe(0);
  });

  it("never picks a move with no PP left", () => {
    const { ai, foe } = fresh([spore, tackle]);
    ai.moves[0].pp = 0;
    const b = makeBattle([foe], [ai]);
    expect(withRandom(0.5, () => chooseAiMove(b, "ai"))).toBe(1);
  });

  it("returns a usable index when nothing is usable", () => {
    const { ai, foe } = fresh([spore]);
    ai.moves[0].pp = 0;
    const b = makeBattle([foe], [ai]);
    expect(withRandom(0.5, () => chooseAiMove(b, "ai"))).toBe(0);
  });
});

describe("AI secondary effects on damaging moves", () => {
  // Same power and type, so estimateDamage is identical and only the secondary
  // can break the tie.
  const plain = move({ name: "plain-hit", power: 90 });
  const withPara = move({ name: "shock", power: 90, ailment: "paralysis", ailmentChance: 30 });
  const withFreeze = move({ name: "ice-hit", power: 90, ailment: "freeze", ailmentChance: 10 });
  const withFlinch = move({ name: "bite-hit", power: 90, ailment: "flinch", ailmentChance: 30 });

  it("prefers the move that can also paralyze over an identical plain hit", () => {
    // The old scorer looked only at damage, so Thunder and a same-power move
    // with no effect scored the same and 30% paralysis was invisible.
    expect(pick([plain, withPara]).idx).toBe(1);
  });

  // A/B pair: the plain hit is slightly stronger, so the freeze bonus is the
  // only thing that can tip the choice. Asserting a single winner against equal
  // moves would be meaningless - a tie is the correct outcome there.
  const plain95 = move({ name: "plain-95", power: 95 });

  it("lets the freeze bonus tip a close call when the foe is healthy", () => {
    expect(pick([plain95, withFreeze]).idx).toBe(1);
  });

  it("drops the freeze bonus when the engine would skip it", () => {
    // applyDamageMove only rolls the secondary when target.status === "none",
    // so against a poisoned foe the bonus must vanish and raw power wins.
    expect(pick([plain95, withFreeze], { status: "poison" }).idx).toBe(0);
  });

  it("still values flinch against a statused foe", () => {
    // Flinch is volatile: applyAilment sets it regardless of the foe's status,
    // so it is the one secondary that keeps its worth here.
    expect(pick([plain, withFlinch], { status: "poison" }).idx).toBe(1);
  });

  it("does not let a weak secondary outrank a much stronger hit", () => {
    const strong = move({ name: "slam", power: 150 });
    expect(pick([withPara, strong]).idx).toBe(1);
  });
});

describe("AI accuracy on damaging moves", () => {
  it("prefers a reliable attack over an equally strong inaccurate one", () => {
    // Same power, so the damage estimate is identical; only accuracy separates
    // them. estimateDamage does not model the miss, so without this a 70%
    // Thunder and a 100% Thunderbolt of equal power scored the same.
    const accurate = move({ name: "thunderbolt", power: 90, accuracy: 100 });
    const risky = move({ name: "thunder", power: 90, accuracy: 70 });
    expect(pick([risky, accurate]).idx).toBe(1);
  });

  it("prefers the reliable knockout when two moves both KO", () => {
    // Both finish the foe, so both scored a flat 1000 and jitter decided. A miss
    // costs the entire knockout, so accuracy matters here more than anywhere.
    const sure = move({ name: "water-gun", power: 40, accuracy: 100 });
    const risky = move({ name: "hydro-pump", power: 110, accuracy: 80 });
    expect(pick([risky, sure], { hp: 1 }).idx).toBe(1);
  });
});

describe("AI voluntary switching", () => {
  const weak = move({ name: "hold", power: 20 });
  const strong = move({ name: "smash", power: 120 });

  function battleWith(activeMoves: MoveDef[], benchMoves: MoveDef[], foeOver = {}) {
    // The foe needs a move: one test asserts the switcher eats a hit.
    const foe = combatant({ name: "Foe", side: "player", moves: [weak], ...foeOver });
    const active = combatant({ name: "Active", side: "ai", moves: activeMoves });
    const bench = combatant({ name: "Bench", side: "ai", moves: benchMoves });
    return { b: makeBattle([foe], [active, bench]), active, bench, foe };
  }

  const outOfPP = (c: Combatant) => c.moves.forEach((m) => (m.pp = 0));

  it("does not switch for a better matchup", () => {
    // A switch costs a whole turn, so the upgrade has to beat a free hit. On 30
    // seeded matchups this scored 17/30 (1.5x gap) and 19/30 (3x) against 23/30
    // for never switching, so the AI leaves that judgement alone.
    const { b } = battleWith([weak], [strong]);
    expect(chooseAiSwitch(b, "ai")).toBeNull();
  });

  it("stays in when it can knock the foe out", () => {
    const { b } = battleWith([strong], [strong], { hp: 1 });
    expect(chooseAiSwitch(b, "ai")).toBeNull();
  });

  it("switches out when the active has no usable move left", () => {
    const { b, active } = battleWith([strong], [weak]);
    outOfPP(active);
    expect(chooseAiSwitch(b, "ai")).toBe(1);
  });

  it("will not send in a Pokemon on the edge of fainting", () => {
    const { b, active, bench } = battleWith([weak], [strong]);
    outOfPP(active);
    bench.hp = Math.floor(bench.maxHp * 0.2);
    expect(chooseAiSwitch(b, "ai")).toBeNull();
  });

  it("does not ping-pong: the replacement keeps its turn", () => {
    const { b, active } = battleWith([weak], [strong]);
    outOfPP(active);
    expect(chooseAiSwitch(b, "ai")).toBe(1);
    b.sendIn("ai", 1);
    expect(chooseAiSwitch(b, "ai")).toBeNull();
  });

  it("switching costs the AI its attack, mirroring the player's switch", () => {
    // voluntarySwitch gives the player a free hit and no attack back; the AI
    // must play by the same rule or switching is strictly better for it.
    const { b, active, bench, foe } = battleWith([weak], [strong]);
    outOfPP(active);
    const evts = withRandom(0.5, () => b.runTurn(0, 0));
    const texts = evts.map((e) => ("text" in e ? e.text : ""));
    expect(texts.some((t) => t.includes("withdrew Active and sent out Bench"))).toBe(true);
    expect(foe.hp).toBe(foe.maxHp); // the AI landed nothing
    expect(bench.hp).toBeLessThan(bench.maxHp); // and eats the player's hit
    expect(active.hp).toBe(active.maxHp); // the switcher left before being hit
  });
});
