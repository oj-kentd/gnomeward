import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';

const garden = () => new Game('strawberry', { unlocks: [] });
function target(game, x, z, hp = 1000) {
  const enemy = game._spawn('bone');
  Object.assign(enemy, { x, z, hp, maxHp: hp });
  return enemy;
}
function clear(game, wave) {
  game.wave = wave;
  game.status = 'wave';
  game._queue = [];
  game.enemies = [];
  game.update(.05);
}

test('Strawberry Fields has two entrances and one free guardian without unlocking the shop', () => {
  const game = garden();
  assert.equal(game.routes.length, 2);
  assert.notDeepEqual(game.pointAt(0, 0), game.pointAt(0, 1));
  assert.deepEqual(game.pointAt(game.routeLength(0), 0), game.pointAt(game.routeLength(1), 1));
  assert.equal(game.towers.length, 1);
  const tower = game.towers[0];
  assert.equal(tower.type, 'strawberry');
  assert.equal(tower.purchaseCost, 0);
  assert.equal(tower.starting, true);
  assert.ok(game.pathDistance(tower.x, tower.z) >= 1.3);
  assert.equal(game.gold, 650);
  assert.equal(game.isUnlocked('strawberry'), false);
  assert.equal(game.canPlace('strawberry', 0, -3), false);
  assert.deepEqual([game._spawn('bone').routeIndex, game._spawn('bone').routeIndex], [0, 1]);
  assert.ok(game.sellTower(tower.id));
  assert.equal(game.gold, 650, 'the free guardian cannot be sold for gold');
  assert.equal(new Game('meadow').towers.length, 0);
});

test('only a completed Strawberry Fields campaign unlocks Strawberry permanently', () => {
  const game = garden();
  clear(game, 10);
  assert.equal(game.isUnlocked('strawberry'), false);
  clear(game, 19);
  assert.equal(game.isUnlocked('strawberry'), false);
  clear(game, 20);
  assert.equal(game.status, 'won');
  assert.equal(game.isUnlocked('strawberry'), true);
  assert.equal(new Game('meadow', game.profile).isUnlocked('strawberry'), true);
  assert.equal(game.events.filter(event => event.type === 'unlock' && event.tower === 'strawberry').length, 1);
  const wrongMap = new Game('meadow');
  clear(wrongMap, 20);
  assert.equal(wrongMap.isUnlocked('strawberry'), false);
  const loss = garden();
  loss.lives = 0;
  clear(loss, 20);
  assert.equal(loss.status, 'lost');
  assert.equal(loss.isUnlocked('strawberry'), false);
});

test('three Strawberry paths improve distinct abilities and only two may be chosen', () => {
  const game = garden(), tower = game.towers[0];
  assert.equal(TOWERS.strawberry.paths.length, 3);
  const base = game.getStats(tower);
  const [fruit, seeds, harvest] = [[3,0,0],[0,3,0],[0,0,3]].map(levels => game.getStats({ ...tower, levels }));
  assert.ok(fruit.damage > base.damage && fruit.explosionRadius > base.explosionRadius);
  assert.ok(seeds.seedCount > base.seedCount && seeds.seedDamage > base.seedDamage && seeds.seedPierce > base.seedPierce);
  assert.ok(harvest.interval < base.interval && harvest.flightDuration < base.flightDuration);
  game.points = 1000;
  assert.ok(game.upgradeTower(tower.id, 0));
  assert.ok(game.upgradeTower(tower.id, 1));
  assert.equal(game.upgradeTower(tower.id, 2), false);
  assert.ok(game.upgradeTower(tower.id, 1));
  assert.ok(game.upgradeTower(tower.id, 1));
  assert.equal(game.upgradeTower(tower.id, 1), false);
});

test('mortar targets a fixed spot, can miss a moving target, and bursts even after its target dies', () => {
  const game = garden(), tower = game.towers[0], stats = game.getStats(tower);
  const original = target(game, 4, 0);
  const nearby = target(game, 4, 1);
  game._launch(tower, original, stats);
  const shot = game.projectiles[0];
  assert.equal(shot.type, 'strawberry-mortar');
  original.x = 10;
  game._advanceProjectiles(stats.flightDuration / 2);
  assert.equal(shot.tx, 4);
  assert.equal(original.hp, 1000);
  assert.equal(nearby.hp, 1000, 'damage waits for landing');
  game._advanceProjectiles(stats.flightDuration / 2);
  assert.equal(original.hp, 1000, 'moving outside the impact radius avoids blast damage');
  assert.equal(nearby.hp, 1000 - stats.damage);
  assert.equal(game.projectiles.filter(p => p.type === 'strawberry-seed').length, stats.seedCount);
  game.projectiles = [];
  game._launch(tower, nearby, stats);
  nearby.hp = 0;
  const later = target(game, 4, 1);
  game._advanceProjectiles(stats.flightDuration);
  assert.equal(later.hp, 1000 - stats.damage);
});

test('seed shrapnel sweeps radial rays, respects pierce, and never hits a target twice', () => {
  const game = garden(), tower = game.towers[0];
  tower.levels = [0, 2, 0];
  const stats = game.getStats(tower);
  const first = target(game, 1, 0), second = target(game, 2, 0), third = target(game, 3, 0);
  const offRay = target(game, 1, 1);
  game._burstStrawberry({ tx: 0, tz: 0, sourceId: tower.id, radius: 0, damage: 0, ...stats });
  // Isolate the eastbound seed so neighbouring radial rays cannot obscure its collision accounting.
  const seed = game.projectiles.find(p => p.tx > 0 && p.tz === 0);
  game.projectiles = [seed];
  game._advanceProjectiles(.15);
  assert.equal(first.hp, 1000 - stats.seedDamage);
  game._advanceProjectiles(.35);
  assert.equal(first.hp, 1000 - stats.seedDamage);
  assert.equal(second.hp, 1000 - stats.seedDamage);
  assert.equal(third.hp, 1000);
  assert.equal(offRay.hp, 1000);
  assert.equal(game.projectiles.length, 0, 'pierce exhausted');
});

test('Strawberry defeats award rewards once without recursive seed explosions', () => {
  const game = garden(), tower = game.towers[0], stats = game.getStats(tower);
  target(game, 1, 1, 1);
  const gold = game.gold;
  game._launch(tower, game.enemies[0], stats);
  game._advanceProjectiles(stats.flightDuration);
  assert.equal(game.kills, 1);
  assert.equal(tower.kills, 1);
  assert.equal(game.gold, gold + 6);
  assert.equal(game.effects.filter(effect => effect.type === 'explosion').length, 1);
  assert.equal(game.projectiles.length, stats.seedCount);
  game._advanceProjectiles(1);
  assert.equal(game.kills, 1);
  assert.equal(game.projectiles.length, 0);
});
