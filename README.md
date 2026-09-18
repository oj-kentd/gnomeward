# Gnomeward

A cozy, original 3D tower defense game made for a parent-and-child playtest. Protect seven little gardens from colorful skeletons with ten plush gnomes, including three hidden friends and a Strawberry Fields reward. Built in Three.js with original Blender-created models and portraits.

**Play:** http://gnomeward.thekents.org/

The welcome screen features an original Blender garden battle and a handmade wooden Gnomeward sign, with desktop and portrait artwork. Choose **Play solo** or **Play co-op** to load the game. Reloading during an active co-op session reconnects automatically. `npm run test:splash` checks the landing screen, keyboard entry, responsive layouts, and loading recovery.

## Play locally

Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. `npm test` runs the deterministic gameplay checks; `npm run build` produces the static site in `dist/`.

## How to play

1. Choose a gnome from the sliding avatar row overlaid along the bottom of the battlefield and click the grass beside the trail to place it. Its ring shows attack range. Placement costs gold. The compact shop can be hidden with **Hide ▾** and reopened with **Show ▴** to expose more of the battlefield.
2. Start a wave. Skeleton colors indicate different health and movement speeds. Gnomes attack automatically with small traveling projectiles. Damage, slows, and on-kill explosions trigger on impact.
3. Earn gold and upgrade points from defeated skeletons and completed waves. Click a placed gnome (including its hat or body) to open a small upgrade popup beside that gnome. The popup shows tier progress, the next stat changes, and how many more points you need.
4. Each standard gnome has four paths with three upgrade levels. One individual gnome can invest in only two different paths. Choose carefully: spent upgrade points are not refunded on selling.
5. Survive 20 waves. Bosses appear at the end of waves 10 and 20. Unlocks persist in this browser and carry into other maps and replays.
6. After victory, choose **Continue in endless mode** to keep your defense, upgrades, gold, points, and remaining lives. Rounds keep growing tougher until you lose. Your highest fully cleared round is saved per garden in this browser and shown on the results screen and map cards. Losing during round 25 records round 24. Auto rounds also works in endless mode; victory always waits for your choice.

| Gnome | Ability | Paths | Unlock |
| --- | --- | --- | --- |
| Sprout | Weak pebble attacks grow dramatically with upgrades; Growing Spirit scales with kills | Power, speed, range, growth; choose two | Starting crew |
| Morel | Places poison mushrooms; Wild Garden upgrades let poisoned skeletons infect neighbors | Venom, duration, planting speed, range/spread; choose two | Starting crew |
| Bramble | Enemies it defeats explode and can cause chain reactions | Power, blast, speed, range; choose two | Starting crew |
| Poppy | Pink gun slows enemies by 50% for 2 seconds; repeated hits refresh without stacking | Slow duration, speed, power, range; choose two | Defeat wave 10 boss |
| Tumble | Attacks multiple enemies; its single path raises damage, frequency, and targets | One path | Clear wave 15 |
| Aster | Low initial damage and full-map targeting | Damage and shooting speed | Defeat wave 20 boss; usable in endless mode and replays |
| Orbit | Pulls skeletons backward with temporary black holes; Event Horizon tier 3 captures them and deals 65 damage/second | Power, duration, radius, recovery; choose two | Three hidden moonstones in Mossy Meadow |
| Prism | Raises breakable path barriers; Shattering Light adds explosions when enemies destroy them | Durability, blast, speed, range; choose two | Three special crystals in Crystal Quarry; first summon is free |
| Morrow | Spell kills summon reborn gnomes from the cottage to march up the trail and battle skeletons | Reborn Champions, Soul Procession, Gravecraft; choose two of three | A hidden puzzle in Pumpkin Hollow |

The wave 15 and wave 20 unlocks are initial playtest defaults. Selling returns 75% of the purchase gold; the free summoned Prism sells for zero. Shooting gnomes can target First (closest to the exit), Last (farthest from the exit), Strong (highest maximum health), or Close (nearest). Tap the targeting button in their upgrade popup to cycle modes. Morel plants mushrooms, Orbit opens wells, and Prism raises barriers automatically. Bosses that escape do not grant boss-defeat unlocks. Map changes start a fresh run while retaining unlocked characters.

**Controls:** Click/tap to select and place; Escape or right-click cancels; Space or the green play button starts the next wave, resumes a paused wave, or cycles speed during combat; P pauses; 1–9 select gnomes. Speed cycles 1× / 2× / 3×. Auto rounds optionally starts the next wave after a three-second building break. Pause and open menus freeze that countdown. The first wave always waits for you. Open **☰ → Music**, or the **♪** button on desktop, to choose **Rock**, **Chill**, or **Jazz**. Each is an original 8-bar instrumental loop, with an independent volume slider and Off option. Music stays at its normal tempo at every game speed and pauses when the tab is hidden. Your genre, volume, and effects preference are saved in this browser; saved music resumes after your first interaction. Sound effects have their own Effects switch. No sign-in or server is needed.

