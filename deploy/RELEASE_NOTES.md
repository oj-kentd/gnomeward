Gnomeward 0.2.3 adds Morrow’s secret Soul Echoes path and smoother co-op movement. The server image is packaged for Unraid (Linux amd64).

- Co-op movement now animates smoothly between network snapshots, addressing choppy motion even in the first round. This browser update works with the existing 0.2.2 server; refresh the game after deployment.
- Morrow has a mysterious fourth upgrade path. Revisit the Pumpkin Hollow cottage after his own spells defeat ten skeletons in that run, then follow its new clue.
- Once discovered, Soul Echoes upgrades queue 2 / 3 / 4 reborn gnomes per direct spell defeat. Each gnome still chooses only two paths. Helpers leave the cottage at the normal dispatch rate, preserve the defeated enemy’s route, and never summon another generation when they kill an enemy.
- Server 0.2.3 enables this discovery in co-op and saves the path for future rooms. Existing Strawberry rewards and match results remain compatible. Discovery also enters participating players’ solo collections.
- Public co-op lobbies, the seven gardens, Strawberry Fields, and the existing Cloudflare hostname remain available. Main-game PvP is still deferred.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.3/docs/UNRAID.md)**

To update from 0.2.2 or earlier, download the 0.2.3 archive and `SHA256SUMS`, verify the checksum, and load the image with Docker. Change the Unraid container’s Repository field to `gnomeward-server:0.2.3` and Apply. Keep the existing data mount, port, environment variables, and `multiplayer.lightsoutphotos.com` Cloudflare route. Active rooms end when the container restarts; wait until the current game finishes before updating.

The motion fix does not require a tunnel change or higher snapshot frequency. The server remains authoritative for movement, damage, purchases, and rewards. After updating, confirm `/healthz` reports 0.2.3, then create and join a lobby through the normal game’s Co-op button. The backend root remains a connection diagnostic.
