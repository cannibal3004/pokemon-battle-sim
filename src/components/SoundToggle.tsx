import { useSyncExternalStore } from "react";
import { stopAll } from "../audio";
import { getSettings, isMuted, subscribe, toggleMuted } from "../settings";

/**
 * Mute control for cries, which otherwise play at a fixed volume with no way
 * to silence them. Sits in a corner on both screens and persists across reloads.
 */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribe, isMuted, () => false);

  return (
    <button
      type="button"
      className={`sound-toggle${muted ? " muted" : ""}`}
      aria-pressed={muted}
      aria-label={muted ? "Unmute cries" : "Mute cries"}
      title={muted ? "Cries are muted" : "Cries are on"}
      onClick={() => {
        toggleMuted();
        if (getSettings().muted) stopAll();
      }}
    >
      <span aria-hidden="true">{muted ? "\u{1F507}" : "\u{1F50A}"}</span>
      <span className="sound-label">{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}