Morel’s **Wild Garden** path unlocks contagious poison at tier 1. A directly poisoned skeleton can infect 1 / 2 / 3 nearby skeletons at tiers 1 / 2 / 3, one per second, over a wider radius each tier. Spread poison deals 65% of the original damage and inherits its remaining duration. Secondary infections cannot spread again or refresh an existing infection. Small green spores show each transmission.

## Endless mode

Rounds after 20 increase enemy health, movement speed, and damage to reborn helpers and crystal barriers. Stronger skeleton colors become more common, with returning bosses every five rounds and Skeleton Kings every ten. Crowd size is bounded for browser performance while enemy strength keeps increasing. Clearing rounds still awards gold and upgrade points. Records save after every clear, survive restarts and reloads, and never decrease; the active run itself is not saved.

## Hidden garden friends

Tap three distinct unusual details in one run of Mossy Meadow or Crystal Quarry to meet a hidden gnome. Repeated taps on the same detail do not count. The resulting character unlock is saved in this browser and stays available on every map. Completing the Quarry discovery summons one Prism on nearby clear grass for free; this reward can only be claimed once per saved profile.

Orbit matches the original plush reference: grey hat, red plaid body, white beard and red pompom. Its wells tug enemies backward along the path. Lesser wells release an enemy once it reaches their center; Event Horizon tier 3 holds it briefly while dealing heavy damage over time. Stronger and longer-lasting wells have longer cooldowns, with at least five seconds of recovery after a well closes. Overlapping wells do not stack pull or damage; bosses resist the pull. Holes vanish when their owner is sold or the round ends.

Prism raises up to two crystal barriers ahead of enemies. Skeletons stop to attack them; tougher skeletons break them faster. Upgrading Shattering Light adds area damage when enemies destroy a barrier. Expiration, selling and round cleanup do not trigger an explosion.

Pumpkin Hollow hides a more involved puzzle for Morrow. Its cottage holds a clue. The unlock persists like the other hidden guardians; partial puzzle progress resets when changing gardens. Morrow costs 300 gold after unlocking.

Morrow’s spell kills gather souls at the cottage. Reborn helpers emerge from the door, walk around the cottage, and follow the trail backward to meet skeletons. They fight in melee and can be defeated. On maps with two entrances, each helper follows the route of the skeleton that supplied its soul, and shared trails let helpers intercept either group. Reborn Champions improves helper health and damage; Soul Procession improves marching speed, dispatch rate, and the active-helper limit; Gravecraft strengthens Morrow’s own attacks. Choose two of the three paths, each with three tiers. Souls wait if the active-helper limit is full. Helper kills earn normal rewards and credit Morrow but cannot summon more helpers. Helpers and waiting souls clear when their owner is sold or the round ends.

Morrow, the reborn helper, and the Hollow puzzle props are generated by `art/generate_necromancer.py`, with editable source in `art/necromancer.blend`. The puzzle solution is intentionally not included here.

The other secret models and portraits are generated in Blender with `art/generate_secret_assets.py`; `art/secrets.blend` is the editable scene. Exact discovery locations are intentionally left out of this guide.

## Six gardens

- Mossy Meadow — a forgiving introductory trail.
- Amber Orchard — a figure-eight route that revisits its junctions.
- Moonlit Creek — two riverbank entrances merge into one winding trail.
- Crystal Quarry — shorter attack windows and angular corners.
- Pumpkin Hollow — an outer circuit curls into an inner spiral.
- Twinbrook Crossing — two opposite entrances meet before a final zigzag.

Green arrows mark every entrance. Enemies alternate between the two entrances on Creek and Twinbrook. Shared trail mushrooms, gravity wells, and crystal barriers affect enemies from either entrance. Loops are finite routes; skeletons eventually head for the cottage.

## Multiplayer server for Unraid

The main game now supports two-player online co-op through its Co-op button: create a lobby or join a waiting gardener. Both players defend one garden, own their gnomes, spend their own gold and points, and press Ready together for each round. Cyan rings mark your gnomes and amber rings mark your teammate’s. The host controls speed; either player can pause. Menus do not pause the other player. Follow the **[Unraid and existing Cloudflare Tunnel setup guide](docs/UNRAID.md)** to load the published image, mount its data folder, and add a hostname to an existing tunnel. The default service is `https://multiplayer.lightsoutphotos.com`; use server version 0.2.1 or newer. The service root retains its connection diagnostic. PvP remains backend-only for now. Solo progress stays separate; leaving co-op restores your previous solo garden, paused.

