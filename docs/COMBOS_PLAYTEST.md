# Sporefire and Prismstorm playtest — 0.2.5

These are deliberate late-game combinations. Existing Orbit/Strawberry and Aster tuning is unchanged.

## Recipes

**Sporefire:** Morel needs Potent Spores 3 + Wild Garden 3. Bramble needs Big Bang 3; Quick Fuse is a useful second path. Mature Morel poison, including its secondary infections, primes enemies for a direct Bramble hit. The burst deals flat damage plus a fraction of maximum enemy health, with a lower fraction against bosses. Every victim shares a short reaction cooldown across all Brambles. Ordinary explosions cannot recursively ignite spores.

**Prismstorm:** Tumble needs Whirling Wonders 3 and a Prism within 7 range with both Diamond Walls 3 + Shattering Light 3. Tumble periodically replaces a flurry with homing crystal shards. Each shard can bounce twice, hitting each victim only once. A destroyed or missing target consumes a hop. Multiple Prisms do not stack the firing cadence. The aura comes from Prism, so a live barrier is not required.

Both recipes appear in the field guide and final-tier upgrades. The first activation announces the combo. Effects use Blender models with separate display caps and reduced-motion behavior. Co-op players can contribute opposite halves.

## Earned-resource results

All complete runs start at wave 1 with normal gold, points, and lives. No currency, damage, health, kills, or upgrades are injected. Purchases and upgrades occur between rounds. Solo returning-collection fixtures preset only the characters required by the recipe; the co-op fixtures start without any unlocks. A limit of 18 defenders is a test constraint, not the game's build limit.

| Solo map | Sporefire: cleared / lives | Prismstorm: cleared / lives |
|---|---:|---:|
| meadow | 75 / 100 | 75 / 100 |
| quarry | 75 / 100 | 75 / 100 |
| crossroads | 75 / 100 | 75 / 100 |
| strawberry | 75 / 85 | 75 / 100 |
| orchard | 75 / 100 | 75 / 100 |
| creek | 75 / 73 | 75 / 100 |
| hollow | 75 / 100 | 75 / 100 |

Pumpkin Hollow's Prismstorm policy includes one inexpensive Sprout covering the outer bend. Without that coverage, early walls can strand a weak enemy outside the inner-spiral attackers' reach. Layout and sensible support still matter.

| Co-op build | Map | Cleared / lives | Longest round |
|---|---|---:|---:|
| sporefire | meadow | 75 / 100 | 63s |
| prismstorm | quarry | 75 / 100 | 61.6s |

Co-op uses actual Match commands, separate 325-gold/0-point starting wallets, ready votes, and endless consent. For Prismstorm, players discover the three Quarry crystals, defend with an earned Sprout/Bramble opening, and recruit Tumble after naturally clearing round 15. Neither co-op collection nor upgrades are preset.

Both combinations also clear 75 on Meadow at 1/30-second and 1/60-second steps. Control armies with the new interactions disabled clear only 23 rounds (Morel/Bramble) and 28 (Tumble/Prism) under the same purchase policy. The strongest extended Sporefire test reached 100 without a loss; 100 was the test stop, not a claimed ceiling.

Exact records vary with layout, targeting, purchases, timing, and defender count. These tests establish that round 70+ is attainable; they do not promise victory with arbitrary placement. The 75-round map sweep's longest round was under two minutes of simulation time; neither combo relies on repeated backward displacement.

## Reproduce

```bash
npm test
npm run test:combos
npm run test:combos-coop
MAPS=meadow,quarry,crossroads,strawberry,orchard,creek,hollow npm run test:combos
STEPS=.03333333333333333,.016666666666666666 npm run test:combos
PLAYTEST_URL=http://127.0.0.1:5175 npm run test:combos-browser
```

The browser test imports fully earned round-70 armies, then executes real round-71 combat for screenshots and visual checks. It also verifies the field guide, selected-unit recipes, phone layout, server snapshot adaptation, co-op motion buffering, visual budgets, reduced motion, and cleanup. Synthetic stress effects are explicitly separate from progression proof. Detailed results and screenshots are written to ignored `playtest-results/` artifacts.
