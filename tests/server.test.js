import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { startServer } from '../server/index.js';
import { readConfig, originAllowed, SERVER_VERSION } from '../server/config.js';
import { openResultStore } from '../server/store.js';
import { SECRETS, NECRO_PATH_SECRET } from '../src/data.js';

async function until(check, label = 'condition', timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(20); }
  throw new Error(`Timed out waiting for ${label}`);
}
function observe(room) {
  const state = { snapshot: null, errors: [] };
  room.onMessage('snapshot', value => { state.snapshot = value; });
  room.onMessage('command-error', value => state.errors.push(value));
  room.onError(() => {});
  room.send('snapshot');
  return state;
}

test('server config accepts exact origins and rejects wildcard or malformed settings', () => {
  const config = readConfig({ ALLOWED_ORIGINS: 'https://game.example', MAX_ROOMS: '3' });
  assert.equal(config.maxRooms, 3);
  assert.ok(originAllowed('https://game.example', 'server.example', config.allowedOrigins));
  assert.ok(originAllowed('http://192.168.1.20:2567', '192.168.1.20:2567', config.allowedOrigins));
  assert.ok(originAllowed(undefined, 'localhost:2567', config.allowedOrigins));
  assert.equal(originAllowed('https://evil.example', 'server.example', config.allowedOrigins), false);
  assert.equal(originAllowed('null', 'server.example', config.allowedOrigins), false);
  for (const env of [{ MAX_ROOMS: '0' }, { PORT: '-1' }, { ALLOWED_ORIGINS: '*' }, { ALLOWED_ORIGINS: 'https://game.example/path' }]) assert.throws(() => readConfig(env));
});