Run it locally with `npm run server`, then open `http://localhost:2567/`. Match results are stored in `server-data/results.json` by default. `npm test` includes authoritative multiplayer and real WebSocket integration tests; with the server running, `npm run test:server-browser` checks the desktop/phone connection page. See the [server protocol](server/PROTOCOL.md) for client integration and current rules.

## Art and development

`art/generate_assets.py` creates the original characters, enemies, effects, and portraits. `art/generate_environment.py` creates the matching rounded toy scenery: soft foliage, pebbles, curved-roof cottage, garden props, and pillowy path stones. `art/environment.blend` and `art/gnomeward.blend` are editable source scenes. `art/generate_entry_arrow.py` creates the entrance markers. See [the art notes](art/README.md) for regeneration. The browser arranges those exported meshes into maps and animates them; interface typography and controls use HTML/CSS.

- `src/data.js`: maps, characters, enemy colors, and tuning.
- `src/game.js`: deterministic simulation, upgrades, damage, unlocks.
- `src/music.js`: lazy-loaded looping playback and audio controls.
- `src/renderer.js`: Three.js scene, imported models, selection and effects.
- `src/ui.js` / `src/style.css`: interface and responsive controls.
- `tests/game.test.js`: gameplay regression checks.

Original art and game presentation take inspiration from the supplied plush-gnome reference. No Bloons assets or code are included. The project was built with separate gameplay, Blender art, and interface agents, then integrated and tested together.

## Original music

Three short tracks are included in `public/audio/`: **Pompom Patrol** (Rock), **Mosslight Afternoon** (Chill), and **The Mushroom Club** (Jazz). They were composed and synthesized for Gnomeward without third-party recordings or samples. See [music notes](art/MUSIC.md) for track details, validation and regeneration with `scripts/generate_music.py`. Combined download size is about 2.8 MB; only selected tracks are loaded. Music is off until you choose a genre on your first visit.

## Browser checks

With the development server running in another terminal:

```sh
npx playwright install chromium
npm run test:browser
npm run test:music
npm run test:secrets
npm run test:maps
npm run test:poison
npm run test:necro
npm run test:endless
```

The browser smoke test places gnomes through the UI, checks pause, targeting, speed and automatic rounds, advances combat for upgrade checks, verifies the two-path lock, switches through all seven maps, and checks the phone layout and console errors. The music browser check exercises all three decoded loops, output levels, independent effects/volume, tab suspension, saved preferences and phone settings. Additional browser checks verify hidden unlocks and combat effects, all seven maps and entrance markers, Morel’s spread upgrades and animated spores, and Morrow’s hidden unlock, cottage departures, and melee helpers. Screenshots are saved in `playtest-results/`. Set `PLAYTEST_URL` to test a published site, or `CHROMIUM_PATH` to use a specific Chromium executable.

## Publishing

GitHub Actions tests and builds every push to `main`, then deploys `dist/` to GitHub Pages. Repository Settings → Pages must use **GitHub Actions** as its build source. Relative asset paths support the `/gnomeward/` project URL.

## Playtest notes

This is an initial playable prototype. Balance is provisional. Unlocks are stored on the current browser/device; active runs are not saved on reload. A modern browser with WebGL 2 is required. Desktop and tablet offer the most room for the battlefield; phone layouts keep compact controls overlaid on the battlefield.

Useful feedback: map, wave, gnome combination, whether the game felt too easy or too hard, and any unexpected behavior. File issues at https://github.com/oj-kentd/gnomeward/issues.

## Saved future work

The co-op design and implementation status are saved in [docs/COOP_PLAN.md](docs/COOP_PLAN.md). The backend is ready for Unraid setup; the multiplayer game lobby/client and PvP enemy sending remain future work.

### Strawberry Fields

Strawberry Fields has two entrances and one free Strawberry Gnome at the center. His mortar lobs fruit across the map; landing explosions scatter damaging seed projectiles. Choose two of three upgrade paths: **Juicy Payload** (blast damage/radius), **Seed Storm** (seed count, damage, and piercing), and **Quick Harvest** (reload and flight time). Clear all 20 rounds to unlock purchases in other gardens; the free starting gnome gives no sell refund.

In co-op the host owns the free gnome. Clearing the encounter awards Strawberry Gnome to both players’ local solo collections and the server’s shared party collection for future co-op rooms. The party reward persists in `/data/results.json` without accounts. Other co-op unlocks remain scoped to the current run.

Run `npm run test:coop` with a running game and multiplayer server to exercise the complete two-browser co-op flow. Set `VITE_MULTIPLAYER_URL` before starting Vite or building to target another backend.
