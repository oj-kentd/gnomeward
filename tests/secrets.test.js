import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMIES, SECRETS, TOWERS } from '../src/data.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);
const gameWithSecrets = (map = 'meadow') => {
  const g = new Game(map, { unlocks: ['gravity', 'crystal', 'necro'] });
  g.gold = 2000;
  g.points = 1000;
  return g;
};
const enemyAt = (g, type, progress) => {
  const enemy = g._spawn(type);
  enemy.progress = progress;
  Object.assign(enemy, g.pointAt(progress));
  return enemy;
};
const run = (g, seconds) => { for (let tick = 0; tick < Math.round(seconds * 20); tick++) g.update(0.05); };
const holeAt = (g, tower, progress, overrides = {}) => {
  const hole = { id: ++g._id, sourceId: tower.id, ...g.pointAt(progress), progress, ttl: 3, maxTtl: 3, radius: 2.2, dps: 3, pullSpeed: 2.2, capture: false, released: [], ...overrides };
  g.holes.push(hole);
  return hole;
};
const barrierAt = (g, tower, progress, overrides = {}) => {
  const barrier = { id: ++g._id, sourceId: tower.id, ...g.pointAt(progress), progress, hp: 70, maxHp: 70, ttl: 20, explosionDamage: 0, explosionRadius: 1.5, ...overrides };
  g.barriers.push(barrier);
  return barrier;
};

test('three unique discoveries on the correct map unlock only its secret guardian and persist', () => {
  const profile = { unlocks: ['stun'] };
  const g = new Game('meadow', profile);
  assert.equal(g.isUnlocked('gravity'), false);
  assert.equal(g.isUnlocked('crystal'), false);
  assert.equal(g.discoverSecret('missing'), false);
  assert.equal(g.discoverSecret(SECRETS.quarry.spots[0].id), false);
  for (const [index, spot] of SECRETS.meadow.spots.entries()) {
    assert.ok(g.discoverSecret(spot.id));
    assert.equal(g.discoverSecret(spot.id), false);
    assert.equal(g.isUnlocked('gravity'), index === 2);
  }
  assert.deepEqual(profile.unlocks, ['stun', 'gravity']);
  assert.equal(g.isUnlocked('crystal'), false);
  assert.equal(g.towers.length, 0, 'Orbit unlocks without a free summon');
  assert.deepEqual(g.events.filter(e => e.type === 'secret-found').map(e => e.count), [1, 2, 3]);
  const next = new Game('quarry', profile);
  assert.equal(next.isUnlocked('gravity'), true);
  assert.equal(next.isUnlocked('stun'), true);
  assert.deepEqual(next.secretDiscoveries, []);
  next.status = 'lost';
  assert.equal(next.discoverSecret(SECRETS.quarry.spots[0].id), false);
});

test('secret spots reserve grass and secret guardians retain the two-path restriction', () => {
  for (const [map, secret] of Object.entries(SECRETS)) {
    const g = gameWithSecrets(map);
    for (const spot of secret.spots) {
      assert.ok(g.pathDistance(spot.x, spot.z) >= 1.3);
      assert.equal(g.canPlace('sprout', spot.x, spot.z), false);
    }
    assert.equal(TOWERS[secret.unit].paths.length, 4);
    assert.ok(TOWERS[secret.unit].paths.every(path => path.costs.length === 3));
    const tower = g.placeTower(secret.unit, ...(map === 'hollow' ? [-7, 0] : [-10, 1.5]));
    assert.ok(tower);
    assert.ok(g.upgradeTower(tower.id, 0));
    assert.ok(g.upgradeTower(tower.id, 1));
    assert.equal(g.upgradeTower(tower.id, 2), false);
    assert.equal(g.setTargeting(tower.id, 'strong'), secret.unit === 'necro');
  }
});

test('Quarry summons exactly one free Prism on first unlock, with valid fallback and no gold exploit', () => {
  const profile = { unlocks: [] };
  const g = new Game('quarry', profile);
  const altar = SECRETS.quarry.summon;
  const blocker = g.placeTower('sprout', altar.x, altar.z);
  assert.ok(blocker);
  g.gold = 0;
  for (const spot of SECRETS.quarry.spots) assert.ok(g.discoverSecret(spot.id));
  const prism = g.towers.find(tower => tower.type === 'crystal');
  assert.ok(prism);
  assert.equal(prism.purchaseCost, 0);
  assert.equal(prism.summoned, true);
  assert.equal(g.gold, 0);
  assert.ok(Math.hypot(prism.x - altar.x, prism.z - altar.z) >= 1.4);
  assert.ok(g.pathDistance(prism.x, prism.z) >= 1.3);
  assert.equal(g.events.filter(e => e.type === 'summoned').length, 1);
  assert.ok(g.sellTower(prism.id));
  assert.equal(g.gold, 0, 'a free summon has no gold sale value');
  for (const spot of SECRETS.quarry.spots) assert.equal(g.discoverSecret(spot.id), false);
  const replay = new Game('quarry', profile);
  for (const spot of SECRETS.quarry.spots) replay.discoverSecret(spot.id);
  assert.equal(replay.towers.length, 0, 'a saved unlock cannot summon another free Prism');
});

