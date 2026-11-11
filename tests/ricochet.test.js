import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';

const setup = (levels = [0, 0]) => {
  const game = new Game();
  const tower = game._makeTower('ricochet', 0, 0, TOWERS.ricochet.cost);
  tower.levels = levels;
  return { game, tower };
};
const fire = (game, tower, x = 4, z = 0) => {
  game._launch(tower, { x, z }, game.getStats(tower));
  return game.projectiles.at(-1);
};
const victim = (game, x, z, hp = 100) => Object.assign(game._spawn('bone'), { x, z, hp, maxHp: hp });

test('Skip is available from the start with two independent upgrade paths', () => {
  const { game, tower } = setup();
  assert.equal(game.isUnlocked('ricochet'), true);
  assert.equal(TOWERS.ricochet.paths.length, 2);
  game.points = 1000;
  for (let tier = 0; tier < 3; tier++) {
    assert.equal(game.upgradeTower(tower.id, 0), true);
    assert.equal(game.upgradeTower(tower.id, 1), true);
  }
  assert.equal(game.getStats(tower).ballLifetime, 6);
  assert.equal(game.getStats(tower).ballCount, 4);
  assert.equal(game.upgradeTower(tower.id, 1), false);
});

test('each volley tier emits 1, 2, 3, then 4 different angles from one target', () => {
  for (let tier = 0; tier <= 3; tier++) {
    const { game, tower } = setup([0, tier]);
    fire(game, tower);
    assert.equal(game.projectiles.length, tier + 1);
    assert.equal(new Set(game.projectiles.map(p => Math.atan2(p.vz, p.vx))).size, tier + 1);
    assert.equal(game.projectiles[0].vz, 0);
    for (const shot of game.projectiles) assert.ok(Math.abs(Math.hypot(shot.vx, shot.vz) - 9) < 1e-9);
  }
});

test('balls bounce across multiple walls identically with large and small timesteps', () => {
  for (const target of [[4, 0], [0, 4], [12.8, 7.8]]) {
    const a = setup(), b = setup();
    fire(a.game, a.tower, ...target); fire(b.game, b.tower, ...target);
    a.game._advanceProjectiles(5.5);
    for (let i = 0; i < 110; i++) b.game._advanceProjectiles(0.05);
    const x = a.game.projectiles[0], y = b.game.projectiles[0];
    assert.ok(Math.abs(x.x - y.x) < 1e-7);
    assert.ok(Math.abs(x.z - y.z) < 1e-7);
    assert.ok(Math.abs(x.vx - y.vx) < 1e-7);
    assert.ok(Math.abs(x.vz - y.vz) < 1e-7);
    assert.ok(Math.abs(x.x) <= 12.8 && Math.abs(x.z) <= 7.8);
  }
});

test('swept collision hits the first enemy even when enemy array order differs', () => {
  const { game, tower } = setup();
  const far = victim(game, 6, 0), near = victim(game, 2, 0);
  fire(game, tower);
  game._advanceProjectiles(1);
  assert.equal(near.hp, 82);
  assert.equal(far.hp, 100);
  assert.equal(game.projectiles.length, 0);
  assert.equal(tower.damageDone, 18);
});

test('a missed ball survives target death and can hit on its return from a wall', () => {
  const { game, tower } = setup();
  fire(game, tower);
  game._advanceProjectiles(1.4);
  const enemy = victim(game, 10, 0, 1);
  game._advanceProjectiles(0.5);
  assert.equal(enemy.hp, 0);
  assert.equal(tower.kills, 1);
  assert.equal(game.projectiles.length, 0);
});

test('fused balls detonate at six seconds at their reflected position and apply splash', () => {
  const { game, tower } = setup([1, 0]);
  fire(game, tower);
  game._advanceProjectiles(5.9);
  const enemy = victim(game, 2.8, 1, 100);
  const outside = victim(game, 2.8, 2.1, 100);
  assert.equal(game.effects.length, 0);
  game._advanceProjectiles(0.2);
  assert.equal(game.projectiles.length, 0);
  assert.equal(enemy.hp, 70);
  assert.equal(outside.hp, 100);
  assert.equal(game.effects.at(-1).type, 'explosion');
  assert.ok(Math.abs(game.effects.at(-1).x - 2.8) < 1e-7);
});

test('base balls fade without explosions and contact consumes fused balls', () => {
  const { game, tower } = setup();
  fire(game, tower);
  game._advanceProjectiles(20);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.effects.length, 0);
  tower.levels[0] = 3;
  const target = victim(game, 1, 0), nearby = victim(game, 1, 1);
  fire(game, tower);
  game._advanceProjectiles(7);
  assert.equal(target.hp, 82);
  assert.equal(nearby.hp, 100);
  assert.equal(game.effects.some(e => e.type === 'explosion'), false);
});

test('ricochet damage respects physical resistance and retains source ownership', () => {
  const { game, tower } = setup();
  const enemy = victim(game, 1, 0);
  enemy.trait = 'armored';
  fire(game, tower);
  game._advanceProjectiles(1);
  assert.equal(enemy.hp, 91);
  assert.equal(tower.damageDone, 9);
});

test('one attack cycle creates one full volley even with several enemies in range', () => {
  const { game, tower } = setup([0, 3]);
  for (let i = 1; i <= 4; i++) {
    const enemy = victim(game, i, 0);
    enemy.speed = 0;
  }
  game.status = 'wave';
  game.update(0.05);
  assert.equal(game.projectiles.filter(p => p.type === 'ricochet-ball').length, 4);
  assert.ok(tower.cooldown > 0);
});

test('tri-fusion preserves Skip upgrades and ball kills summon Morrow guardians', () => {
  const { game, tower } = setup([1, 2]);
  const tumble = game._makeTower('multi', 1, 0, TOWERS.multi.cost);
  const morrow = game._makeTower('necro', 2, 0, TOWERS.necro.cost);
  assert.equal(game.mergeTowers(tumble.id, morrow.id), true);
  assert.equal(game.mergeTowers(tumble.id, tower.id), true);
  assert.deepEqual(tower.levels, [1, 2]);
  assert.equal(game.getStats(tower).ballCount, 3);
  const enemy = victim(game, 3, 0, 1);
  fire(game, tower);
  game._advanceProjectiles(0.5);
  assert.equal(enemy.hp, 0);
  assert.equal(morrow.soulQueue.length, 1);
  assert.equal(tower.kills, 1);
});
