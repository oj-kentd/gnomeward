# Gnomeward multiplayer protocol (version 1)

The Three.js game now uses this service for public two-player co-op: lobby browsing, shared rendering, owned defenders, and synchronized ready controls. The service’s `/` connection-check page remains available for deployment checks. PvP game rendering is not yet exposed in the main game.

Release **0.2.5** keeps protocol version **1** and adds `comboVersion: 1` to advertise Sporefire/Prismstorm support. Combo damage, cooldowns, partner eligibility, and shard ricochets are authoritative; players can contribute opposite halves of a pairing. Enemy poison includes `volatile`, victims carry `sporefireReadyAt`, towers carry `prismCooldown`, and `prism-shard` projectiles carry bounded `bounces`/`hitIds`. Effects `sporefire` and `prism-burst` are presentation events. A once-per-run `combo` event carries the recipe name. All existing board serialization includes these nested fields. No new client gameplay commands are required.

Release **0.2.4** added `autoStart` and `autoCountdown` to snapshots. The client detects support by the presence of boolean `autoStart`. Older servers still receive ordinary Ready commands and benefit from readiness highlighting, but cannot withdraw Ready or run shared auto. Motion smoothing remains compatible with 0.2.2; Soul Echoes requires 0.2.3 or newer.

## Scope and rules

- Two players per room. Create with `client.create('gnomeward', options)`. Other players discover waiting hosts through `GET /lobbies` and use `client.joinById(roomId, options)` when they click Join. No codes, accounts, or passwords are needed.
- Co-op uses one board and shared lives. Each player starts with **325 gold**, owns their gnomes, and receives half of earned gold and upgrade points. Half points are retained; they are not rounded away. Sell refunds go to the owner. Only an owner may upgrade, sell, or retarget their units. Gold gifting is deferred.
- Co-op discoveries/unlocks are shared for that match. The player completing the crystal secret owns its free guardian. Existing browser saves and unlock lists are never accepted from clients. Strawberry Fields starts with one free host-owned mortar gnome; clearing round 20 saves the Strawberry reward for all later co-op rooms on this server. Discovering Soul Echoes similarly persists the trusted `necro-echoes` path reward for later rooms. Morrow’s character unlock and the run’s unfinished ritual progress remain separate from this persistent path reward.
- PvP is a **defense race**: separate boards, identical map and wave schedules, 650 starting gold each. Both must ready before the next round. First board to lose ends the match; a loss on both boards during the same server tick is a draw. After both clear round 20, boards automatically enter endless mode. Sending skeletons to opponents is not implemented.
- Co-op requires two `endless` votes after campaign victory, then either both ready or the enabled shared countdown starts round 21. Leaving at the campaign victory screen records `campaign-cleared`; later defeat records completed rounds. Current boards and ordinary character unlocks exist only for the lifetime of the room; the Strawberry and Soul Echoes rewards persist separately.
- Either co-op player may pause/resume; PvP has no manual pause. Only the creator can set speed (1, 2, 3). Both modes pause automatically on disconnect. The room holds a disconnected seat for **60 seconds**; reconnect retains the same player ID, board, ownership, and wallet. A consented leave or expired reconnect ends the match (PvP forfeit, co-op abandoned). Rooms cannot replace players once both seats have been occupied. A one-player lobby expires after five minutes without a valid command; occupied rooms expire after 30 minutes idle (paused, between rounds, or finished). Active rounds refresh this timer; snapshot polling does not.
- There are no ranked scores, accounts, automatic matchmaking, active-match restoration after server restart, or per-account unlock storage. Strawberry and Soul Echoes are shared persistent party rewards. The server records match outcomes locally; records are not a trusted public leaderboard.

## Connection and identity

Use `@colyseus/sdk` 0.18 against this Colyseus 0.18 service. The browser endpoint is the HTTPS service address, e.g. `https://multiplayer.lightsoutphotos.com`; Colyseus upgrades its game connection to secure WebSocket automatically.

