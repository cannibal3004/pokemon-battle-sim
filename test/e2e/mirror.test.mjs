/**
 * Picking a species the challenger team already holds must not create a mirror
 * match: the colliding challenger slot gets swapped for something else.
 * Run: node test/e2e/mirror.test.mjs
 */
import {
  addSpecies,
  ensureServer,
  launch,
  openLobby,
  readAiTeam,
  readTeam,
  watchErrors,
} from "./helpers.mjs";

const server = await ensureServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = watchErrors(page);

let failed = false;
try {
  await openLobby(page);
  const before = await readAiTeam(page);
  console.log("[info] challenger team:", before.join(", "));

  // Steal one of the challenger's species on purpose.
  const target = before[2];
  await addSpecies(page, target);
  // The repair swaps a slot, which needs a fetch to land.
  await page.waitForTimeout(3000);

  const after = await readAiTeam(page);
  const mine = await readTeam(page);
  console.log("[info] player team:    ", mine.join(", "));
  console.log("[info] challenger after:", after.join(", "));

  const overlap = after.filter((n) => mine.includes(n));
  if (overlap.length) {
    console.log(`[FAIL] mirror match on: ${overlap.join(", ")}`);
    failed = true;
  } else {
    console.log("[ok] no species appears on both teams");
  }

  if (after.includes(target)) {
    console.log(`[FAIL] challenger still holds the stolen species (${target})`);
    failed = true;
  } else {
    console.log(`[ok] challenger slot that held ${target} was replaced`);
  }
} catch (e) {
  console.log("[FAIL]", e.message.split("\n")[0]);
  failed = true;
}

if (errors.length) {
  console.log(`[FAIL] ${errors.length} JS error(s):`);
  errors.slice(0, 5).forEach((e) => console.log("   " + e));
  failed = true;
}

console.log(`\n${failed ? "FAIL" : "PASS"} mirror.test.mjs`);
await browser.close();
server.stop();
process.exit(failed ? 1 : 0);
