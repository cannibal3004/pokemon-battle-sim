/**
 * Tiny persisted settings store.
 *
 * Deliberately not React context: the audio layer needs to read the mute flag
 * from outside the component tree, and a hook would force a provider around
 * everything that plays a cry. Subscribers let components re-render on change.
 */

export interface Settings {
  muted: boolean;
}

const KEY = "pkmn-battle-sim:settings";
const DEFAULTS: Settings = { muted: false };

type Listener = (s: Settings) => void;

const listeners = new Set<Listener>();

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private mode or corrupt JSON: fall back to defaults rather than throwing
    // during module init, which would take the whole app down.
    return { ...DEFAULTS };
  }
}

let current: Settings = read();

function persist(next: Settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the setting still works for this session.
  }
}

export function getSettings(): Settings {
  return current;
}

export function isMuted(): boolean {
  return current.muted;
}

export function setMuted(muted: boolean) {
  if (current.muted === muted) return;
  current = { ...current, muted };
  persist(current);
  listeners.forEach((l) => l(current));
}

export function toggleMuted() {
  setMuted(!current.muted);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
