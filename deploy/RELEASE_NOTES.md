Gnomeward 0.3.5 adds Turbo Tumble, a permanent 50-Round-Coin shop power.

- Triples Tumble’s attack speed at every upgrade tier, for existing and future Tumbles.
- Activates immediately in solo, including the current firing cooldown. Buying it twice cannot stack the effect or charge again.
- In co-op, only the purchasing player’s Tumbles receive the boost. Buy before joining; the room loadout stays fixed.
- Selected-unit stats and upgrade previews show the boosted rate. Damage per hit, volley size and hidden-combination cooldowns are unchanged.
- Tumble still unlocks after clearing round 15. Existing coins, costumes and Boss Breaker are preserved.
- Older servers remain joinable with normal Tumble speed until updated.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.3.5/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load it with Docker. Set the container’s Repository to `gnomeward-server:0.3.5` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.3.5 and `tumbleSpeedVersion: 1`, refresh both browsers, and start a new room. You can update directly from an older release. Browser purchases do not require a server data migration.
