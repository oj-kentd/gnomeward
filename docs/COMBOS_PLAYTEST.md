# Hidden combination verification — 0.2.8

The combinations are intentionally undocumented in player-facing instructions. Each requires one completed upgrade path per character; other paths remain optional. First activation celebrates discovery without explaining its recipe.

The full unit/integration suite passes 232 tests. Automated tests cover exact prerequisites, cooldowns, bounded ricochets, boss scaling, cross-player ownership, and serialization. Progression checks start with normal currency and earn upgrades through play. The browser check imports earned round-70 armies, executes round 71, checks effects, and verifies that upgrade panels and the field guide do not reveal the combinations.

```bash
npm test
npm run test:combos
npm run test:combos-coop
npm run test:berry-combo
PLAYTEST_URL=http://127.0.0.1:5175 npm run test:combos-browser
PLAYTEST_URL=http://127.0.0.1:5175 npm run test:berry-combo-browser
```

Verification with the endless enemy traits enabled: the minimum-path solo builds clear 73 (Sporefire) and 75 (Prismstorm) rounds on Meadow. Both co-op builds clear 75 using separate earned wallets, ending with 73 and 100 lives respectively; one co-op army buys optional speed upgrades after completing its core paths. Optional upgrades improve performance without changing eligibility. The third combination clears 75 with 100 lives using 18 defenders, 2,093 real reactions, and a longest round of 122.85 simulation seconds. None of these runs stalls for three minutes.

Indicators are checked separately: only actual participants light up, future buffered activations stay hidden until their simulation time, repeated activations extend the display, and expiry/sale/map reset clean up their resources.

Detailed runs are saved to ignored `playtest-results/` artifacts. Exact records depend on map, placement, timing, and purchases. The previous release’s results used different prerequisites and do not establish this release’s results.
