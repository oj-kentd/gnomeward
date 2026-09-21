import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, validateLoadout } from '../server/match.js';
import { createGnomewardRoom } from '../server/room.js';
import { applyCoopSnapshot, CoopClient } from '../src/multiplayer.js';

function pair(a, b, mode = 'coop') {
  const match = new Match({ mode, mapId: 'meadow' });
  match.addPlayer('a', 'Alice', a);
  match.addPlayer('b', 'Bob', b);
  return match;
}
function start(match) {
  match.command('a', { action: 'ready' });
  match.command('b', { action: 'ready' });
}
function clear(match) {
  for (const game of match.boards.values()) { game._queue = []; game.enemies = []; }
  match.step();
}
function place(match, owner, type, x) {
  match.command(owner, { action: 'place', type, x, z: 0 });
  return match.board(owner).towers.at(-1);
}

test('shop loadouts accept only bounded permanent perks, with legacy defaults', () => {
  assert.deepEqual(validateLoadout(), { bossDamage: false, necroSkin: null });
  assert.deepEqual(validateLoadout({}), { bossDamage: false, necroSkin: null });
  const good = { bossDamage: true, necroSkin: 'skeletor' };
  assert.deepEqual(validateLoadout(good), good);
  assert.deepEqual(validateLoadout({ ...good, boomSkin: 'orange-knight', sproutSkin: 'skeleton' }),
    { ...good, boomSkin: 'orange-knight', sproutSkin: 'skeleton' });
  assert.deepEqual(validateLoadout({ boomSkin: null, sproutSkin: null }),
    { bossDamage: false, necroSkin: null, boomSkin: null, sproutSkin: null });
  for (const bad of [null, [], 1, 'yes', { bossDamage: 2 }, { bossDamage: 'true' },
    { necroSkin: 'unlimited' }, { boomSkin: 'skeleton' }, { sproutSkin: 'orange-knight' },
    { boomSkin: false }, { sproutSkin: [] }, { boomSkin: { id: 'orange-knight' } }, { gold: 999 }, { hp: 999 }, { roundCoins: 999 },
    { profile: good }, { multiplier: 10 }, Object.create({ bossDamage: true }), new Date()]) {
    assert.throws(() => validateLoadout(bad), /loadout/);
  }
  const room = new (createGnomewardRoom())();
  room.match = new Match({ mode: 'coop', mapId: 'meadow' });
  assert.throws(() => room.onAuth({}, { protocol: 1, name: 'Alice', loadout: { gold: 999 } }), /loadout/);
});

test('join loadouts cannot import currencies or alter another player or be changed midroom', () => {
  const input = { bossDamage: true, necroSkin: 'skeletor' };
  const match = pair(input);
  input.bossDamage = false;
  assert.equal(match.players.get('a').loadout.bossDamage, true);
  assert.deepEqual(match.board().bossDamageOwners, ['a']);
  assert.equal(match.players.get('a').gold, 325);
  assert.equal(match.board().gold, 650);
  assert.equal(match.board().points, 0);
  assert.equal(match.board().lives, 100);
  assert.equal(match.players.get('a').roundCoinsEarned, 0);
  for (const action of ['loadout', 'shop', 'purchase', 'equip']) {
    assert.throws(() => match.command('b', { action, loadout: input }), /Unknown command/);
  }
  const bad = new Match({ mode: 'coop', mapId: 'meadow' });
  assert.throws(() => bad.addPlayer('a', 'Alice', { gold: 999 }), /loadout/);
  assert.equal(bad.players.size, 0);
});

test('only the purchasing owner doubles boss damage and teammates never stack it', () => {
  const match = pair({ bossDamage: true });
  const a = place(match, 'a', 'sprout', -4);
  const b = place(match, 'b', 'sprout', 2);
  const game = match.board();
  const hit = tower => { const enemy = { hp: 1000, boss: true }; game._damage(enemy, 10, tower.id); return 1000 - enemy.hp; };
  assert.equal(hit(a), 20);
  assert.equal(hit(b), 10);
  const regular = { hp: 1000, boss: false };
  game._damage(regular, 10, a.id);
  assert.equal(regular.hp, 990);
  const both = pair({ bossDamage: true }, { bossDamage: true });
  const tower = place(both, 'a', 'sprout', -4);
  const enemy = { hp: 1000, boss: true };
  both.board()._damage(enemy, 10, tower.id);
  assert.equal(enemy.hp, 980);
});

test('necro skin follows the placing owner without changing stats or unlocking Morrow', () => {
  const match = pair({ necroSkin: 'skeletor' });
  assert.throws(() => place(match, 'a', 'necro', -4));
  const game = match.board();
  game.profile.unlocks.push('necro');
  const a = place(match, 'a', 'necro', -4);
  const b = place(match, 'b', 'necro', 2);
  assert.equal(a.skin, 'skeletor');
  assert.equal(b.skin, null);
  assert.deepEqual(game.getStats(a), game.getStats(b));
  const snapshot = match.snapshot('room');
  assert.equal(snapshot.boards[0].state.towers.find(t => t.id === a.id).skin, 'skeletor');
});

