# Co-op plan — saved for later

Status: deferred at the user's request on 2026-09-17. This records the proposed design; multiplayer has not been implemented or deployed.

## First release: private two-player online co-op

Two players defend the same garden from separate computers or tablets. Keep solo mode available and support all six maps.

- Create Game / Join Game with a short room code or invitation link; no accounts required initially.
- Shared lives, enemies, waves, and victory/defeat.
- Each player owns their placed gnomes, shown by colored rings. Only the owner upgrades or sells them.
- Split the total starting gold and earned gold/upgrade points equally. Include a Give Gold button.
- Both players ready up before a wave. Either may pause; the room creator controls game speed.
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
5. Playtest privately with two players before considering four players or public matchmaking.

Later possibility: competitive defense with separate gardens and the ability to send skeletons to an opponent. This is outside the first co-op release.

## References

- Colyseus state synchronization: https://docs.colyseus.io/state
- Colyseus reconnection: https://docs.colyseus.io/room/reconnection
- GitHub Pages hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
