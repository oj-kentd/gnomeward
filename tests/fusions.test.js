import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS, NECRO_PATH_SECRET } from '../src/data.js';
import { FUSIONS, fusionKey } from '../src/fusions.js';

const setup = (profile = {}) => {
  const game = new Game('meadow', { unlocks: ['multi', 'necro'], ...profile });
  const towers = Object.fromEntries(['sprout', 'multi', 'necro'].map((type, i) => [type, game._makeTower(type, -4 + i * 2, 0, TOWERS[type].cost)]));
  return { game, ...towers };
};
const victim = game => {
  const enemy = game._spawn('bone');
  enemy.hp = 1;
  return enemy;
};

test('all pair recipes and either merge order converge on the same Trinity abilities', () => {
  assert.equal(fusionKey(['sprout', 'multi']), 'multi-sprout');
  assert.equal(fusionKey(['sprout', 'sprout']), null);
  assert.equal(fusionKey(['multi', 'boom']), null);
  assert.equal(fusionKey(['__proto__']), null);
  for (const order of [['sprout', 'multi', 'necro'], ['sprout', 'necro', 'multi'], ['multi', 'sprout', 'necro'], ['multi', 'necro', 'sprout'], ['necro', 'sprout', 'multi'], ['necro', 'multi', 'sprout']]) {
    const f = setup(), [a, b, c] = order.map(type => f[type]);
    const before = f.game.gold;
    assert.equal(f.game.mergeTowers(a.id, b.id), true);
    assert.equal(a.fusionKey, fusionKey([a.type, b.type]));
    assert.equal(f.game.mergeTowers(c.id, a.id), true);
    assert.equal(c.fusionKey, 'multi-necro-sprout');
    assert.equal(FUSIONS[c.fusionKey].name, 'Trinity');
    assert.deepEqual(f.game.getFusionMembers(a.id).map(t => t.type), ['multi', 'necro', 'sprout']);
    assert.equal(f.game.getFusionRoot(b.id), c);
    assert.equal(f.game.gold, before);
    assert.equal(f.game.towers.filter(t => t.fusionParentId == null).length, 1);
  }
});

test('fusion rejects duplicates, hidden children, invalid ids, other owners, and completed games', () => {
  const { game, sprout, multi, necro } = setup();
  const duplicate = game._makeTower('sprout', 4, 0, 100);
  assert.equal(game.canMergeTowers(sprout.id, duplicate.id), false);
  assert.equal(game.canMergeTowers(sprout.id, sprout.id), false);
  assert.equal(game.canMergeTowers(sprout.id, 9000), false);
  multi.ownerId = 'other';
  assert.equal(game.mergeTowers(sprout.id, multi.id), false);
  delete multi.ownerId;
  assert.equal(game.mergeTowers(sprout.id, multi.id), true);
  assert.equal(game.mergeTowers(multi.id, necro.id), false);
  assert.equal(game.mergeTowers(sprout.id, duplicate.id), false);
  for (const status of ['won', 'lost', 'paused']) {
    game.status = status;
    assert.equal(game.mergeTowers(sprout.id, necro.id), false);
  }
  game.status = 'wave';
  assert.equal(game.mergeTowers(sprout.id, necro.id), true);
});