test('round receipts count completed rounds once per player, survive reconnect and exclude failure', () => {
  const match = pair({ bossDamage: true });
  const receipt = match.players.get('a').receiptKey;
  start(match);
  assert.equal(match.players.get('a').roundCoinsEarned, 0);
  clear(match);
  for (let i = 0; i < 5; i++) { match.step(); match.snapshot('room'); }
  assert.equal(match.players.get('a').roundCoinsEarned, 1);
  assert.equal(match.players.get('b').roundCoinsEarned, 1);
  match.setConnected('a', false); match.step(); match.setConnected('a', true);
  assert.equal(match.players.get('a').receiptKey, receipt);
  assert.equal(match.players.get('a').loadout.bossDamage, true);
  start(match); clear(match);
  assert.equal(match.players.get('a').roundCoinsEarned, 2);
  start(match); match.board().lives = 0; match.step();
  assert.equal(match.board().status, 'lost');
  assert.equal(match.players.get('a').roundCoinsEarned, 2);
  assert.notEqual(pair().players.get('a').receiptKey, receipt, 'new matches use distinct receipts');
  assert.notEqual(match.players.get('b').receiptKey, receipt, 'each browser earns its own round reward');
});

test('snapshot adapter exposes cumulative rewards and safely defaults old servers', () => {
  const match = pair({ bossDamage: true }); start(match); clear(match);
  const snapshot = match.snapshot('room');
  assert.equal(snapshot.shopVersion, 1);
  assert.equal(snapshot.costumeVersion, 1);
  const current = applyCoopSnapshot(null, snapshot, 'a').multiplayer;
  assert.equal(current.shopSupported, true);
  assert.equal(current.costumesSupported, true);
  const oldCostumes = structuredClone(snapshot);
  delete oldCostumes.costumeVersion;
  assert.equal(applyCoopSnapshot(null, oldCostumes, 'a').multiplayer.costumesSupported, false);
  assert.equal(applyCoopSnapshot(null, oldCostumes, 'a').multiplayer.shopSupported, true);
  assert.equal(current.roundCoinsEarned, 1);
  assert.equal(current.receiptKey, match.players.get('a').receiptKey);
  assert.equal(current.loadout.bossDamage, true);
  delete snapshot.shopVersion;
  const legacy = applyCoopSnapshot(null, snapshot, 'a').multiplayer;
  assert.equal(legacy.shopSupported, false);
  assert.equal(legacy.roundCoinsEarned, 0);
  assert.equal(legacy.receiptKey, null);
});

test('browser sends legacy loadouts without fetching health, and reconnect only uses its token', async t => {
  let healthCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { healthCalls++; return { ok: true, json: async () => ({ costumeVersion: 1 }) }; });
  const calls = [];
  const client = new CoopClient({});
  client.sdk = async () => ({
    create: async (...args) => { calls.push(['create', ...args]); return {}; },
    joinById: async (...args) => { calls.push(['join', ...args]); return {}; },
    reconnect: async (...args) => { calls.push(['reconnect', ...args]); return {}; },
  });
  client.attach = () => {};
  const loadout = { bossDamage: true, necroSkin: 'skeletor' };
  await client.connect({ name: 'Alice', mapId: 'meadow', loadout });
  await client.connect({ name: 'Alice', roomId: 'abc', loadout });
  await client.connect({ token: 'resume', loadout: { bossDamage: false, boomSkin: 'orange-knight', sproutSkin: 'skeleton' } });
  assert.deepEqual(calls[0][2].loadout, loadout);
  assert.deepEqual(calls[1][2].loadout, loadout);
  assert.deepEqual(calls[2], ['reconnect', 'resume']);
  assert.equal(healthCalls, 0);
});

