/**
 * Checks the UX affordances: the mute toggle, keyboard battle controls, and
 * that the small-screen layout does not overflow horizontally.
 * Run: node test/e2e/ux.test.mjs
 */
import {
  BASE,
  GEN1_TEAM,
  buildTeam,
  ensureServer,
  launch,
  openLobby,
  startBattle,
  waitForActionable,
  watchErrors,
} from "./helpers.mjs";

const server = await ensureServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = watchErrors(page);
let failed = false;
const check = (ok, label) => {
  console.log(`${ok ? "[ok]  " : "[FAIL]"} ${label}`);
  if (!ok) failed = true;
};

try {
  await openLobby(page);

  // --- mute toggle -------------------------------------------------------
  const toggle = page.locator(".sound-toggle");
  check((await toggle.count()) === 1, "sound toggle is rendered");
  const before = await toggle.getAttribute("aria-pressed");
  await toggle.click();
  await page.waitForTimeout(200);
  const after = await toggle.getAttribute("aria-pressed");
  check(before !== after, `mute toggles aria-pressed (${before} -> ${after})`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sound-toggle", { timeout: 30000 });
  const persisted = await page.locator(".sound-toggle").getAttribute("aria-pressed");
  check(persisted === after, "mute choice survives a reload");
  await page.locator(".sound-toggle").click();
  await page.waitForTimeout(200);

  // --- keyboard controls -------------------------------------------------
  await buildTeam(page, GEN1_TEAM);
  await startBattle(page);
  await page.waitForSelector(".move-btn", { timeout: 30000 });
  await page.waitForTimeout(3600); // let the intro finish

  check(
    (await page.locator(".move-btn .key-hint").count()) > 0,
    "move buttons show their key hint",
  );

  const logBefore = await page.locator(".log *").count();
  await page.keyboard.press("1");
  // The turn replays events with delays; keys are ignored until it settles.
  await waitForActionable(page);
  const logAfter = await page.locator(".log *").count();
  check(logAfter > logBefore, `pressing "1" takes a turn (${logBefore} -> ${logAfter} log lines)`);

  await page.keyboard.press("s");
  await page.waitForTimeout(500);
  const pickerOpen = (await page.locator(".switch-picker").count()) > 0;
  check(pickerOpen, 'pressing "S" opens the switch picker');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check(
    (await page.locator(".switch-picker").count()) === 0,
    "Escape closes the switch picker",
  );

  // --- small-screen layout ----------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 1, `no horizontal overflow at 390px (excess ${overflow}px)`);
  const moveVisible = await page.locator(".move-btn").first().isVisible();
  check(moveVisible, "move buttons still reachable on a phone viewport");
} catch (e) {
  console.log("[FAIL]", e.message.split("\n")[0]);
  failed = true;
}

if (errors.length) {
  console.log(`[FAIL] ${errors.length} JS error(s):`);
  errors.slice(0, 5).forEach((e) => console.log("   " + e));
  failed = true;
} else {
  console.log("[ok]   no JS errors");
}

console.log(`\n${failed ? "FAIL" : "PASS"} ux.test.mjs (${BASE})`);
await browser.close();
server.stop();
process.exit(failed ? 1 : 0);