test('Orbit creates a well behind its target and rewinds along the trail without teleporting', () => {
  const g = gameWithSecrets();
  const orbit = g.placeTower('gravity', -10, 1.5);
  const enemy = enemyAt(g, 'gold', 2);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.holes.length, 1);
  assert.equal(g.projectiles.length, 0);
  const hole = g.holes[0];
  assert.ok(hole.progress < 2);
  assert.ok(enemy.progress < 2);
  assert.ok(2 - enemy.progress <= hole.pullSpeed * 0.05);
  near(enemy.maxHp - enemy.hp, 3 * 0.05);
  near(orbit.damageDone, 3 * 0.05);
  assert.deepEqual({ x: enemy.x, z: enemy.z }, g.pointAt(enemy.progress));
  orbit.cooldown = 99;
  run(g, 2);
  assert.ok(enemy.progress >= 0);
  assert.ok(hole.released.includes(enemy.id), 'a base well releases its visitor at the center');
  const progress = enemy.progress;
  run(g, 0.2);
  assert.ok(enemy.progress > progress, 'base wells do not capture forever');
});

test('a gravity well affects only enemies ahead and within its path influence; bosses resist pull', () => {
  const g = gameWithSecrets();
  const orbit = g.placeTower('gravity', -10, 1.5);
  orbit.cooldown = 99;
  holeAt(g, orbit, 1);
  const behind = enemyAt(g, 'gold', 0.5);
  const distant = enemyAt(g, 'gold', 8);
  const regular = enemyAt(g, 'gold', 2);
  const boss = enemyAt(g, 'boss', 2);
  g.status = 'wave';
  g.update(0.05);
  near(behind.progress, 0.5 + behind.speed * 0.05);
  near(distant.progress, 8 + distant.speed * 0.05);
  near(behind.hp, behind.maxHp);
  near(distant.hp, distant.maxHp);
  near(regular.progress, 2 + regular.speed * 0.05 - 2.2 * 0.05);
  near(boss.progress, 2 + boss.speed * 0.05 - 2.2 * 0.35 * 0.05);
  near(boss.maxHp - boss.hp, 0.15);
});

test('overlapping wells apply only the strongest pull and damage, credited to its owner', () => {
  const g = gameWithSecrets();
  const first = g.placeTower('gravity', -10, 1.5);
  const second = g.placeTower('gravity', -8.5, 1.5);
  first.cooldown = second.cooldown = 99;
  holeAt(g, first, 0, { radius: 4 });
  holeAt(g, second, 0, { radius: 4, dps: 12, pullSpeed: 4.5 });
  const enemy = enemyAt(g, 'gold', 2);
  g.status = 'wave';
  g.update(0.05);
  near(enemy.progress, 2 + 0.05 - 4.5 * 0.05);
  near(enemy.maxHp - enemy.hp, 12 * 0.05);
  near(first.damageDone, 0);
  near(second.damageDone, 12 * 0.05);
});

test('Event Horizon captures at the center, deals credited lethal damage, and releases on expiry', () => {
  const g = gameWithSecrets();
  const orbit = g.placeTower('gravity', -10, 1.5);
  for (let level = 0; level < 3; level++) g.upgradeTower(orbit.id, 0);
  const stats = g.getStats(orbit);
  assert.equal(stats.capture, true);
  assert.equal(stats.gravityDps, 65);
  orbit.cooldown = 99;
  const hole = holeAt(g, orbit, 0, { capture: true, dps: 65, pullSpeed: 7, ttl: 1 });
  const boss = enemyAt(g, 'boss', 0.01);
  const fragile = enemyAt(g, 'bone', 0.05);
  g.status = 'wave';
  g.update(0.05);
  near(boss.progress, 0);
  assert.equal(boss.capturedBy, hole.id);
  run(g, 0.25);
  assert.equal(fragile.hp, 0);
  assert.equal(orbit.kills, 1);
  near(boss.progress, 0);
  run(g, 0.7);
  assert.equal(g.holes.length, 0);
  assert.equal(boss.capturedBy, null);
  const afterExpiry = boss.progress;
  g.update(0.05);
  assert.ok(boss.progress > afterExpiry);
});

test('Orbit has at most one well and at least five seconds of recovery for every legal build', () => {
  const g = gameWithSecrets();
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) for (let d = 0; d <= 3; d++) {
    const levels = [a, b, c, d];
    if (levels.filter(Boolean).length > 2) continue;
    const stats = g.getStats({ type: 'gravity', levels });
    assert.ok(stats.interval - stats.holeDuration >= 5 - 1e-8);
  }
  const orbit = g.placeTower('gravity', -10, 1.5);
  const boss = enemyAt(g, 'boss', 2);
  g.status = 'wave';
  g.update(0.05);
  const id = g.holes[0].id;
  assert.equal(g._openHole(orbit, g.getStats(orbit), boss), false);
  run(g, 3);
  assert.equal(g.holes.length, 0);
  assert.ok(orbit.cooldown > 5);
  run(g, 5);
  assert.equal(g.holes.length, 0);
  assert.ok(orbit.cooldown > 0);
  assert.ok(!g.holes.some(h => h.id === id));
});

