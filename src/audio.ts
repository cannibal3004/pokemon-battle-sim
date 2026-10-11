import { isMuted } from "./settings";

const active = new Set<HTMLAudioElement>();

/** Stops every in-flight cry; used when the player mutes mid-battle. */
export function stopAll() {
  for (const audio of active) {
    audio.pause();
    audio.src = "";
  }
  active.clear();
}

/**
 * Cries are the only audio in the game and there is no other way to silence
 * them, so the mute flag is read at play time rather than at module load.
 */
export function playCry(url: string) {
  if (!url || isMuted()) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.45;
    const done = () => {
      active.delete(audio);
      audio.src = "";
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    active.add(audio);
    void audio.play().catch(() => {
      active.delete(audio);
    });
  } catch {
    // autoplay blocked or unsupported — ignore
  }
}
