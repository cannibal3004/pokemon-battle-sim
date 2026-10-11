/**
 * Shared helpers for the Playwright e2e scripts.
 *
 * These drive a real browser against a running dev server. They exist because
 * the unit suite cannot catch integration bugs: a double-KO deadlock that
 * stalled battles at 97 turns passed 20/20 unit tests and was only visible by
 * actually playing a game.
 *
 * Browser resolution: set CHROMIUM_PATH to a browser binary, otherwise
 * Playwright's bundled Chromium is used (npx playwright install chromium).
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

export const BASE = process.env.BASE || "http://localhost:5173/";

/** Species that exist in Generation I, the dex default. */
export const GEN1_TEAM = ["venusaur", "charizard", "squirtle", "pikachu", "snorlax", "gengar"];

export function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
}

/** Console/page errors, so a run can fail on a React error nobody noticed. */
export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
  });
  return errors;
}

/**
 * Start a dev server if BASE is not already answering, so the scripts work from
 * a cold checkout. Returns a stop() to tear it down.
 */
export async function ensureServer() {
  const alive = async () => {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  };
  if (await alive()) return { stop() {} };

  const root = new URL("../../", import.meta.url).pathname;
  const child = spawn("npm", ["run", "dev", "--", "--port", "5173"], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    if (await alive()) return { stop: () => process.kill(-child.pid, "SIGKILL") };
    await new Promise((r) => setTimeout(r, 500));
  }
  process.kill(-child.pid, "SIGKILL");
  throw new Error(`dev server did not come up at ${BASE}`);
}

export async function openLobby(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dex-card", { timeout: 60000 });
  await page.waitForSelector(".ai-card .ai-name", { timeout: 90000 });
}

/**
 * Add one species by exact name.
 *
 * The dex filters by substring, so searching "pidgeot" also matches Pidgeotto.
 * Clicking .first() then silently adds the wrong Pokemon, which once made a
 * mirror-match test pass without testing anything.
 */
export async function addSpecies(page, name) {
  const re = new RegExp(`\\b${name}\\b`, "i");
  await page.locator("input.search").fill(name);
  const card = page.locator(".dex-card", { hasText: re }).first();
  try {
    await card.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    // The list can still be swapping generations; nudge and retry once.
    await page.locator("input.search").fill("");
    await page.waitForTimeout(800);
    await page.locator("input.search").fill(name);
    await card.waitFor({ state: "visible", timeout: 20000 });
  }
  const text = (await card.textContent()).replace(/\s+/g, " ").trim();
  if (!re.test(text)) throw new Error(`search "${name}" selected "${text}"`);
  await card.click();
  await page.locator("button.add-btn").click();
  await page.waitForTimeout(150);
}

export async function buildTeam(page, names) {
  for (const n of names) await addSpecies(page, n);
  const filled = await page.locator(".team-slot.filled").count();
  if (filled !== names.length) {
    throw new Error(`team has ${filled}/${names.length} slots filled`);
  }
}

export async function startBattle(page) {
  const start = page.locator("button.start-btn");
  await start.waitFor({ timeout: 90000 });
  const label = (await start.textContent()) || "";
  if (label.toLowerCase().includes("pick")) {
    throw new Error(`start button not ready: "${label.trim()}"`);
  }
  await start.click();
  await page.waitForSelector(".battle-screen", { timeout: 60000 });
}

export async function readTeam(page) {
  return (await page.locator(".slot-name").allTextContents()).map((s) => s.trim());
}

export async function readAiTeam(page) {
  return (await page.locator(".ai-card .ai-name").allTextContents()).map((s) => s.trim());
}

/**
 * Play a battle with random moves until it ends.
 *
 * `stallLimit` is the real deadlock detector: the log stops growing while turns
 * keep advancing, which is exactly how the double-KO bug showed up.
 */
export async function playBattle(page, { maxTurns = 200, stallLimit = 8 } = {}) {
  let turns = 0;
  let switches = 0;
  let stalled = 0;
  let lastLog = 0;
  let result = null;

  for (let i = 0; i < maxTurns * 3; i++) {
    if (await page.locator(".result-overlay").count()) {
      result = (await page.locator(".result-panel").innerText())
        .replace(/\n+/g, " | ")
        .trim();
      break;
    }

    const picks = page.locator(".switch-picker .team-pick:not([disabled])");
    if (await picks.count()) {
      await picks.first().click();
      switches++;
      await page.waitForTimeout(1200);
      continue;
    }

    const moves = page.locator(".move-btn:not([disabled])");
    if (await moves.count()) {
      await moves.nth(Math.floor(Math.random() * (await moves.count()))).click();
      turns++;
      await page.waitForTimeout(1600);
    } else {
      await page.waitForTimeout(600);
    }

    const lines = await page.locator(".log *").count();
    if (lines === lastLog) {
      if (++stalled >= stallLimit) return { turns, switches, result, stalled: true };
    } else {
      stalled = 0;
    }
    lastLog = lines;
  }
  return { turns, switches, result, stalled: false };
}

/**
 * Wait until the battle is accepting input again.
 *
 * A turn replays its event stream with per-event delays, so the phase stays
 * "animating" for a second or more after a click. Pressing a key during that
 * window is silently ignored, which once looked like a broken shortcut.
 */
export async function waitForActionable(page, timeout = 30000) {
  await page
    .locator(".move-btn:not([disabled])")
    .first()
    .waitFor({ state: "visible", timeout });
}
