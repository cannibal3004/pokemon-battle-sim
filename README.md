# Pokémon Battle Arena

A web-based 1v1 Pokémon battle arena powered entirely by [PokeAPI](https://pokeapi.co/docs/v2). Pick a fighter from the Kanto dex, load it out with a held item, and battle a random challenger controlled by a simple AI.

Built with **Vite + React + TypeScript**.

## Features

- **Lobby** — search the 151-species Kanto dex by name or number, pick a level (20–100), choose a held item, and reroll your random challenger
- **Authentic-ish combat** — the real damage formula (STAB, type effectiveness, critical hits, accuracy, stat stage multipliers), burn/paralysis/poison with end-of-turn damage, flinch, PP tracking, move recoil and drain, priority moves, and speed-based turn order (paralysis halves speed)
- **Abilities** — Overgrow/Blaze/Swarm, Levitate, Thick Fat, Guts, Intimidate, Sturdy, Multiscale, Magic Guard (other abilities pass through harmlessly)
- **Items** — Choice Band / Choice Specs (move lock), Life Orb, Focus Sash, Leftovers, Eviolite (evolution-aware), Assault Vest (blocks status moves)
- **AI opponent** — picks moves by expected damage with KO detection and a little randomness
- **Gameboy-style presentation** — pokeball sendout animation, back sprite for your Pokémon, animated Gen 5 sprites, HP bars with color states, stat stage readouts, battle log, floating damage numbers, and Pokémon cries on sendout and faint (volume 0.45)
- **Rematch / New Opponent / Change Team** between battles

## Getting started

Prerequisites: Node.js 20+.

```sh
npm install
npm run dev        # start dev server (default: http://localhost:5173)
```

Other scripts:

```sh
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
```

No API keys or environment variables are needed — PokeAPI is open and read-only. All responses are cached in memory for the session (per their [fair use policy](https://pokeapi.co/docs/v2#fair-use-policy)).

## Project structure

```
src/
  api/          PokeAPI client (fetch + in-memory cache) and response types
  data/         type effectiveness chart, Pokémon/moveset building, natures
  battle/       game logic, framework-free:
    types.ts      shared types (moves, combatants, battle events)
    stats.ts      stat formulas, natures, stage multipliers
    damage.ts     damage formula + AI damage estimation
    abilities.ts  implemented ability definitions
    items.ts      item definitions and effects
    engine.ts     turn resolution: order, moves, statuses, residuals, faints
    ai.ts         CPU move selection
  hooks/
    useBattle.ts  plays engine events back as UI state (HP, log, FX, phase)
  components/   Lobby (dex + setup) and BattleScreen (arena, moves, log)
  audio.ts      Pokémon cry playback
```

## Design notes

- The battle engine is a pure TypeScript state machine that emits an event stream (`announce`, `damage`, `stat-change`, `faint`, ...); the React layer only renders and animates events, so the rules are testable in isolation.
- Movesets are auto-picked from each Pokémon's level-up learnset: up to 3 damaging moves (STAB first) plus 1 status move. Moves whose effects can't be modeled (Last Resort, Fling, Copycat, ...) are excluded.
- Cry audio comes from the PokeAPI cries repo (`cries/pokemon/latest/{id}.ogg`) and is gated on user interaction per browser autoplay rules.

### Known simplifications

- No sleep/freeze/toxic (poison is modeled as regular poison)
- No weather, terrain, or multi-hit moves
- Charge moves (Solar Beam, Hyper Beam, ...) fire immediately with no recharge turn
- Single-Pokemon battles — no switching
