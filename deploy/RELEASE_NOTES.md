Co-op and Strawberry Fields server update for Gnomeward, packaged for Unraid (Linux amd64).

- The main game now supports two-player co-op: shared garden, personal gold/points, owned gnomes, Ready controls, pause/speed, and reconnect.
- Public lobbies let the second player click Join. No room-code copying or accounts.
- Strawberry Fields adds two entrances, a free host-owned Strawberry Gnome, and an encounter reward that persists for future co-op rooms.
- Strawberry mortars shoot black seed shrapnel outward on landing, with no red explosion blob and three upgrade paths (choose two).
- Setup examples use multiplayer.lightsoutphotos.com with the existing Cloudflare Tunnel.

**[Unraid installation and update instructions](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.2/docs/UNRAID.md)**

To update from 0.2.0, download the archive and SHA256SUMS, verify the checksum, and load the image with Docker. Change the Unraid container’s Repository field to `gnomeward-server:0.2.2` and Apply. Keep the existing data mount, port, and Cloudflare route. Active rooms end when the container restarts; saved match results remain compatible.

After updating, open the normal game and click Co-op. One player creates a lobby, the other joins it, and both press Ready. The backend root remains a connection diagnostic. PvP gameplay is deferred; the main game delivers co-op first.
