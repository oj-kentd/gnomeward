Deployable multiplayer backend for Gnomeward, packaged for Unraid (Linux amd64).

- Private two-player co-op and separate-board PvP survival rooms with server-controlled rules.
- Player-owned gnomes, validated purchases/upgrades, synchronized rounds, and reconnect handling.
- Persistent match results, health checks, and a browser connection-test page.
- Docker image runs without root; existing Cloudflare Tunnel connectors can route to it.

Download the image archive and SHA256SUMS below, verify the checksum, then load it with Docker. No container-registry login is needed.

**[Unraid installation and existing Cloudflare Tunnel setup](https://github.com/oj-kentd/gnomeward/blob/server-v0.2.0/docs/UNRAID.md)**

This release is the backend and connection diagnostic. The existing game remains solo until its multiplayer lobby and gameplay client are connected. No accounts, ranked matchmaking, or PvP enemy sending are included. Active rooms are held in memory and end when the container restarts; the last 1,000 match results persist in the mounted data folder.