test('fusion retains component ids, upgrades, growth, queues and flying shots while removing costumes', () => {
  const { game, sprout, necro } = setup();
  sprout.levels = [1, 0, 0, 2]; sprout.kills = 17; sprout.cooldown = 0.7;
  sprout.skin = 'skeleton'; necro.skin = 'skeletor';
  necro.soulQueue.push({ routeIndex: 0 }); necro.summonCooldown = 1.2;
  const enemy = victim(game);
  game._launch(sprout, enemy, game.getStats(sprout));
  const shot = game.projectiles[0];
  assert.equal(game.mergeTowers(sprout.id, necro.id), true);
  assert.equal(game.projectiles[0], shot);
  assert.equal(shot.sourceId, sprout.id);
  assert.equal(sprout.cooldown, 0.7);
  assert.equal(necro.summonCooldown, 1.2);
  assert.equal(necro.soulQueue.length, 1);
  assert.equal(sprout.skin, null); assert.equal(necro.skin, null);
  assert.deepEqual([necro.x, necro.z], [sprout.x, sprout.z]);
  const damage = game.getStats(sprout).damage;
  game._advanceProjectiles(10);
  assert.equal(sprout.kills, 18);
  assert.ok(game.getStats(sprout).damage > damage);
  assert.equal(necro.kills, 0);
  assert.equal(necro.soulQueue.length, 2);
  game.points = 1000;
  assert.equal(game.upgradeTower(sprout.id, 1), false);
  assert.equal(game.upgradeTower(necro.id, 0), true);
  assert.equal(game.setTargeting(necro.id, 'strong'), true);
  assert.equal(sprout.targeting, 'strong');
});

test('Turbo boosts every fused attack exactly threefold without speeding guardian spawning or attacks', () => {
  const { game, sprout, multi, necro } = setup({ tumbleSpeedUnlocked: true });
  const normal = new Game();
  for (const t of [sprout, multi, necro]) t.cooldown = 0.9;
  const summonInterval = game.getStats(necro).summonInterval;
  const allyInterval = game.getStats(necro).allyInterval;
  assert.equal(game.mergeTowers(sprout.id, necro.id), true);
  assert.equal(sprout.cooldown, 0.9);
  assert.equal(game.mergeTowers(sprout.id, multi.id), true);
  assert.ok(Math.abs(sprout.cooldown - 0.3) < 1e-10);
  assert.ok(Math.abs(necro.cooldown - 0.3) < 1e-10);
  assert.equal(multi.cooldown, 0.9);
  for (const tower of [sprout, multi, necro]) {
    for (let level = 0; level <= 3; level++) {
      tower.levels[0] = level;
      const before = normal.getStats({ ...tower, fusionKey: undefined, fusionParentId: undefined });
      const after = game.getStats({ ...tower });
      assert.equal(after.interval, before.interval / 3);
      assert.equal(after.damage, before.damage);
    }
  }
  assert.equal(game.getStats(necro).summonInterval, summonInterval);
  assert.equal(game.getStats(necro).allyInterval, allyInterval);
});

test('fusion Turbo uses co-op owner entitlements and cannot spread across owners', () => {
  const f = setup({ tumbleSpeedUnlocked: true });
  for (const tower of f.game.towers) tower.ownerId = 'a';
  f.game.tumbleSpeedOwners = ['b'];
  f.game.mergeTowers(f.sprout.id, f.multi.id);
  assert.equal(f.game.getStats(f.sprout).interval, 0.95);
  f.game.tumbleSpeedOwners = ['a'];
  assert.equal(f.game.getStats(f.sprout).interval, 0.95 / 3);
  f.necro.ownerId = 'b';
  assert.equal(f.game.mergeTowers(f.sprout.id, f.necro.id), false);
});

test('Turbo sustains threefold real firing cadence for every Trinity component at 20 Hz', () => {
  const counts = [];
  for (const turbo of [false, true]) {
    const { game, sprout, multi, necro } = setup({ tumbleSpeedUnlocked: turbo });
    sprout.levels = [3, 3, 0, 0]; multi.levels = [3]; necro.levels = [0, 0, 3, 0];
    Object.assign(sprout, game.pointAt(5));
    game.mergeTowers(sprout.id, multi.id); game.mergeTowers(sprout.id, necro.id);
    const enemy = game._spawn('boss');
    Object.assign(enemy, game.pointAt(5), { progress: 5, speed: 0, hp: 1e9, maxHp: 1e9 });
    game.status = 'wave';
    const attacks = { sprout: [], multi: [], necro: [] }, launch = game._launch.bind(game);
    game._launch = (...args) => { attacks[args[0].type].push(game.time); launch(...args); };
    for (let step = 0; step < 1200; step++) game.update(0.05);
    for (const tower of [sprout, multi, necro]) {
      const times = attacks[tower.type], interval = game.getStats(tower).interval;
      for (let index = 0; index < times.length; index++) {
        assert.ok(Math.abs(times[index] - times[0] - index * interval) < 0.050001, `${tower.type}: no accumulated timing drift`);
      }
      assert.ok(tower.damageDone > 0);
    }
    counts.push(attacks);
  }
  for (const type of ['sprout', 'multi', 'necro']) {
    assert.ok(Math.abs(counts[1][type].length - 3 * counts[0][type].length) <= 3);
  }
});