test('results are serialized atomically and corrupt storage fails clearly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-store-'));
  try {
    const store = await openResultStore(directory);
    await Promise.all(Array.from({ length: 12 }, (_, id) => store.record({ roomId: `room-${id}`, reason: 'defeat' })));
    await store.flush();
    assert.equal((await openResultStore(directory)).count, 12);
    const saved = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'));
    assert.equal(new Set(saved.results.map(r => r.roomId)).size, 12);
    await writeFile(join(directory, 'results.json'), 'broken');
    await assert.rejects(openResultStore(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two WebSocket clients share readiness and an authoritative five-second auto countdown', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-auto-'));
  const config = readConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory, MAX_ROOMS: '1', ALLOWED_ORIGINS: 'https://game.example' });
  const app = await startServer(config);
  const url = `http://127.0.0.1:${app.port}`;
  const connections = [];
  try {
    const host = await new Client(url).create('gnomeward', { protocol: 1, name: 'Host', mode: 'coop', mapId: 'meadow', autoStart: true, autoCountdown: 0 });
    connections.push(host); const a = observe(host);
    const guest = await new Client(url).joinById(host.roomId, { protocol: 1, name: 'Guest', ready: true });
    connections.push(guest); const b = observe(guest);
    await until(() => a.snapshot?.players.length === 2 && b.snapshot?.players.length === 2);
    const match = [...app.rooms][0].match;
    assert.equal(a.snapshot.autoStart, false, 'creation options cannot enable auto rounds');
    assert.equal(a.snapshot.autoCountdown, null);
    assert.ok(a.snapshot.players.every(player => !player.ready));
    guest.send('command', { action: 'auto', enabled: true, autoCountdown: 0 });
    await until(() => a.snapshot.autoStart && b.snapshot.autoStart);
    host.send('command', { action: 'ready' });
    await until(() => b.snapshot.players.find(player => player.id === host.sessionId).ready);
    host.send('command', { action: 'ready', ready: false, playerId: guest.sessionId });
    await until(() => a.snapshot.players.every(player => !player.ready) && b.snapshot.players.every(player => !player.ready));
    assert.equal(match.board().wave, 0);
    assert.equal(match.autoCountdown, null);
    guest.send('command', { action: 'ready', ready: 'true' });
    await until(() => b.errors.length === 1);
    assert.match(b.errors[0].message, /boolean/);
    host.send('command', { action: 'speed', speed: 3 });
    host.send('command', { action: 'ready' }); guest.send('command', { action: 'ready' });
    await until(() => a.snapshot.boards[0].state.wave === 1 && b.snapshot.boards[0].state.wave === 1);
    match.board()._queue = []; match.board().enemies = [];
    await until(() => a.snapshot.autoCountdown > 0 && b.snapshot.autoCountdown > 0, 'shared post-round countdown');
    guest.send('command', { action: 'pause', paused: true });
    await until(() => a.snapshot.manualPause && b.snapshot.manualPause);
    const frozen = match.autoCountdown;
    await delay(300);
    assert.equal(match.autoCountdown, frozen);
    host.send('command', { action: 'auto', enabled: false });
    await until(() => !a.snapshot.autoStart && !b.snapshot.autoStart && a.snapshot.autoCountdown === null && b.snapshot.autoCountdown === null);
    guest.send('command', { action: 'pause', paused: false });
    guest.send('command', { action: 'auto', enabled: true });
    await until(() => a.snapshot.autoCountdown > 0 && !a.snapshot.manualPause);
    host.send('command', { action: 'ready' }); guest.send('command', { action: 'ready' });
    await until(() => a.snapshot.boards[0].state.wave === 2 && b.snapshot.boards[0].state.wave === 2, 'manual votes start ahead of auto timer');
    assert.equal(match.autoCountdown, null);
    match.board()._queue = []; match.board().enemies = [];
    await until(() => match.autoCountdown !== null);
    const began = Date.now();
    await until(() => match.board().wave === 3, 'five real seconds elapse independently of 3x game speed', 7500);
    assert.ok(Date.now() - began >= 4800, 'the server must not divide the countdown by game speed');
    await until(() => a.snapshot.boards[0].state.wave === 3 && b.snapshot.boards[0].state.wave === 3);
    assert.equal(a.snapshot.autoCountdown, null);
    assert.equal(b.snapshot.autoCountdown, null);
    assert.ok(a.snapshot.players.every(player => !player.ready));
  } finally {
    for (const room of connections) if (room.connection.isOpen) await room.leave().catch(() => {});
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('real HTTP and WebSocket clients enforce authority, room limits, reconnect, and saved results', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-network-'));
  const config = readConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory, MAX_ROOMS: '1', ALLOWED_ORIGINS: 'https://game.example' });
  const app = await startServer(config, { reconnectSeconds: 1 });
  const url = `http://127.0.0.1:${app.port}`;
  const client = new Client(url);
  const connections = [];
  async function lobbies() {
    const response = await fetch(`${url}/lobbies`, { headers: { origin: 'https://game.example' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://game.example');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['lobbies']);
    return body.lobbies;
  }
  async function reserve(method, options) {
    const response = await fetch(`${url}/matchmake/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(options) });
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    await t.test('health, origin rejection, request limits and private routes', async () => {
      const response = await fetch(`${url}/healthz`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'ok', service: 'gnomeward-server', version: SERVER_VERSION, protocol: 1, costumeVersion: 1, tumbleSpeedVersion: 1, fusionVersion: 1, placementFusionVersion: 1, fusionCatalogVersion: 2 });
      assert.deepEqual(await lobbies(), []);
      assert.equal((await fetch(`${url}/lobbies`, { headers: { origin: 'https://evil.example' } })).status, 403);
      assert.equal((await fetch(`${url}/readyz`)).status, 200);
      assert.equal((await fetch(`${url}/data/results.json`)).status, 404);
      assert.equal((await fetch(`${url}/matchmake/create/gnomeward`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
      assert.equal((await fetch(`${url}/matchmake/create/gnomeward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(5000) }) })).status, 413);
      const cors = await fetch(`${url}/matchmake/create/gnomeward`, { method: 'OPTIONS', headers: { origin: 'https://game.example' } });
      assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), 'https://game.example');
      const upgradeStatus = await new Promise((resolve, reject) => {
        const req = request(`${url}/not-a-room`, { headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13', origin: 'https://evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
        req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('upgrade timeout'))); req.end();
      });
      assert.equal(upgradeStatus, 403, 'WebSocket origin guard also runs before the handshake');
      await assert.rejects(client.create('gnomeward', { protocol: 99, name: 'Alice', mode: 'coop', mapId: 'meadow' }), /Protocol/);
      assert.equal(app.rooms.size, 0);
    });
    await t.test('public discovery tracks available seats, host reconnect, ownership and ready synchronization', async () => {
      const hostReservation = await reserve('create/gnomeward', { protocol: 1, name: 'Alice', mode: 'coop', mapId: 'meadow', maxClients: 100, gold: 9999, unlockedRewards: ['strawberry'], unlockedPaths: ['necro-echoes'], pathUnlocks: ['necro-echoes'], profile: { pathUnlocks: ['necro-echoes'] }, necroSpellKills: 10 });
      assert.deepEqual(await lobbies(), [], 'a host reservation without a connected host is not an open lobby');
      let a = await client.consumeSeatReservation(hostReservation);
      connections.push(a); const sa = observe(a);
      await until(() => sa.snapshot?.players.length === 1, 'host arrival');
      const listing = { roomId: a.roomId, hostName: 'Alice', mode: 'coop', mapId: 'meadow', players: 1, maxPlayers: 2 };
      assert.deepEqual(await lobbies(), [listing], 'public metadata contains no session IDs, reconnect tokens or game state');
      a.reconnection.enabled = false;
      const hostToken = a.reconnectionToken;
      const hostId = a.sessionId;
      a.connection.close(1000, 'test lobby disconnect');
      await until(() => [...app.rooms][0].match.players.get(hostId)?.connected === false, 'disconnected lobby host');
      assert.deepEqual(await lobbies(), [], 'a disconnected host cannot be joined through discovery');
      a = await new Client(url).reconnect(hostToken);
      connections.push(a);
      a.onMessage('snapshot', value => { sa.snapshot = value; });
      a.onMessage('command-error', value => sa.errors.push(value));
      a.onError(() => {});
      a.send('snapshot');
      await until(() => sa.snapshot?.players[0]?.connected, 'reconnected lobby host');
      assert.deepEqual(await lobbies(), [listing]);
      const guestReservation = await reserve(`joinById/${a.roomId}`, { protocol: 1, name: 'Bob' });
      assert.deepEqual(await lobbies(), [], 'a pending guest reservation removes the lobby before its WebSocket connects');
      await assert.rejects(new Client(url).joinById(a.roomId, { protocol: 1, name: 'Competing guest' }));
      const b = await new Client(url).consumeSeatReservation(guestReservation);
      connections.push(b); const sb = observe(b);
      await until(() => sa.snapshot?.players.length === 2 && sb.snapshot?.players.length === 2, 'both seats');
      assert.deepEqual(await lobbies(), [], 'filled lobbies are hidden');
      assert.equal(sa.snapshot.players[0].gold, 325);
      assert.equal(sa.snapshot.boards[0].state.profile.unlocks.includes('strawberry'), false, 'browser cannot forge encounter rewards');
      assert.deepEqual(sa.snapshot.boards[0].state.profile.pathUnlocks, [], 'browser cannot forge secret upgrade paths');
      assert.equal(sa.snapshot.boards[0].state.necroSpellKills, 0, 'browser cannot forge direct spell defeats');
      await assert.rejects(new Client(url).joinById(a.roomId, { protocol: 1, name: 'Third' }));
      await assert.rejects(client.create('gnomeward', { protocol: 1, name: 'Extra', mode: 'coop', mapId: 'meadow' }), /busy/);
      a.send('command', { action: 'place', type: 'sprout', x: -4, z: 0, playerId: b.sessionId, gold: 9999 });
      await until(() => sb.snapshot?.boards[0].state.towers.length === 1, 'shared tower');
      const tower = sb.snapshot.boards[0].state.towers[0];
      assert.equal(tower.ownerId, a.sessionId);
      b.send('command', { action: 'sell', towerId: tower.id });
      await until(() => sb.errors.length > 0, 'ownership rejection');
      assert.match(sb.errors[0].message, /own gnomes/);
      a.send('command', { action: 'ready' }); b.send('command', { action: 'ready' });
      await until(() => sa.snapshot?.boards[0].state.wave === 1, 'wave start');
      assert.deepEqual(await lobbies(), [], 'started matches are hidden');
      b.reconnection.enabled = false;
      const token = b.reconnectionToken;
      b.connection.close(1000, 'test disconnect');
      await until(() => sa.snapshot?.players.some(p => p.id === b.sessionId && !p.connected), 'disconnect pause');
      const boardTime = [...app.rooms][0].match.board().time;
      await delay(100);
      assert.equal([...app.rooms][0].match.board().time, boardTime);
      const reconnected = await new Client(url).reconnect(token);
      connections.push(reconnected); observe(reconnected);
      assert.equal(reconnected.sessionId, b.sessionId);
      await until(() => sa.snapshot.players.every(p => p.connected), 'reconnect');
      assert.equal([...app.rooms][0].match.board().towers[0].ownerId, a.sessionId);
      await reconnected.leave();
      assert.deepEqual(await lobbies(), [], 'a sealed match does not reopen when a guest leaves');
      await a.leave();
      await until(() => app.rooms.size === 0, 'room disposal');
      assert.deepEqual(await lobbies(), [], 'closed rooms are removed');
      await app.store.flush();
      assert.equal(app.store.count, 1);
    });
    await t.test('expired reconnect forfeits PvP and saves result once', async () => {
      const a = await client.create('gnomeward', { protocol: 1, name: 'Alice', mode: 'pvp', mapId: 'creek' });
      connections.push(a); const sa = observe(a);
      const b = await new Client(url).joinById(a.roomId, { protocol: 1, name: 'Bob' });
      connections.push(b); observe(b);
      await until(() => sa.snapshot?.players.length === 2);
      assert.equal(sa.snapshot.boards.length, 2);
      a.send('command', { action: 'ready' }); b.send('command', { action: 'ready' });
      await until(() => sa.snapshot?.boards.every(board => board.state.wave === 1));
      b.reconnection.enabled = false; b.connection.close(1000, 'test timeout');
      await until(() => sa.snapshot?.result?.reason === 'forfeit', 'reconnect timeout');
      assert.equal(sa.snapshot.result.winnerId, a.sessionId);
      await a.leave();
      await until(() => app.rooms.size === 0);
      await app.store.flush();
      assert.equal(app.store.count, 2);
      assert.equal((await openResultStore(directory)).count, 2);
    });
    await t.test('Soul Echoes progress survives reconnect and the earned path persists for the party', async () => {
      const a = await client.create('gnomeward', { protocol: 1, name: 'Alice', mode: 'coop', mapId: 'hollow' });
      connections.push(a); const sa = observe(a);
      const b = await new Client(url).joinById(a.roomId, { protocol: 1, name: 'Bob', unlockedPaths: ['necro-echoes'] });
      connections.push(b); const sb = observe(b);
      await until(() => sa.snapshot?.players.length === 2 && sb.snapshot?.players.length === 2);
      assert.deepEqual(sb.snapshot.boards[0].state.profile.pathUnlocks, []);
      for (const id of SECRETS.hollow.order) a.send('command', { action: 'discover', id });
      await until(() => sa.snapshot.boards[0].state.profile.unlocks.includes('necro'), 'Morrow discovery');
      const board = [...app.rooms][0].match.board();
      const spot = Array.from({ length: 21 }, (_, index) => index - 10).flatMap(x => Array.from({ length: 13 }, (_, index) => ({ x, z: index - 6 }))).find(point => board.canPlace('necro', point.x, point.z));
      a.send('command', { action: 'place', type: 'necro', ...spot });
      await until(() => board.towers.length === 1, 'placed Morrow');
      // Seed authoritative combat outcomes through the real damage handler;
      // neither matchmaking options nor commands can write this kill counter.
      for (let kill = 0; kill < 10; kill++) {
        const enemy = board._spawn('bone');
        board._damage(enemy, enemy.hp, board.towers[0].id, { summon: true });
      }
      for (const id of NECRO_PATH_SECRET.order.slice(0, 2)) a.send('command', { action: 'discover', id });
      await until(() => sb.snapshot.boards[0].state.pathSecretDiscoveries.length === 2, 'shared partial secret');
      assert.equal(sb.snapshot.boards[0].state.necroSpellKills, 10);
      b.reconnection.enabled = false;
      const token = b.reconnectionToken;
      b.connection.close(1000, 'secret progress reconnect');
      await until(() => sa.snapshot.players.some(player => player.id === b.sessionId && !player.connected));
      const restored = await new Client(url).reconnect(token);
      connections.push(restored); const sr = observe(restored);
      await until(() => sr.snapshot?.boards[0].state.pathSecretDiscoveries.length === 2);
      for (const id of NECRO_PATH_SECRET.order.slice(2)) restored.send('command', { action: 'discover', id });
      await until(() => sa.snapshot.boards[0].state.profile.pathUnlocks.includes('necro-echoes') && sr.snapshot.boards[0].state.profile.pathUnlocks.includes('necro-echoes'), 'shared Soul Echoes unlock');
      await until(() => app.store.pathUnlocks.includes('necro-echoes'), 'durable secret path');
      await restored.leave(); await a.leave();
      await until(() => app.rooms.size === 0);
      await app.store.flush();
      assert.deepEqual((await openResultStore(directory)).pathUnlocks, ['necro-echoes']);
      const results = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8')).results;
      assert.deepEqual(results.at(-1).earnedPathUnlocks, ['necro-echoes']);
    });
    await t.test('Strawberry victory persists a party reward for later rooms', async () => {
      const a = await client.create('gnomeward', { protocol: 1, name: 'Alice', mode: 'coop', mapId: 'strawberry' });
      connections.push(a); const sa = observe(a);
      const b = await new Client(url).joinById(a.roomId, { protocol: 1, name: 'Bob' });
      connections.push(b); observe(b);
      await until(() => sa.snapshot?.players.length === 2);
      assert.deepEqual(sa.snapshot.boards[0].state.profile.pathUnlocks, ['necro-echoes'], 'new rooms inherit only trusted earned paths');
      assert.equal(sa.snapshot.boards[0].state.profile.unlocks.includes('necro'), false, 'a secret path does not grant its character');
      assert.equal(sa.snapshot.boards[0].state.towers[0].ownerId, a.sessionId);
      a.send('command', { action: 'ready' }); b.send('command', { action: 'ready' });
      await until(() => sa.snapshot?.boards[0].state.wave === 1);
      // Put the authoritative simulation at the last cleared enemy of wave 20.
      // No browser command can set these fields; gameplay tests cover the campaign.
      const board = [...app.rooms][0].match.board();
      board.wave = 20; board._queue = []; board.enemies = [];
      await until(() => sa.snapshot?.boards[0].state.status === 'won');
      await until(() => app.store.unlocks.includes('strawberry'), 'persistent encounter reward');
      await app.store.flush();
      assert.deepEqual((await openResultStore(directory)).unlocks, ['strawberry']);
      await b.leave(); await a.leave();
      await until(() => app.rooms.size === 0);
      await app.store.flush();
      assert.equal(app.store.count, 4);
    });
    await t.test('shutdown records an interrupted match without awarding a PvP win', async () => {
      const a = await client.create('gnomeward', { protocol: 1, name: 'Alice', mode: 'pvp', mapId: 'meadow' });
      connections.push(a); observe(a);
      const b = await new Client(url).joinById(a.roomId, { protocol: 1, name: 'Bob' });
      connections.push(b); observe(b);
      assert.ok([...app.rooms][0].match.board(a.sessionId).isUnlocked('strawberry'), 'later rooms inherit the earned party reward');
      await app.stop();
      const records = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8')).results;
      assert.equal(records.length, 5);
      assert.equal(records.at(-1).reason, 'server-closed');
      assert.equal(records.at(-1).winnerId, null);
    });
    await t.test('a server restart restores the durable party path without granting Morrow', async () => {
      const restarted = await startServer(config, { reconnectSeconds: 1 });
      try {
        const room = await new Client(`http://127.0.0.1:${restarted.port}`).create('gnomeward', { protocol: 1, name: 'Returning gardener', mode: 'coop', mapId: 'hollow' });
        connections.push(room); const state = observe(room);
        await until(() => state.snapshot?.boards[0].state.profile.pathUnlocks.includes('necro-echoes'));
        assert.equal(state.snapshot.boards[0].state.profile.unlocks.includes('necro'), false);
        await room.leave();
      } finally { await restarted.stop(); }
    });
  } finally {
    for (const room of connections) if (room.connection.isOpen) await room.leave().catch(() => {});
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('encounter rewards persist independently of the rolling match history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-reward-'));
  try {
    const store=await openResultStore(directory);
    assert.deepEqual(store.unlocks,[]);
    await Promise.all([store.grantUnlock('strawberry'),store.record({roomId:'victory',reason:'campaign-cleared'}),store.grantUnlock('strawberry')]);
    await store.flush();
    const restored=await openResultStore(directory);
    assert.deepEqual(restored.unlocks,['strawberry']);assert.equal(restored.count,1);
    const exported=restored.unlocks;exported.push('necro');
    assert.deepEqual(restored.unlocks,['strawberry']);
    await assert.rejects(store.grantUnlock('made-up'),/Unknown/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('saving a completed encounter also preserves its reward if the room closed before retry', async () => {
  const directory=await mkdtemp(join(tmpdir(),'gnomeward-completion-'));
  try {
    const store=await openResultStore(directory);
    await store.record({roomId:'cleared',mapId:'strawberry',reason:'campaign-cleared',players:[{completedWaves:20}]});
    assert.deepEqual(store.unlocks,['strawberry']);
    assert.deepEqual((await openResultStore(directory)).unlocks,['strawberry']);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('secret paths serialize with encounter rewards and survive rolling-history eviction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-path-store-'));
  try {
    await writeFile(join(directory, 'results.json'), JSON.stringify({ version: 1, results: Array.from({ length: 1000 }, (_, index) => ({ roomId: `old-${index}`, ...(index === 0 ? { earnedPathUnlocks: ['necro-echoes', 'invented'] } : {}) })) }));
    const store = await openResultStore(directory);
    assert.deepEqual(store.pathUnlocks, ['necro-echoes'], 'legacy result records recover a path without the top-level field');
    await Promise.all([store.grantPathUnlock('necro-echoes'), store.grantUnlock('strawberry'), store.record({ roomId: 'newest', reason: 'abandoned' })]);
    await store.flush();
    const restored = await openResultStore(directory);
    assert.deepEqual(restored.pathUnlocks, ['necro-echoes']);
    assert.deepEqual(restored.unlocks, ['strawberry']);
    const records = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8')).results;
    assert.equal(records.length, 1000);
    assert.equal(records.some(result => result.roomId === 'old-0'), false);
    restored.pathUnlocks.push('invented');
    assert.deepEqual(restored.pathUnlocks, ['necro-echoes']);
    await assert.rejects(store.grantPathUnlock('necro'), /Unknown/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a result recovers a secret path after its immediate disk write failed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-path-recovery-'));
  try {
    const store = await openResultStore(directory);
    await mkdir(join(directory, 'results.json.tmp'));
    await assert.rejects(store.grantPathUnlock('necro-echoes'));
    assert.equal(store.healthy, false);
    assert.deepEqual(store.pathUnlocks, []);
    await rm(join(directory, 'results.json.tmp'), { recursive: true });
    await store.record({ roomId: 'closed-before-retry', reason: 'server-closed', earnedPathUnlocks: ['necro-echoes', 'invented'] });
    assert.equal(store.healthy, true);
    assert.deepEqual((await openResultStore(directory)).pathUnlocks, ['necro-echoes']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
