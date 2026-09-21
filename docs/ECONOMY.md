# Round Coins and permanent purchases

Round Coins are collection currency, separate from the gold used to place gnomes and the points used to upgrade them. Clear any round to earn one coin, including repeated gardens and endless rounds. A round that ends in defeat earns none. The feature starts tracking rewards when this update is played; it does not infer past rewards from best-round records.

| Item | Cost | What persists |
| --- | --- | --- |
| Skeletor Morrow | 100 Round Coins | Necromancer costume ownership; free switching between original and Skeletor |
| Boss Breaker | 50 Round Coins | Permanent 2× damage to bosses from the player's gnomes, poison and reborn guardians |

Buying a costume does not reveal or unlock the hidden necromancer. Neither purchase changes normal enemy damage or the two-path limit. Purchases cannot be bought twice or stacked.

The welcome screen and HUD Shop button open the store. In solo, buying the boss perk takes effect immediately; changing costume also updates existing necromancers and future placements. In co-op, buy/equip before joining a room. Each teammate earns their own full coin per cleared round and their perks apply only to their own defenders. The selected loadout stays fixed through reconnects until leaving the room.

## Save format and co-op boundary

The existing `gnomeward-profile` browser save gains `roundCoins`, `cosmetics`, `equippedNecroSkin`, `bossDamageUnlocked`, and `coopRoundReceipts`. Old saves migrate to an empty shop wallet while retaining their existing unlocks and records. Malformed balances and unknown cosmetic IDs are filtered. Data stays in the same browser; there are no accounts or cloud save synchronization. Clearing site storage removes the collection.

The server remains authoritative for rounds, combat, match gold and upgrade points. For this casual co-op game it accepts only the bounded cosmetic/permanent-perk loadout from browser saves; this is not an authenticated commerce system or a ranked anti-cheat boundary. Each server run assigns unique per-player receipt keys and cumulative earned counts. The browser pays only the increase over its saved maximum for that receipt. The most recent 128 receipts are retained, which covers reconnectable rooms while bounding storage.

Co-op requires server 0.3.1 or later. With an older server the shop explains that an update is needed; it does not simulate local coin awards or modify remote combat.

## Verification

`npm test` includes economy purchases, save normalization, duplicate rewards, endless/loss behavior, owner-specific damage and real WebSocket loadout/reconnection tests. `npm run test:shop-browser` exercises purchases, skin swapping, reload persistence and phone layouts. `npm run test:shop-coop-browser` checks the actual main-game snapshot callback, fixed room loadouts, reconnect receipts, separate player skins, and legacy-server behavior.
