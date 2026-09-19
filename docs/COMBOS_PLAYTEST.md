# Hidden combination verification — 0.2.7

The combinations are intentionally undocumented in player-facing instructions. Each requires one completed upgrade path per character; other paths remain optional. First activation celebrates discovery without explaining its recipe.

Automated tests cover exact prerequisites, cooldowns, bounded ricochets, boss scaling, cross-player ownership, and serialization. Progression checks start with normal currency and earn upgrades through play. The browser check imports earned round-70 armies, executes round 71, checks effects, and verifies that upgrade panels and the field guide do not reveal the combinations.

```bash
npm test
npm run test:combos
npm run test:combos-coop
npm run test:berry-combo
PLAYTEST_URL=http://127.0.0.1:5175 npm run test:combos-browser
PLAYTEST_URL=http://127.0.0.1:5175 npm run test:berry-combo-browser
```

Verification: 197 unit/integration tests pass. Both minimum-path solo builds clear round 75 with 100 lives on Meadow. Both co-op builds also clear 75 with 100 lives using separate earned wallets; one co-op army buys optional speed upgrades after completing its core paths. Optional upgrades improve performance without changing eligibility. The third combination also clears 75 with 100 lives using 18 defenders, 1,891 real reactions, and a longest round of 116.25 simulation seconds.

Detailed runs are saved to ignored `playtest-results/` artifacts. Exact records depend on map, placement, timing, and purchases. The previous release’s results used different prerequisites and do not establish this release’s results.
