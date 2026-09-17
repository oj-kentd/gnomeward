# Gnomeward

A cozy, original 3D tower defense game made for a parent-and-child playtest. Protect five little gardens from colorful skeletons with six plush gnomes. Built in Three.js with original Blender-created models and portraits.

**Play:** https://oj-kentd.github.io/gnomeward/

## Play locally

Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. `npm test` runs the deterministic gameplay checks; `npm run build` produces the static site in `dist/`.

## How to play

1. Choose a gnome from the sliding avatar row below the map and click the grass beside the trail to place it. Its ring shows attack range. Placement costs gold.
2. Start a wave. Skeleton colors indicate different health and movement speeds. Gnomes attack automatically with small traveling projectiles. Damage, stuns, and on-kill explosions trigger on impact.
3. Earn gold and upgrade points from defeated skeletons and completed waves. Click a placed gnome (including its hat or body) to open a small upgrade popup beside that gnome. Buttons explain how many more points you need.
4. Each standard gnome has four paths with three upgrade levels. One individual gnome can invest in only two different paths. Choose carefully: spent upgrade points are not refunded on selling.
5. Survive 20 waves. Bosses appear at the end of waves 10 and 20. Unlocks persist in this browser and carry into other maps and replays.

| Gnome | Ability | Paths | Unlock |
| --- | --- | --- | --- |
| Sprout | Weak pebble attacks grow dramatically with upgrades; Growing Spirit scales with kills | Power, speed, range, growth; choose two | Starting crew |
| Morel | Places trail mushrooms that poison passing skeletons over time | Venom, duration, planting speed, range; choose two | Starting crew |
| Bramble | Enemies it defeats explode and can cause chain reactions | Power, blast, speed, range; choose two | Starting crew |
| Poppy | Pink gun stuns for 2 seconds before upgrades | Stun duration, speed, power, range; choose two | Defeat wave 10 boss |
| Tumble | Attacks multiple enemies; its single path raises damage, frequency, and targets | One path | Clear wave 15 |
| Aster | Low initial damage and full-map targeting | Damage and shooting speed | Defeat wave 20 boss; usable in replays |

The wave 15 and wave 20 unlocks are initial playtest defaults. Selling returns 75% of the purchase gold. Standard targeting prioritizes the skeleton farthest along the path. Bosses that escape do not grant boss-defeat unlocks. Map changes start a fresh run while retaining unlocked characters.

**Controls:** Click/tap to select and place; Escape or right-click cancels; Space starts the next wave; P pauses; 1–6 select gnomes. Speed cycles 1× / 2× / 3×. Sound is optional and synthesized locally. No sign-in or server is needed.

## Five gardens

- Mossy Meadow — a forgiving introductory trail.
- Amber Orchard — a long winding route for overlapping coverage.
- Moonlit Creek — a turning riverside path.
- Crystal Quarry — shorter attack windows and angular corners.
- Pumpkin Hollow — a compact spiral with a final straight.

## Art and development

`art/generate_assets.py` creates every world mesh, character, prop, projectile, range ring, and rendered portrait in Blender. `art/gnomeward.blend` is the editable source scene. See [the art notes](art/README.md) for regeneration. The browser arranges those exported meshes into maps and animates them; interface typography and controls use HTML/CSS.

- `src/data.js`: maps, characters, enemy colors, and tuning.
- `src/game.js`: deterministic simulation, upgrades, damage, unlocks.
- `src/renderer.js`: Three.js scene, imported models, selection and effects.
- `src/ui.js` / `src/style.css`: interface and responsive controls.
- `tests/game.test.js`: gameplay regression checks.

Original art and game presentation take inspiration from the supplied plush-gnome reference. No Bloons assets or code are included. The project was built with separate gameplay, Blender art, and interface agents, then integrated and tested together.

## Browser checks

With the development server running in another terminal:

```sh
npx playwright install chromium
npm run test:browser
```

The browser smoke test places gnomes through the UI, checks pause, advances combat for upgrade checks, verifies the two-path lock, switches through all five maps, and checks the phone layout and console errors. Screenshots are saved in `playtest-results/`. Set `PLAYTEST_URL` to test a published site, or `CHROMIUM_PATH` to use a specific Chromium executable.

## Publishing

GitHub Actions tests and builds every push to `main`, then deploys `dist/` to GitHub Pages. Repository Settings → Pages must use **GitHub Actions** as its build source. Relative asset paths support the `/gnomeward/` project URL.

## Playtest notes

This is an initial playable prototype. Balance is provisional. Unlocks are stored on the current browser/device; active runs are not saved on reload. A modern browser with WebGL 2 is required. Desktop and tablet offer the most room for the battlefield; phone layouts stack controls below it.

Useful feedback: map, wave, gnome combination, whether the game felt too easy or too hard, and any unexpected behavior. File issues at https://github.com/oj-kentd/gnomeward/issues.
