import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../server/match.js';
import { applyCoopSnapshot } from '../src/multiplayer.js';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';

function fixture() {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('a', 'Alice', { tumbleSpeed: true, sproutSkin: 'skeleton', necroSkin: 'skeletor' });
  match.addPlayer('b', 'Bob');
  const game = match.board();
  game.profile.unlocks.push('multi', 'necro');
  const make = (type, owner, x) => {
    const tower = game._makeTower(type, x, 0, TOWERS[type].cost);
    tower.ownerId = owner;
    return tower;
  };
  const sprout = make('sprout', 'a', -4), tumble = make('multi', 'a', -2), morrow = make('necro', 'a', 0);
  const friend = make('sprout', 'b', 2);
  match.players.get('a').points = 100;
  match._syncLoadouts(); match._syncWallets();
  return { match, game, sprout, tumble, morrow, friend };
}
const merge = (match, owner, a, b) => match.command(owner, { action: 'merge', towerId: a.id, otherTowerId: b.id });

test('co-op merges are server-owned, keep component upgrades, and snapshot as one visible form', () => {
  const { match, game, sprout, tumble, morrow } = fixture();
  const wallet = match.players.get('a').gold;
  merge(match, 'a', sprout, tumble);
  assert.equal(sprout.fusionKey, 'multi-sprout');
  assert.equal(tumble.fusionParentId, sprout.id);
  assert.equal(match.players.get('a').gold, wallet);
  match.command('a', { action: 'upgrade', towerId: tumble.id, path: 0 });
  assert.equal(tumble.levels[0], 1);
  assert.equal(match.players.get('a').points, 100 - TOWERS.multi.paths[0].costs[0]);
  merge(match, 'a', sprout, morrow);
  assert.equal(sprout.fusionKey, 'multi-necro-sprout');
  assert.equal(game.getFusionMembers(sprout.id).length, 3);
  match._syncLoadouts();
  for (const member of game.getFusionMembers(sprout.id)) assert.equal(member.skin, null, 'loadout sync must not restore costumes on merged members');
  assert.equal(match.players.get('a').loadout.sproutSkin, 'skeleton');
  const snapshot = match.snapshot('fusion-room');
  assert.equal(snapshot.fusionVersion, 1);
  const client = applyCoopSnapshot(null, snapshot, 'a');
  assert.equal(client.multiplayer.fusionsSupported, true);
  assert.equal(client.game.towers.filter(t => t.fusionParentId == null && t.ownerId === 'a').length, 1);
  for (const member of client.game.getFusionMembers(sprout.id)) {
    assert.equal(client.game.getStats(member).interval, game.getStats(game.towers.find(t => t.id === member.id)).interval);
    const normal = new Game().getStats({ ...member, fusionKey: undefined, fusionParentId: undefined });
    assert.ok(Math.abs(client.game.getStats(member).interval * 3 - normal.interval) < 1e-10);
  }
  match.setConnected('a', false); match.setConnected('a', true);
  assert.equal(match.snapshot('fusion-room').boards[0].state.towers.find(t => t.id === sprout.id).fusionKey, 'multi-necro-sprout');
});

test('merge commands reject other owners, malformed IDs, duplicate types, and hidden components without mutation', () => {
  const { match, game, sprout, tumble, morrow, friend } = fixture();
  const before = JSON.stringify(game.towers);
  for (const command of [
    { action: 'merge', towerId: sprout.id, otherTowerId: friend.id },
    { action: 'merge', towerId: friend.id, otherTowerId: sprout.id },
    { action: 'merge', towerId: sprout.id, otherTowerId: '2' },
    { action: 'merge', towerId: sprout.id, otherTowerId: -1 },
    { action: 'merge', towerId: sprout.id, otherTowerId: sprout.id },
  ]) assert.throws(() => match.command('a', command));
  assert.equal(JSON.stringify(game.towers), before);
  merge(match, 'a', sprout, tumble);
  assert.throws(() => merge(match, 'a', tumble, morrow));
  const duplicate = game._makeTower('sprout', 4, 0, 100); duplicate.ownerId = 'a';
  assert.throws(() => merge(match, 'a', sprout, duplicate));
  assert.throws(() => match.command('b', { action: 'upgrade', towerId: tumble.id, path: 0 }));
  assert.throws(() => match.command('b', { action: 'sell', towerId: tumble.id }));
  assert.equal(game.getFusionMembers(sprout.id).length, 2);
});

test('selling a co-op fusion refunds only its owner once and removes the entire group', () => {
  const { match, game, sprout, tumble, morrow, friend } = fixture();
  merge(match, 'a', sprout, morrow); merge(match, 'a', sprout, tumble);
  const ownerGold = match.players.get('a').gold, otherGold = match.players.get('b').gold;
  const refund = [sprout, tumble, morrow].reduce((sum, tower) => sum + Math.floor(tower.purchaseCost * .75), 0);
  match.command('a', { action: 'sell', towerId: sprout.id });
  assert.equal(match.players.get('a').gold, ownerGold + refund);
  assert.equal(match.players.get('b').gold, otherGold);
  assert.deepEqual(game.towers.map(t => t.id), [friend.id]);
  assert.throws(() => match.command('a', { action: 'sell', towerId: tumble.id }));
  assert.equal(match.players.get('a').gold, ownerGold + refund);
});

