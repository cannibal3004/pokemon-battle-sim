/**
 * Measures lobby load cost with an empty cache vs a warm one, using a single
 * persistent browser context. Creating a fresh page per measurement would give
 * each run an empty localStorage and make the warm run meaningless.
 * Run: node test/e2e/perf.mjs
 */
import { BASE, ensureServer, launch } from "./helpers.mjs";

const server = await ensureServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let requests = 0;
const tally = {};
page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("pokeapi.co")) return;
  requests++;
  const kind = url.split("/api/v2/")[1]?.split("?")[0].split("/")[0] ?? "?";
  tally[kind] = (tally[kind] || 0) + 1;
});

async function load(label) {
  requests = 0;
  for (const k of Object.keys(tally)) delete tally[k];
  const t0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dex-card", { timeout: 60000 });
  await page.waitForSelector(".ai-card .ai-name", { timeout: 90000 });
  const ms = Date.now() - t0;
  const keys = await page.evaluate(() => Object.keys(localStorage).length);
  console.log(
    `[${label}] ${ms}ms | pokeapi requests=${requests} | cached keys=${keys} | ${JSON.stringify(tally)}`,
  );
  return { ms, requests };
}

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
const cold = await load("cold");
const warm = await load("warm");
const warm2 = await load("warm again");

const saved = ((1 - warm.requests / cold.requests) * 100).toFixed(0);
console.log(
  `\n[result] cold ${cold.requests} req / ${cold.ms}ms -> warm ${warm.requests} req / ${warm.ms}ms ` +
    `(${saved}% fewer requests)`,
);
console.log(
  "[note] warm requests do not reach zero: the challenger team is rolled anew " +
    "each load, so its movesets are genuinely uncached.",
);

await browser.close();
server.stop();
