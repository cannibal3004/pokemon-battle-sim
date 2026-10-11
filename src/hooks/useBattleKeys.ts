import { useEffect } from "react";
import type { BattleView } from "./useBattle";

interface Handlers {
  view: BattleView;
  chooseMove: (i: number) => void;
  chooseSwitch: (i: number) => void;
  openSwitch: () => void;
  cancelSwitch: () => void;
  /** Move indices the player may currently use, so keys cannot bypass PP/Choice locks. */
  moveEnabled: (i: number) => boolean;
  teamSize: number;
}

/**
 * Number keys drive the battle: 1-4 pick moves, S opens the switch picker,
 * Esc cancels it, and 1-6 pick a replacement while switching.
 *
 * Keys are mapped through the same enabled checks as the buttons, so a
 * shortcut can never do something the UI would have refused.
 */
export function useBattleKeys({
  view,
  chooseMove,
  chooseSwitch,
  openSwitch,
  cancelSwitch,
  moveEnabled,
  teamSize,
}: Handlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }

      const digit = Number(e.key) - 1;
      const isDigit = Number.isInteger(digit) && digit >= 0;

      if (e.key === "Escape") {
        if (view.phase === "switching" && !view.mustSwitch) {
          e.preventDefault();
          cancelSwitch();
        }
        return;
      }

      if (view.phase === "switching") {
        if (isDigit && digit < teamSize) {
          const member = view.team.player[digit];
          if (member && !member.fainted && digit !== view.activeIdx.player) {
            e.preventDefault();
            chooseSwitch(digit);
          }
        }
        return;
      }

      if (view.phase !== "choosing") return;

      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        openSwitch();
        return;
      }

      if (isDigit && moveEnabled(digit)) {
        e.preventDefault();
        chooseMove(digit);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, chooseMove, chooseSwitch, openSwitch, cancelSwitch, moveEnabled, teamSize]);
}
