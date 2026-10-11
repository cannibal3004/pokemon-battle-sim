/**
 * localStorage-backed cache for raw PokeAPI responses.
 *
 * The in-memory cache in api/pokeapi only helps within one page load, and a
 * single lobby visit costs ~70 requests (six AI Pokemon plus one fetch per
 * level-up move). Persisting the raw JSON makes a repeat visit nearly instant.
 * Everything degrades silently to "no cache" when storage is unavailable
 * (private mode, quota exceeded).
 */

const NAMESPACE = "pkmn-battle-sim:v1:";
/** Rough budget in characters; entries are evicted oldest-first past this. */
const MAX_CHARS = 3_000_000;

let index: string[] | null = null;
let bytes = 0;
let available = true;

function store(): Storage | null {
  if (!available) return null;
  try {
    const s = window.localStorage;
    const probe = `${NAMESPACE}__probe__`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    available = false;
    return null;
  }
}

function loadIndex(s: Storage): string[] {
  if (index) return index;
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(NAMESPACE)) keys.push(k);
    }
  } catch {
    available = false;
  }
  index = keys;
  return keys;
}

/** Insertion order is a cheap stand-in for LRU and costs nothing to track. */
function evictTo(s: Storage, limit: number) {
  const keys = loadIndex(s);
  while (bytes > limit && keys.length > 0) {
    const victim = keys.shift();
    if (!victim) break;
    const len = (s.getItem(victim) ?? "").length;
    try {
      s.removeItem(victim);
      bytes -= len;
    } catch {
      available = false;
      break;
    }
  }
}

export function getCached<T>(key: string): T | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(NAMESPACE + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function setCached(key: string, value: unknown): void {
  const s = store();
  if (!s) return;
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return;
  }
  const full = NAMESPACE + key;
  try {
    const prev = s.getItem(full);
    if (prev !== null) bytes -= prev.length;
    evictTo(s, MAX_CHARS - raw.length);
    s.setItem(full, raw);
    bytes += raw.length;
    loadIndex(s).push(full);
  } catch {
    // Almost certainly quota: drop what we wrote and carry on uncached.
    try {
      loadIndex(s).forEach((k) => s.removeItem(k));
      bytes = 0;
      index = [];
    } catch {
      /* ignore */
    }
  }
}

/** Removes every entry this app wrote. Returns how many were dropped. */
export function clearCache(): number {
  const s = store();
  if (!s) return 0;
  const keys = loadIndex(s);
  keys.forEach((k) => {
    try {
      s.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  bytes = 0;
  index = [];
  return keys.length;
}
