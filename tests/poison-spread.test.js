import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const run = (g, seconds) => { for (let tick = 0; tick < Math.round(seconds * 20); tick++) g.update(0.05); };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
const enemyAt = (g, progress, routeIndex = 0, type = 'gold') => {
  const enemy = g._spawn(type, routeIndex);
  enemy.progress = progress;
  enemy.speed = 0;
  Object.assign(enemy, g.pointAt(progress, routeIndex));
  return enemy;
};
function infectedSource(tier, map = 'meadow') {
  const g = new Game(map);
  const tower = g.placeTower('spore', ...(map === 'creek' ? [2, 2] : [-10, 1.5]));
  g.points = 1000;
  for (let i = 0; i < tier; i++) assert.ok(g.upgradeTower(tower.id, 3));
  const source = enemyAt(g, map === 'creek' ? 27 : 2);
  g._plant(tower, g.getStats(tower));
  const trap = g.traps.at(-1);
  assert.ok(trap);
  source.progress = trap.progress;
  Object.assign(source, { x: trap.x, z: trap.z });
  tower.cooldown = 99;
  g.status = 'wave';
  g.update(0.05);
  assert.ok(source.poison);
  assert.equal(g.traps.length, 0);
  return { g, tower, source };
}

test('Morel spreads poison only after Wild Garden is unlocked and only after its first full interval', () => {
  for (const tier of [0, 1]) {
    const { g, tower, source } = infectedSource(tier);
    const target = enemyAt(g, source.progress - 1.1);
    run(g, 0.95);
    assert.equal(target.poison, null, 'no per-frame or instant transmission');
    g.update(0.05);
    if (tier === 0) {
      assert.equal(target.poison, null);
      run(g, 1);
      assert.equal(target.poison, null);
    } else {
      assert.ok(target.poison);
      assert.equal(target.poison.secondary, true);
      assert.equal(target.poison.sourceId, tower.id);
      near(target.poison.dps, source.poison.dps * 0.65);
      near(target.poison.remaining, source.poison.remaining);
      const effect = g.effects.find(effect => effect.type === 'poison-spread');
      assert.equal(effect.targetId, target.id);
      assert.equal(effect.maxTtl, 0.3);
    }
  }
});

test('Wild Garden improves spread radius and target budget while respecting the two-path limit', () => {
  const g = new Game();
  const tower = g.placeTower('spore', -10, 1.5);
  g.points = 1000;
  for (let tier = 1; tier <= 3; tier++) {
    assert.ok(g.upgradeTower(tower.id, 3));
    const stats = g.getStats(tower);
    near(stats.poisonSpreadRadius, 0.7 + tier * 0.6);
    assert.equal(stats.poisonSpreadTargets, tier);
    assert.equal(stats.poisonSpreadInterval, 1);
    assert.equal(stats.poisonSpreadMultiplier, 0.65);
  }
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.upgradeTower(tower.id, 1), false);
});

test('transmission is limited to one target per second and a finite per-infection budget', () => {
  const { g, source } = infectedSource(3);
  const targets = [1, 1.4, 1.9, 2.4].map(offset => enemyAt(g, source.progress - offset));
  for (let pulse = 1; pulse <= 3; pulse++) {
    run(g, 0.95);
    assert.equal(targets.filter(target => target.poison).length, pulse - 1);
    g.update(0.05);
    assert.equal(targets.filter(target => target.poison).length, pulse);
    assert.equal(g.effects.filter(effect => effect.type === 'poison-spread').length, 1);
    assert.equal(source.poison.spreadTargetsLeft, 3 - pulse);
  }
  run(g, 0.5);
  assert.equal(targets[3].poison, null, 'spending the budget prevents further transmissions');
});

test('secondary poison cannot chain or refresh anyone and expires with its original infection', () => {
  const { g, source } = infectedSource(3);
  const secondary = enemyAt(g, source.progress - 2.2);
  const outsideSourceRadius = enemyAt(g, 0);
  assert.ok(Math.hypot(source.x - outsideSourceRadius.x, source.z - outsideSourceRadius.z) > 2.5);
  run(g, 1);
  assert.ok(secondary.poison);
  assert.equal(secondary.poison.spreadTargetsLeft, 0);
  run(g, 2);
  assert.equal(outsideSourceRadius.poison, null);
  run(g, 1.1);
  assert.equal(source.poison, null);
  assert.equal(secondary.poison, null);
  assert.equal(outsideSourceRadius.poison, null);
  const health = secondary.hp;
  run(g, 0.5);
  near(secondary.hp, health, 'expired poison cannot keep dealing damage');
});

test('spread deaths retain Morel kill and damage credit', () => {
  const { g, tower, source } = infectedSource(1);
  const target = enemyAt(g, source.progress - 1.1, 0, 'bone');
  target.hp = 5;
  const gold = g.gold;
  run(g, 3);
  assert.equal(target.hp, 0);
  assert.equal(tower.kills, 1);
  assert.equal(g.kills, 1);
  assert.equal(g.gold, gold + 6);
  assert.ok(tower.damageDone >= 5 + 6 * 2.9);
});

test('nearby enemies on different routes can share poison without comparing route progress', () => {
  const { g, tower, source } = infectedSource(1, 'creek');
  const routeOffset = g.routeLength(0) - g.routeLength(1);
  const target = enemyAt(g, source.progress - routeOffset - 1.1, 1);
  assert.ok(Math.abs(source.progress - target.progress) > 8);
  near(Math.hypot(source.x - target.x, source.z - target.z), 1.1);
  run(g, 1);
  assert.equal(target.poison.sourceId, tower.id);
  assert.equal(target.poison.secondary, true);
  assert.equal(target.routeIndex, 1);
});
