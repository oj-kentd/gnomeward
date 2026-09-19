# Co-op plan and implementation status

Status: Docker backend implemented on 2026-09-17 at the user's request. It supports public two-player co-op and PvP survival rooms, validated game commands, reconnection, and persisted match results. The main game now includes public co-op lobbies, shared battlefield rendering, player ownership controls, ready synchronization, optional shared five-second auto rounds, cross-player Sporefire/Prismstorm combinations, and reconnection. PvP remains backend-only. See [Unraid setup](UNRAID.md) and the [implemented protocol](../server/PROTOCOL.md). The design below records the broader plan; features such as gifting gold and durable player accounts are not in the backend's initial release.

## First release: public two-player online co-op

Two players defend the same garden from separate computers or tablets. Keep solo mode available and support all seven maps.

- Create Lobby / Join from an automatically refreshed list of waiting hosts; no codes or accounts required.
- Shared lives, enemies, waves, and victory/defeat.
- Each player owns their placed gnomes, shown by colored rings. Only the owner upgrades or sells them.
- Split the total starting gold and earned gold/upgrade points equally. Include a Give Gold button.
- Both players ready up for the first wave. Afterwards they may ready together or use shared auto with a five-second build countdown. Either may turn auto off or pause; the room creator controls game speed.
- Secret discoveries and unlocks earned together apply to both players.
- Allow a disconnected player a grace period to rejoin and recover their units and resources.

These are proposed defaults to revisit when implementation begins, particularly currency sharing, pause behavior, and disconnect handling.

## Architecture

Reuse the deterministic rules in `src/game.js` in a Node.js multiplayer service. The server runs the authoritative simulation with a fixed timestep. Clients send commands (place, upgrade, sell, targeting, ready, pause), and the server validates ownership, resources, placement, and game state before applying them. All clients receive synchronized state and game events, preventing duplicate purchases or conflicting enemy health.

Use Colyseus for rooms, state synchronization, and reconnection. Three.js remains in each browser, smoothing movement between server updates. Music, camera, menus, hover previews, and audio volume remain local. Opening a menu or hiding one browser tab must not silently pause the whole game.

Keep GitHub Pages and the existing playtest URL for the static client. A separately hosted Node.js service handles secure WebSocket connections; GitHub Pages cannot run it. Hosting provider, budget, domain, and persistent storage are undecided. No paid service is authorized by this saved plan.

## Implementation stages

1. Separate local commands from simulation; retain the existing solo flow and tests.
2. Add the server room, command validation, stable player identity/rejoin tokens, shared state, and version compatibility checks.
3. Add create/join lobby, ownership rings, resources, ready controls, and cooperative discovery rewards.
4. Test with two browser contexts, simultaneous placements, slow connections, refresh/rejoin, host departure, upgrades, all route types, summoned allies, and secret abilities.
5. Playtest co-op with two players before adding PvP gameplay or four-player rooms.

The initial backend also supports PvP survival races: separate gardens face synchronized rounds, with the last surviving player winning. Sending skeletons to an opponent remains a later feature.

## References

- Colyseus state synchronization: https://docs.colyseus.io/state
- Colyseus reconnection: https://docs.colyseus.io/room/reconnection
- GitHub Pages hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
