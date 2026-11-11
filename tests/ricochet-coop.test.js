import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../server/match.js';
import { applyCoopSnapshot } from '../src/multiplayer.js';
import { TOWERS } from '../src/data.js';

function fixture() {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('a', 'Alice'); match.addPlayer('b', 'Bob');
  const game = match.board();
  game.profile.unlocks.push('multi', 'necro');
  match.players.get('a').gold = 2000;
  match.players.get('a').points = 1000;
  match._syncWallets();
  return { match, game };
}

test('Skip co-op placement and upgrades charge only its owner and reject teammate edits', () => {
  const { match, game } = fixture();
  match.command('a', { action: 'place', type: 'ricochet', x: -4, z: 0 });
  const skip = game.towers.find(t => t.type === 'ricochet');
  assert.ok(skip);
  assert.equal(skip.ownerId, 'a');
  assert.equal(match.players.get('a').gold, 2000 - TOWERS.ricochet.cost);
  const b = structuredClone(match.players.get('b'));
  assert.throws(() => match.command('b', { action: 'upgrade', towerId: skip.id, path: 1 }), /own gnomes/);
  match.command('a', { action: 'upgrade', towerId: skip.id, path: 1 });
  match.command('a', { action: 'upgrade', towerId: skip.id, path: 0 });
  assert.deepEqual(skip.levels, [1, 1]);
  assert.deepEqual(match.players.get('b'), b);
  assert.equal(match.players.get('a').points, 1000 - TOWERS.ricochet.paths[0].costs[0] - TOWERS.ricochet.paths[1].costs[0]);
});

test('Skip tri-fusion and bouncing projectiles survive snapshots and reconnects', () => {
  const { match, game } = fixture();
  const make = (type, x) => {
    const tower = game._makeTower(type, x, 0, TOWERS[type].cost);
    tower.ownerId = 'a'; return tower;
  };
  const tumble = make('multi', -4), morrow = make('necro', -2), skip = make('ricochet', 0);
  skip.levels = [2, 3];
  match.command('a', { action: 'merge', towerId: tumble.id, otherTowerId: morrow.id });
  match.command('a', { action: 'merge', towerId: tumble.id, otherTowerId: skip.id });
  assert.equal(tumble.fusionKey, 'multi-necro-ricochet');
  game._launch(skip, { x: 2, z: 1 }, game.getStats(skip));
  game._advanceProjectiles(0.1);
  assert.equal(game.projectiles.length, 4);
  assert.ok(game.projectiles.every(p => p.type === 'ricochet-ball' && p.summonOnKill));
  match.setConnected('a', false); match.setConnected('a', true);
  const snapshot = match.snapshot('skip-room');
  const client = applyCoopSnapshot(null, snapshot, 'a');
  assert.equal(client.multiplayer.fusionCatalogVersion, 3);
  assert.equal(client.multiplayer.ricochetSupported, true);
  assert.deepEqual(client.game.projectiles, game.projectiles);
  assert.deepEqual(client.game.getFusionMembers(tumble.id).map(t => t.type).sort(), ['multi', 'necro', 'ricochet']);
  assert.deepEqual(client.game.towers.find(t => t.id === skip.id).levels, [2, 3]);
  snapshot.boards[0].state.projectiles[0].ttl = 0;
  assert.ok(game.projectiles[0].ttl > 0, 'snapshot mutations do not change authoritative projectiles');
});

test('older servers retain their original fusion catalog and do not advertise Skip', () => {
  const { match } = fixture();
  for (const version of [undefined, 1, 2, 3, 99]) {
    const snapshot = match.snapshot();
    delete snapshot.ricochetVersion;
    snapshot.fusionCatalogVersion = version;
    const { multiplayer } = applyCoopSnapshot(null, snapshot, 'a');
    assert.equal(multiplayer.ricochetSupported, false);
    assert.equal(multiplayer.fusionCatalogVersion, [2, 3].includes(version) ? version : 1);
  }
});
