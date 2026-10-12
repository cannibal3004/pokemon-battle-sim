import { describe, expect, it } from "vitest";
import { chooseAiMove } from "./ai";
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