test('WebSocket loadouts and round receipts survive an actual reconnect', { timeout: 15000 }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { setTimeout: delay } = await import('node:timers/promises');
  const { Client } = await import('@colyseus/sdk');
  const { startServer } = await import('../server/index.js');
  const { readConfig } = await import('../server/config.js');
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-shop-'));
  const app = await startServer(readConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory, MAX_ROOMS: '1', ALLOWED_ORIGINS: 'https://game.example' }));
  const connections = [];
  const url = `http://127.0.0.1:${app.port}`;
  const until = async check => {
    const end = Date.now() + 4000;
    while (Date.now() < end) { if (check()) return; await delay(20); }
    throw new Error('Timed out waiting for shop snapshot');
  };
  const observe = room => {
    const view = {};
    room.onMessage('snapshot', value => { view.snapshot = value; });
    room.onMessage('command-error', () => {});
    room.onError(() => {});
    room.send('snapshot');
    return view;
  };
  try {
    const health = await fetch(`${url}/healthz`, { headers: { origin: 'https://game.example' } });
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://game.example');
    assert.equal((await health.json()).costumeVersion, 1);
    const host = await new Client(url).create('gnomeward', { protocol: 1, name: 'Host', mode: 'coop', mapId: 'meadow', loadout: { bossDamage: true, necroSkin: 'skeletor', boomSkin: 'orange-knight', sproutSkin: 'skeleton' }, gold: 99999, roundCoins: 99999 });
    connections.push(host); const a = observe(host);
    const guest = await new Client(url).joinById(host.roomId, { protocol: 1, name: 'Guest' });
    connections.push(guest); observe(guest);
    await until(() => a.snapshot?.players.length === 2);
    const original = a.snapshot.players.find(p => p.id === host.sessionId);
    assert.equal(original.gold, 325);
    assert.equal(original.roundCoinsEarned, 0);
    assert.deepEqual(original.loadout, { bossDamage: true, necroSkin: 'skeletor', boomSkin: 'orange-knight', sproutSkin: 'skeleton' });
    host.send('command', { action: 'ready' }); guest.send('command', { action: 'ready' });
    const match = [...app.rooms][0].match;
    await until(() => match.started);
    match.board()._queue = []; match.board().enemies = [];
    await until(() => a.snapshot.players.find(p => p.id === host.sessionId).roundCoinsEarned === 1);
    host.reconnection.enabled = false;
    const token = host.reconnectionToken;
    host.connection.close(1000, 'shop reconnect test');
    await until(() => !match.players.get(host.sessionId).connected);
    const restored = await new Client(url).reconnect(token);
    connections.push(restored); const again = observe(restored);
    await until(() => again.snapshot?.players.find(p => p.id === host.sessionId)?.connected);
    const current = again.snapshot.players.find(p => p.id === host.sessionId);
    assert.equal(current.receiptKey, original.receiptKey);
    assert.equal(current.roundCoinsEarned, 1);
    assert.deepEqual(current.loadout, original.loadout);
    assert.deepEqual(match.board().bossDamageOwners, [host.sessionId]);
  } finally {
    for (const room of connections) if (room.connection.isOpen) await room.leave().catch(() => {});
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('Bramble and Sprout costumes belong to their owner and leave combat stats unchanged', () => {
  for (const [type, field, skin] of [['boom', 'boomSkin', 'orange-knight'], ['sprout', 'sproutSkin', 'skeleton']]) {
    const loadout = { [field]: skin };
    const match = pair(loadout);
    const own = place(match, 'a', type, -4), teammate = place(match, 'b', type, 2);
    assert.equal(own.skin, skin);
    assert.equal(teammate.skin, null);
    assert.deepEqual(match.board().getStats(own), match.board().getStats(teammate));
    loadout[field] = null;
    match.setConnected('a', false); match.setConnected('a', true);
    match._syncLoadouts();
    assert.equal(own.skin, skin, 'the room retains its original loadout');
    const snapshot = match.snapshot('costume-room');
    assert.equal(snapshot.boards[0].state.towers.find(tower => tower.id === own.id).skin, skin);
    assert.equal(snapshot.boards[0].state.towers.find(tower => tower.id === teammate.id).skin, null);
  }
});

test('extended browser costumes require a successful versioned health capability', async t => {
  const loadout = { bossDamage: true, necroSkin: 'skeletor', boomSkin: 'orange-knight', sproutSkin: 'skeleton' };
  const original = structuredClone(loadout), sent = [], requests = [];
  const client = new CoopClient({ url: 'https://garden.example/' });
  client.sdk = async () => ({
    create: async (_type, options) => { sent.push(options); return {}; },
    joinById: async (_id, options) => { sent.push(options); return {}; },
  });
  client.attach = () => {};
  let response = { ok: true, json: async () => ({ costumeVersion: 1 }) };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (response instanceof Error) throw response;
    return response;
  });
  await client.connect({ name: 'Alice', mapId: 'meadow', loadout });
  await client.connect({ name: 'Alice', roomId: 'new-room', loadout });
  assert.deepEqual(sent[0].loadout, loadout);
  assert.deepEqual(sent[1].loadout, loadout);
  for (const unavailable of [
    { ok: true, json: async () => ({ version: '0.3.3', shopVersion: 1 }) },
    { ok: true, json: async () => ({ costumeVersion: '1' }) },
    { ok: true, json: async () => ({ costumeVersion: 2 }) },
    { ok: false, json: async () => ({ costumeVersion: 1 }) },
    { ok: true, json: async () => { throw new SyntaxError('Bad JSON'); } },
    new TypeError('Network unavailable'), new DOMException('Timed out', 'TimeoutError'),
  ]) {
    response = unavailable;
    await client.connect({ name: 'Alice', roomId: 'legacy-room', loadout });
    assert.deepEqual(sent.at(-1).loadout, { bossDamage: true, necroSkin: 'skeletor' }, 'fallback keeps existing owned permanent perks');
  }
  assert.equal(requests.length, 9);
  assert.ok(requests.every(request => request.url === 'https://garden.example/healthz' && request.options.cache === 'no-store' && request.options.signal instanceof AbortSignal));
  assert.deepEqual(loadout, original, 'capability filtering does not alter the saved collection');
});