test('Prism raises bounded barriers ahead of enemies, not on them, without firing projectiles', () => {
  const g = gameWithSecrets();
  const prism = g.placeTower('crystal', -10, 1.5);
  const enemy = enemyAt(g, 'gold', 2);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.barriers.length, 1);
  assert.equal(g.projectiles.length, 0);
  assert.ok(g.barriers[0].progress > enemy.progress);
  assert.equal(g.barriers[0].hp, g.getStats(prism).barrierHp);
  assert.equal(g._raiseBarrier(prism, g.getStats(prism), enemy), false, 'do not overlap an existing barrier');
  const other = enemyAt(g, 'gold', 3.8);
  assert.ok(g._raiseBarrier(prism, g.getStats(prism), other));
  assert.equal(g.barriers.length, 2);
  assert.equal(g._raiseBarrier(prism, g.getStats(prism), other), false);
  g.barriers = [];
  const occupying = enemyAt(g, 'gold', other.progress + 0.9);
  assert.equal(g._raiseBarrier(prism, g.getStats(prism), other), false, 'never raise a crystal on another enemy');
  assert.ok(occupying.hp > 0);
});

test('crystals block swept movement and all contacting enemies attack their health', () => {
  const g = gameWithSecrets();
  const prism = g.placeTower('crystal', -10, 1.5);
  prism.cooldown = 99;
  const barrier = barrierAt(g, prism, 2, { hp: 1000, maxHp: 1000 });
  const a = enemyAt(g, 'bone', 1.65);
  const b = enemyAt(g, 'green', 1.65);
  g.status = 'wave';
  run(g, 1);
  near(a.progress, 1.65);
  near(b.progress, 1.65);
  near(barrier.hp, 1000 - ENEMIES.bone.attackDamage - ENEMIES.green.attackDamage);
  const fast = enemyAt(g, 'blue', 0);
  fast.speed = 200;
  g.update(2);
  near(fast.progress, 1.65);
  assert.ok(barrier.hp > 0, 'the high-dt movement cannot skip an intact barrier');
});

test('only enemy-destroyed upgraded crystals explode once and credit kills to Prism', () => {
  const g = gameWithSecrets();
  const prism = g.placeTower('crystal', -10, 1.5);
  prism.cooldown = 99;
  const barrier = barrierAt(g, prism, 2, { hp: 0.1, explosionDamage: 28, explosionRadius: 1.9 });
  const first = enemyAt(g, 'bone', 1.65);
  const second = enemyAt(g, 'bone', 1.6);
  enemyAt(g, 'gold', 10);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(first.hp, 0);
  assert.equal(second.hp, 0);
  assert.equal(prism.kills, 2);
  assert.equal(g.effects.filter(e => e.type === 'explosion').length, 1);
  assert.equal(g.barriers.length, 0);
  g._destroyBarrier(barrier);
  assert.equal(prism.kills, 2);
  assert.equal(g.effects.filter(e => e.type === 'explosion').length, 1);
  const plain = barrierAt(g, prism, 11, { hp: 0.1 });
  g._destroyBarrier(plain);
  assert.equal(g.effects.filter(e => e.type === 'explosion').length, 1, 'base crystals do not explode');
});

test('expired and sold barriers fade without damage, and terrain clears on wave end or loss', () => {
  const g = gameWithSecrets();
  const prism = g.placeTower('crystal', -10, 1.5);
  const orbit = g.placeTower('gravity', -8.5, 1.5);
  prism.cooldown = orbit.cooldown = 99;
  barrierAt(g, prism, 2, { ttl: 0.05, explosionDamage: 95 });
  const enemy = enemyAt(g, 'gold', 1.65);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.barriers.length, 0);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(g.effects.filter(e => e.type === 'explosion').length, 0);
  barrierAt(g, prism, 2, { explosionDamage: 95 });
  holeAt(g, orbit, 1);
  g.sellTower(prism.id);
  g.sellTower(orbit.id);
  assert.equal(g.barriers.length, 0);
  assert.equal(g.holes.length, 0);
  assert.equal(g.effects.filter(e => e.type === 'explosion').length, 0);
  for (const lost of [false, true]) {
    const next = gameWithSecrets();
    const tower = next.placeTower('crystal', -10, 1.5);
    barrierAt(next, tower, 2);
    holeAt(next, tower, 1);
    next.status = 'wave';
    if (lost) { next.lives = 1; enemyAt(next, 'gold', next.pathLength - 0.001); }
    next.update(0.05);
    assert.equal(next.status, lost ? 'lost' : 'planning');
    assert.equal(next.barriers.length, 0);
    assert.equal(next.holes.length, 0);
  }
});