test('old co-op snapshots do not offer fusion controls; unboosted teammate remains unchanged', () => {
  const { match, game, sprout, tumble, friend } = fixture();
  merge(match, 'a', sprout, tumble);
  assert.equal(game.getStats(friend).interval, new Game().getStats(friend).interval);
  const snapshot = match.snapshot('old-room'); delete snapshot.fusionVersion;
  assert.equal(applyCoopSnapshot(null, snapshot, 'a').multiplayer.fusionsSupported, false);
});

test('two WebSocket clients receive identical fusions and reconnect preserves the merged unit', { timeout: 20000 }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { setTimeout: delay } = await import('node:timers/promises');
  const { Client } = await import('@colyseus/sdk');
  const { startServer } = await import('../server/index.js');
  const { readConfig } = await import('../server/config.js');
  const directory = await mkdtemp(join(tmpdir(), 'gnomeward-fusion-'));
  const app = await startServer(readConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory, MAX_ROOMS: '1' }));
  const url = `http://127.0.0.1:${app.port}`, connections = [];
  const until = async check => {
    const end = Date.now() + 5000;
    while (Date.now() < end) { if (check()) return; await delay(20); }
    throw new Error('Timed out waiting for fusion snapshot');
  };
  const observe = room => {
    const view = { errors: [] };
    room.onMessage('snapshot', value => { view.snapshot = value; });
    room.onMessage('command-error', error => view.errors.push(error));
    room.onError(() => {}); room.send('snapshot');
    return view;
  };
  try {
    assert.equal((await (await fetch(`${url}/healthz`)).json()).fusionVersion, 1);
    const host = await new Client(url).create('gnomeward', { protocol: 1, name: 'Host', mode: 'coop', mapId: 'meadow', loadout: { tumbleSpeed: true, sproutSkin: 'skeleton' } });
    connections.push(host); const a = observe(host);
    const guest = await new Client(url).joinById(host.roomId, { protocol: 1, name: 'Guest' });
    connections.push(guest); const b = observe(guest);
    await until(() => a.snapshot?.players.length === 2 && b.snapshot?.players.length === 2);
    const match = [...app.rooms][0].match, game = match.board();
    // Fixture unlock/funding bypasses lengthy progression; merge/upgrade/sell all use real transport commands.
    game.profile.unlocks.push('multi', 'necro');
    const units = ['sprout', 'multi', 'necro'].map((type, i) => {
      const tower = game._makeTower(type, -4 + i * 2, 0, TOWERS[type].cost); tower.ownerId = host.sessionId; return tower;
    });
    match.players.get(host.sessionId).points = 100; match._syncLoadouts(); match._syncWallets();
    host.send('command', { action: 'merge', towerId: units[0].id, otherTowerId: units[1].id });
    await until(() => [a,b].every(view => view.snapshot.boards[0].state.towers.find(t => t.id === units[0].id)?.fusionKey === 'multi-sprout'));
    guest.send('command', { action: 'merge', towerId: units[0].id, otherTowerId: units[2].id });
    await until(() => b.errors.length === 1);
    assert.equal(game.getFusionMembers(units[0].id).length, 2);
    host.send('command', { action: 'merge', towerId: units[0].id, otherTowerId: units[2].id });
    await until(() => [a,b].every(view => view.snapshot.boards[0].state.towers.find(t => t.id === units[0].id)?.fusionKey === 'multi-necro-sprout'));
    host.send('command', { action: 'upgrade', towerId: units[1].id, path: 0 });
    await until(() => [a,b].every(view => view.snapshot.boards[0].state.towers.find(t => t.id === units[1].id)?.levels[0] === 1));
    host.reconnection.enabled = false;
    const token = host.reconnectionToken;
    host.connection.close(1000, 'fusion reconnect test');
    await until(() => !match.players.get(host.sessionId).connected);
    const restored = await new Client(url).reconnect(token); connections.push(restored); const again = observe(restored);
    await until(() => again.snapshot?.players.find(p => p.id === host.sessionId)?.connected);
    const client = applyCoopSnapshot(null, again.snapshot, host.sessionId);
    assert.equal(client.multiplayer.fusionsSupported, true);
    assert.equal(client.game.getFusionMembers(units[0].id).length, 3);
    assert.equal(client.game.getStats(client.game.towers.find(t => t.id === units[0].id)).interval, .95 / 3);
    const beforeGold = match.players.get(host.sessionId).gold;
    restored.send('command', { action: 'sell', towerId: units[0].id });
    await until(() => again.snapshot.boards[0].state.towers.length === 0 && b.snapshot.boards[0].state.towers.length === 0);
    assert.equal(match.players.get(host.sessionId).gold, beforeGold + units.reduce((sum,t) => sum + Math.floor(t.purchaseCost * .75), 0));
    assert.deepEqual(a.errors, []); assert.deepEqual(again.errors, []);
  } finally {
    for (const room of connections) if (room.connection.isOpen) await room.leave().catch(() => {});
    await app.stop(); await rm(directory, { recursive: true, force: true });
  }
});