test('every fused direct attack and prism ricochet raises guardians, but guardians never recurse', () => {
  const { game, sprout, multi, necro } = setup({ pathUnlocks: [NECRO_PATH_SECRET.id] });
  necro.levels[3] = 3;
  game.mergeTowers(sprout.id, multi.id); game.mergeTowers(sprout.id, necro.id);
  for (const tower of [sprout, multi, necro]) {
    const enemy = victim(game);
    game._launch(tower, enemy, game.getStats(tower));
    game._advanceProjectiles(10);
  }
  assert.equal(necro.soulQueue.length, 12);
  const prismVictim = victim(game);
  game._launchPrismShard(multi, prismVictim, multi, 0);
  game._advanceProjectiles(10);
  assert.equal(necro.soulQueue.length, 16);
  const ally = game._spawnReborn(necro, 0);
  game._damage(victim(game), ally.damage, ally.sourceId, { summon: false, damageKind: 'physical' });
  assert.equal(necro.soulQueue.length, 16);
  assert.equal(game.necroSpellKills, 4);
  assert.equal(sprout.kills, 1);
  assert.equal(multi.kills, 2);
});

test('all three attack patterns still fire from the visible anchor', () => {
  const { game, sprout, multi, necro } = setup();
  game.mergeTowers(sprout.id, multi.id); game.mergeTowers(sprout.id, necro.id);
  game.status = 'wave'; game._queue = ['bone']; game._spawnTimer = 100;
  for (let i = 0; i < 3; i++) {
    const enemy = game._spawn('bone');
    enemy.hp = enemy.maxHp = 1e8; enemy.speed = 0;
    enemy.x = sprout.x + 1; enemy.z = sprout.z;
  }
  game.update(0.05);
  assert.equal(game.projectiles.filter(p => p.sourceId === sprout.id).length, 1);
  assert.equal(game.projectiles.filter(p => p.sourceId === multi.id).length, 3);
  assert.equal(game.projectiles.filter(p => p.sourceId === necro.id).length, 1);
  assert.ok(game.projectiles.every(p => p.x === sprout.x && p.z === sprout.z));
});

test('selling any component refunds the group once and removes guardians and pending souls', () => {
  const { game, sprout, multi, necro } = setup();
  for (const tower of game.towers) tower.ownerId = 'a';
  game.mergeTowers(sprout.id, multi.id); game.mergeTowers(sprout.id, necro.id);
  necro.soulQueue.push({ routeIndex: 0 });
  const ally = game._spawnReborn(necro, 0);
  const enemy = victim(game); enemy.allyTargetId = ally.id;
  game._launch(multi, enemy, game.getStats(multi));
  const gold = game.gold;
  const refund = game.towers.reduce((sum, t) => sum + Math.floor(t.purchaseCost * 0.75), 0);
  assert.equal(game.sellTower(necro.id), true);
  assert.equal(game.gold, gold + refund);
  assert.equal(game.towers.length, 0);
  assert.equal(game.allies.length, 0);
  assert.equal(necro.soulQueue.length, 0);
  assert.equal(enemy.allyTargetId, null);
  assert.equal(game.projectiles.length, 1);
  assert.equal(game._sourceOwners[multi.id], 'a');
  assert.equal(game.sellTower(sprout.id), false);
  assert.equal(game.gold, gold + refund);
  game._advanceProjectiles(10);
  assert.equal(game.allies.length, 0);
});
