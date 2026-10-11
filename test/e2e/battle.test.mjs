/**
 * Plays a full battle end to end and fails if it stalls or throws.
 * Run: node test/e2e/battle.test.mjs
 */
import {
  BASE,
  GEN1_TEAM,
  buildTeam,
  ensureServer,
  launch,
  openLobby,
  playBattle,
  startBattle,
  watchErrors,
} from "./helpers.mjs";

const server = await ensureServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = watchErrors(page);

let failed = false;
try {
  await openLobby(page);
  console.log("[ok] lobby loaded");

  await buildTeam(page, GEN1_TEAM);
  console.log("[ok] team of 6 built");

  await startBattle(page);
  console.log("[ok] battle started");

  const { turns, switches, result, stalled } = await playBattle(page);
  console.log(`[info] turns=${turns} forced switches=${switches}`);

  if (stalled) {
    console.log("[FAIL] battle stalled: the log stopped growing while turns advanced");
    failed = true;
  } else if (!result) {
    console.log("[FAIL] battle hit the turn cap with no result");
    failed = true;
  } else {
    console.log(`[ok] result: ${result}`);
  }
} catch (e) {
  console.log("[FAIL]", e.message.split("\n")[0]);
  failed = true;
}

if (errors.length) {
  console.log(`[FAIL] ${errors.length} JS error(s):`);
  errors.slice(0, 5).forEach((e) => console.log("   " + e));
  failed = true;
} else {
  console.log("[ok] no JS errors");
}

console.log(`\n${failed ? "FAIL" : "PASS"} battle.test.mjs (${BASE})`);
await browser.close();
server.stop();
process.exit(failed ? 1 : 0);