```js
import { Client } from '@colyseus/sdk';
const client = new Client('https://multiplayer.lightsoutphotos.com');
const room = await client.create('gnomeward', {
  protocol: 1,
  name: 'Garden Captain', // 1–24 characters, no control characters or HTML brackets
  mode: 'coop',         // 'coop' or 'pvp'
  mapId: 'meadow',      // existing map ID from src/data.js
});
room.onMessage('snapshot', snapshot => render(snapshot));
room.onMessage('command-error', ({ message }) => showError(message));
room.send('snapshot'); // request a fresh snapshot after attaching handlers
sessionStorage.setItem('gnomeward-reconnection', room.reconnectionToken);

// Second browser: show these lobbies as a list, then join the chosen entry.
const { lobbies } = await fetch('https://multiplayer.lightsoutphotos.com/lobbies').then(r => r.json());
const chosen = lobbies[0]; // the entry selected by the player
const guest = await client.joinById(chosen.roomId, { protocol: 1, name: 'Garden Friend' });
// mapId/mode may be omitted on join; if supplied they must match.

// After a page reload, within the server's 60-second grace period:
const resumed = await client.reconnect(sessionStorage.getItem('gnomeward-reconnection'));
// Store the latest token after each successful join/reconnect.
```

Treat the reconnection token as a private bearer credential. Do not put it in invitations, logs, or public URLs. Lobby listings expose only the joinable `roomId` and display information. SDK automatic reconnection may be used for transient drops; manual reconnect restores a session after a page reload. See [Colyseus reconnection](https://docs.colyseus.io/room/reconnection).

## Open lobby discovery

`GET /lobbies` returns `{ lobbies: [{ roomId, hostName, mode, mapId, players: 1, maxPlayers: 2 }] }`. Listings contain only connected, waiting hosts with an available guest seat. Empty rooms, pending guest reservations, disconnected hosts, full/sealed matches, started games, and finished games are excluded. Session IDs, reconnect tokens, and game snapshots are not included. Responses are uncached and use the existing browser-origin allowlist. A server that is shutting down or has unhealthy storage returns HTTP 503.

The connection page refreshes the list every four seconds while visible and outside a room, with a manual Refresh button. Joining still reserves a seat through Colyseus: if two guests pick the same lobby, only one can join and the other sees a message and an updated list.

## Commands

Send `room.send('command', { action, ...fields })`. Player identity comes only from the authenticated socket/session, never a field in the message.

| Action | Additional fields | Behavior |
| --- | --- | --- |
| `place` | `type`, finite `x`, finite `z` | Validates unlock, location, overlap, wallet; 100-tower limit per board |
| `upgrade` | integer `towerId`, integer `path` | Owner only; zero-based path index, existing two-path/three-tier rules; locked secret paths are rejected before spending points |
| `sell` | integer `towerId` | Owner only; normal gold refund |
| `target` | integer `towerId`, `mode` | Owner only; `first`, `last`, `strong`, `close` where supported |
| `discover` | `id` | Validates secret ID against room map; existing puzzle sequence rules |
| `ready` | optional boolean `ready` (defaults to true) | Set or withdraw your vote between rounds; two connected, unpaused Ready votes start the round |
| `auto` | boolean `enabled` | Either co-op player enables or disables the shared five-second countdown between completed rounds |
| `pause` | boolean `paused` | Co-op only; either player |
| `speed` | `speed` | Creator only; integer 1, 2, or 3 |
| `endless` | none | Co-op campaign-victory vote; both required |

Errors arrive on `command-error` as `{ message }`. An incorrect ordered-secret click is accepted as a puzzle attempt and may reset discovery progress. Successful actions are confirmed by the next snapshot, with no separate command ACK. Each connected player has a shared command/snapshot-request budget of 30 messages/second with a burst of 60; excess messages are dropped. Unknown message types are not commands. Do not replay stale purchases after reconnect; use the latest authoritative snapshot.

### Soul Echoes discovery

The existing Hollow `discover` command also handles Morrow’s fourth path. After Morrow is unlocked, ten **direct necromancer spell kills in the current Pumpkin Hollow run** enable a second ritual. Submit the existing rune IDs in reverse order: `hollow-flame`, `hollow-leaf`, `hollow-star`, `hollow-moon`. A wrong step resets only `pathSecretDiscoveries`; repeating the most recent correct step is ignored. Other maps, finished boards, and insufficient kills cannot unlock the path. Kills by reborn helpers never advance this counter.

Success adds `necro-echoes` to `profile.pathUnlocks` and emits `path-unlock` with `pathId: 'necro-echoes'`. Progress uses `path-secret-found` and `path-secret-reset`; one-time clue hints use `path-secret-hint` and `path-secret-ready`. Path index **3** has tiers costing **18 / 36 / 65** points. Its `summonCount` becomes **2 / 3 / 4**, queued as separate `{ routeIndex }` entries. Existing dispatch cooldowns and the two-path limit still apply; `allyLimit` is at least the batch size. Reborn kills do not recursively summon more helpers. Server-owned discovery is persisted in `/data/results.json`; client-supplied path unlock lists are ignored.

## Snapshots

The service simulates fixed 50 ms steps (20 Hz) and broadcasts complete, plain-data snapshots at 5 Hz. Faster game speed advances the rules further each step. Client 0.2.3 buffers snapshots and interpolates displayed movement between them instead of repeatedly easing toward a stationary last-known position. This avoids first-round stop/start motion without increasing server message frequency. Visual interpolation and animation clocks must not award rewards or advance authoritative enemy health; purchases, targeting previews, ownership, and wallets continue to use the latest server state. Pause, disconnect, map changes, and reconnect must reset or freeze interpolation appropriately.

```js
{
  protocol: 1, roomId, mode, mapId, hostId,
  players: [{ id, name, connected, ready, endlessReady, gold, points }],
  paused, manualPause, speed, started, autoStart, autoCountdown, tick,
  result: null, // or final result below
  boards: [{
    playerId: null, // co-op shared board; PvP uses its owner's session ID
    state: {
      wave, completedWaves, maxWaves, endless, lives, gold, points,
      status, kills, time, towers, enemies, traps, holes, barriers,
      allies, secretDiscoveries, pathSecretDiscoveries, necroSpellKills,
      effects, projectiles,
      profile: { unlocks, pathUnlocks, bestRounds }, bestRound,
      events // most recent 12 Game events, each with a stable eventId for client deduplication
    }
  }]
}
```

Tower records additionally contain `ownerId`. Co-op board `gold`/`points` are combined wallet totals for reporting; use `players[i].gold`/`points` to display available personal spending. Array IDs are board-local; identify PvP entities with **both board playerId and entity id**. Event history repeats between snapshots; do not replay all events each time. `tick` advances during simulation; snapshots also update while paused/between rounds. Secret solution coordinates and engine internals such as spawn queues are not exported as snapshot fields.

A final `result` is `{ mode, mapId, reason, winnerId, earnedPathUnlocks, players: [{ id, name, completedWaves, lives }] }`. `earnedPathUnlocks` lists trusted path discoveries newly earned in that room; older results may omit it. `winnerId` is null for draws/co-op. Reasons: `defeat`, `last-standing`, `draw`, `forfeit`, `campaign-cleared`, `abandoned`, `server-closed`, `idle-timeout`. The stored result adds `roomId` and ISO `endedAt`. Commands are rejected after a result; create a new room for a rematch.

## Server configuration boundary

`createGnomewardRoom({ recordResult, onRoomOpen, onRoomClose, getUnlockedRewards, onRewardUnlocked, getUnlockedPaths, onPathUnlocked, reconnectSeconds })` closes over server-owned callbacks. Never pass operational configuration through browser-controlled room creation options. `onRoomOpen` may reject creation when the process has reached its room capacity. The result recorder is called once per room outcome and errors are logged. Reward callbacks retry failed persistence with a delay; successful unlocks are retained independently of the rolling results list. This is one process with in-memory active rooms; it intentionally needs no Redis or database server. Horizontal scaling requires shared Colyseus presence/matchmaking and routing changes before adding replicas.

## Shared auto rounds and readiness (0.2.4)

`{ action: 'auto', enabled: true | false }` sets a shared co-op option, initially false. Either connected player may change it, including while the garden is paused or their teammate is disconnected. Re-enabling an already enabled timer does not reset it; disabling clears the timer and retains explicit Ready votes. PvP rejects this command.

`{ action: 'ready', ready: true | false }` sets a player’s Ready vote. Omitting `ready` keeps the original true behavior. Marking ready requires both players connected, unpaused, and between rounds. A connected player may withdraw readiness during planning even while paused. When both are ready, the next round starts immediately and clears both votes and the timer.

Round one always needs both manual votes. Once a round has completed, enabled auto starts `autoCountdown` at five seconds during planning. It advances by the unscaled 20 Hz server step, freezes on pause/disconnect, and starts the next round at zero. It is null outside an eligible build window or when auto is off; final results clear it. Campaign victory never starts endless mode automatically: both players must consent first. The browser may animate the remaining time locally but must never start a round itself.
