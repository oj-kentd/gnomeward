# Round Coins and permanent purchases

Round Coins are collection currency, separate from the gold used to place gnomes and the points used to upgrade them. Clear any round to earn one coin, including repeated gardens and endless rounds. A round that ends in defeat earns none. The feature starts tracking rewards when this update is played; it does not infer past rewards from best-round records.

| Item | Cost | What persists |
| --- | --- | --- |
| Skeletor Morrow | 100 Round Coins | Necromancer costume ownership; free switching between original and Skeletor |
| Orange Knight Bramble | 100 Round Coins | Bramble costume ownership; free switching to the original |
| Skeleton Sprout | 100 Round Coins | Sprout costume ownership; description: “skeleton vs skeletons who wins ???” |
| Turbo Tumble | 1,000 Round Coins; 50 during Tumble Day | Permanent 3× attack speed for the player’s Tumbles at every upgrade tier |
| Boss Breaker | 50 Round Coins | Permanent 2× damage to bosses from the player's gnomes, poison and reborn guardians |

Buying a costume does not reveal or unlock the hidden necromancer. Costumes do not change combat stats. Turbo Tumble increases firing frequency without changing damage per hit, volley size, or hidden-combination cooldowns. None of these purchases changes the two-path limit. Purchases cannot be bought twice or stacked.

The welcome screen and HUD Shop button open the store. In solo, buying either power takes effect immediately; Turbo Tumble also divides the remaining firing cooldown of existing Tumbles by three. Buying this power does not unlock Tumble before round 15. Changing costume also updates existing gnomes of that type and future placements. In co-op, buy/equip before joining a room. Each teammate earns their own full coin per cleared round and their perks apply only to their own defenders. The selected loadout stays fixed through reconnects until leaving the room.

## Save format and co-op boundary

The existing `gnomeward-profile` browser save gains `roundCoins`, `cosmetics`, `equippedNecroSkin`, `equippedBoomSkin`, `equippedSproutSkin`, `bossDamageUnlocked`, `tumbleSpeedUnlocked`, and `coopRoundReceipts`. Pre-shop saves migrate to an empty shop wallet while retaining their existing unlocks and records. Existing shop saves retain their coins, purchases, selected Morrow costume, and permanent perk; new costumes start unowned and Turbo Tumble defaults to inactive. Malformed balances and unknown cosmetic IDs are filtered. Data stays in the same browser; there are no accounts or cloud save synchronization. Clearing site storage removes the collection.

The server remains authoritative for rounds, combat, match gold and upgrade points. For this casual co-op game it accepts only the bounded cosmetic/permanent-perk loadout from browser saves; this is not an authenticated commerce system or a ranked anti-cheat boundary. Each server run assigns unique per-player receipt keys and cumulative earned counts. The browser pays only the increase over its saved maximum for that receipt. The most recent 128 receipts are retained, which covers reconnectable rooms while bounding storage.

Co-op rewards and the original shop items require server 0.3.3 or later. Orange Knight Bramble and Skeleton Sprout require server 0.3.4. Turbo Tumble requires server 0.3.5 and the `tumbleSpeedVersion: 1` capability. Older servers use Tumble’s ordinary attack speed; the saved purchase is retained. The client checks the server’s costume capability before sending new loadout fields; older servers still accept existing perks and use the original Bramble/Sprout looks. With an older server the shop explains that an update is needed; it does not simulate local coin awards or modify remote combat.

## Verification

`npm test` includes economy purchases, save normalization, duplicate rewards, endless/loss behavior, owner-specific damage and real WebSocket loadout/reconnection tests. `npm run test:shop-browser` exercises purchases, skin swapping, reload persistence and phone layouts. `npm run test:shop-coop-browser` checks the actual main-game snapshot callback, fixed room loadouts, reconnect receipts, separate player skins, and legacy-server behavior.

## Tumble Day pricing

Turbo Tumble costs 50 Round Coins from September 22 at midnight through September 28 each year, beginning in 2026, using America/New_York time. At midnight on September 29 it returns to 1,000 coins. The shop displays the dates and regular price, refreshes an open offer at the boundary, and checks the price again on purchase. If the displayed price has changed, the player must click the updated offer before any coins are spent. Existing owners keep the permanent upgrade without paying again. This pricing update needs no server update beyond the existing Turbo Tumble support in server 0.3.5.
