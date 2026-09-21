Gnomeward 0.3.1 adds Round Coins and a permanent shop.

- Earn one Round Coin per completed round, including endless. Each co-op player earns their own coin.
- Spend 100 coins on the Blender-made Skeletor costume for Morrow, then switch freely between it and his original look.
- Spend 50 coins on Boss Breaker: permanent 2× damage against bosses from your gnomes, poison, and reborn guardians.
- Coins and purchases stay in your browser between gardens. Reconnecting does not repeat already-paid round rewards.
- In co-op, choose purchases and costumes before joining. Each player's perk applies only to their own defenders; room loadouts stay fixed.
- Keeps large late-game balances readable alongside the new wallet on desktop and phones.
- Includes the existing hidden combinations, endless enemy traits, larger battlefield layout, and shared co-op controls.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.3.1/docs/UNRAID.md)**

Download the image and `SHA256SUMS`, verify the checksum, then load it with Docker. Set the container's Repository to `gnomeward-server:0.3.1` and Apply. Keep the same data mount, port, environment variables, and Cloudflare route. Finish active games before restarting.

Verify `/healthz` reports 0.3.1, refresh both browsers, and start a new room. You can update directly from an older release. Browser wallets do not require a server data migration.
