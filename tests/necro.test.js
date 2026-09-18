import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS, SECRETS, TOWERS, NECRO_PATH_SECRET, cottagePosition, cottageDoorPosition } from '../src/data.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);
const run = (g, seconds) => { for (let i = 0; i < Math.round(seconds * 20); i++) g.update(0.05); };
function setup(map = 'meadow') {
  const g = new Game(map, { unlocks: ['necro'] });
  const spot = map === 'creek' ? [2, 2] : map === 'orchard' ? [-5, -2.5] : map === 'hollow' ? [-7, 0] : [-10, 1.5];
  const tower = g.placeTower('necro', ...spot);
  assert.ok(tower);
  tower.cooldown = 99;
  g.status = 'wave';
  return { g, tower };
}
function enemyAt(g, progress, routeIndex = 0, type = 'gold', speed = 0) {
  const enemy = g._spawn(type, routeIndex);
  enemy.progress = progress;
  enemy.speed = speed;
  Object.assign(enemy, g.pointAt(progress, routeIndex));
  return enemy;
}
function allyAt(g, tower, progress, routeIndex = 0, overrides = {}) {
  const ally = g._spawnReborn(tower, routeIndex);
  Object.assign(ally, { progress, phase: 'marching', spawnedAt: -1, ...g.pointAt(progress, routeIndex), ...overrides });
  return ally;
}

test('Morrow has three ordinary paths and a secret fourth, with the ordinary two-path limit', () => {
  const locked = new Game();
  assert.equal(locked.isUnlocked('necro'), false);
  assert.equal(locked.canPlace('necro', -10, 1.5), false);
  assert.equal(TOWERS.necro.unlockSecret, 'hollow');
  assert.equal(TOWERS.necro.paths.length, 4);
  assert.equal(TOWERS.necro.paths[3].unlockSecret, NECRO_PATH_SECRET.id);
  const { g, tower } = setup();
  assert.equal(g.gold, 350);
  g.points = 1000;
  for (const path of [0, 1]) for (let tier = 0; tier < 3; tier++) assert.ok(g.upgradeTower(tower.id, path));
  assert.equal(g.upgradeTower(tower.id, 2), false);
  assert.equal(g.upgradeTower(tower.id, 0), false);
  const stats = g.getStats(tower);
  assert.equal(stats.allyHp, 240);
  assert.equal(stats.allyDamage, 38);
  assert.equal(stats.allyLimit, 9);
  assert.equal(stats.allySpeed, 5);
  assert.equal(stats.summonInterval, 0.7);
  const gravecraft = g.getStats({ type: 'necro', levels: [0, 0, 3] });
  assert.equal(gravecraft.damage, 48);
  assert.ok(gravecraft.range > stats.range && gravecraft.interval < stats.interval);
});

test('Hollow pumpkin sequence resets on wrong order, ignores double taps, and rejects other-map secrets', () => {
  const g = new Game('hollow');
  const [moon, star, leaf, flame] = SECRETS.hollow.order;
  assert.equal(g.discoverSecret(star), false);
  assert.deepEqual(g.secretDiscoveries, []);
  assert.equal(g.events.at(-1).type, 'secret-reset');
  assert.ok(g.discoverSecret(moon));
  assert.equal(g.discoverSecret(moon), false, 'a double tap does not extinguish the latest light');
  assert.deepEqual(g.secretDiscoveries, [moon]);
  assert.equal(g.discoverSecret(SECRETS.meadow.spots[0].id), false);
  assert.deepEqual(g.secretDiscoveries, [moon]);
  assert.equal(g.discoverSecret(flame), false);
  assert.deepEqual(g.secretDiscoveries, []);
  assert.ok(g.discoverSecret(moon));
  assert.ok(g.discoverSecret(star));
  assert.equal(g.discoverSecret(moon), false, 'an earlier repeated symbol is a wrong step');
  assert.deepEqual(g.secretDiscoveries, []);
  assert.equal(g.isUnlocked('necro'), false);
  assert.equal(g.discoverSecret(leaf), false);
});

test('solving Hollow permanently unlocks Morrow without free placement, while incomplete puzzles reset on reload', () => {
  const profile = { unlocks: ['gravity'] };
  const partial = new Game('hollow', profile);
  partial.discoverSecret(SECRETS.hollow.order[0]);
  const g = new Game('hollow', JSON.parse(JSON.stringify(profile)));
  assert.deepEqual(g.secretDiscoveries, []);
  for (const id of SECRETS.hollow.order) assert.ok(g.discoverSecret(id));
  assert.equal(g.isUnlocked('necro'), true);
  assert.equal(g.towers.length, 0);
  assert.equal(g.allies.length, 0);
  assert.equal(g.gold, 650);
  assert.equal(g.events.filter(event => event.type === 'unlock').length, 1);
  assert.equal(g.isPathUnlocked('necro', 3), false, 'finding Morrow does not grant Soul Echoes');
  for (const id of SECRETS.hollow.order) assert.equal(g.discoverSecret(id), false);
  const replay = new Game('creek', JSON.parse(JSON.stringify(g.profile)));
  assert.equal(replay.isUnlocked('necro'), true);
  assert.equal(replay.isUnlocked('gravity'), true);
  assert.equal(replay.discoverSecret(SECRETS.hollow.order[0]), false);
  assert.deepEqual(replay.secretDiscoveries, []);
});

test('pumpkin clues sit on clear ground and completed-game discovery cannot unlock Morrow', () => {
  const g = new Game('hollow');
  assert.deepEqual(SECRETS.hollow.spots.map(spot => spot.symbol), ['moon', 'star', 'leaf', 'flame']);
  for (const spot of SECRETS.hollow.spots) {
    assert.ok(g.pathDistance(spot.x, spot.z) >= 1.3);
    assert.equal(g.canPlace('sprout', spot.x, spot.z), false);
  }
  for (const status of ['lost', 'won']) {
    g.status = status;
    assert.equal(g.discoverSecret(SECRETS.hollow.order[0]), false);
  }
});

test('only lethal direct necromancer spells queue one soul, preserving the defeated skeleton route', () => {
  const { g, tower } = setup('creek');
  const enemy = enemyAt(g, 19, 1, 'bone');
  const stats = g.getStats(tower);
  g._launch(tower, enemy, stats);
  g._advanceProjectiles(2);
  assert.equal(enemy.hp, 1);
  assert.equal(tower.soulQueue.length, 0);
  g._launch(tower, enemy, stats);
  g._advanceProjectiles(2);
  assert.equal(enemy.hp, 0);
  assert.deepEqual(tower.soulQueue, [{ routeIndex: 1 }]);
  g._damage(enemy, 100, tower.id, { summon: true });
  assert.equal(tower.soulQueue.length, 1, 'overkill cannot award a second soul');
  const other = enemyAt(g, 20, 0, 'bone');
  g._damage(other, 100, tower.id, { summon: false });
  assert.equal(tower.soulQueue.length, 1, 'non-spell damage does not raise more gnomes');
  assert.equal(g.effects.filter(effect => effect.type === 'soul-reap').length, 1);
});

test('reborn gnomes spawn at the cottage door and walk around its footprint before reversing onto each route', () => {
  for (const map of MAPS) {
    for (let route = 0; route < (map.paths?.length || 1); route++) {
      const g = new Game(map.id, { unlocks: ['necro'] });
      // The caster location does not determine where its reborn gnomes appear.
      const tower = g._makeTower('necro', 0, 0, 300);
      tower.cooldown = 99;
      g.status = 'wave';
      enemyAt(g, 0, route);
      const ally = g._spawnReborn(tower, route);
      const house = cottagePosition(map, route), door = cottageDoorPosition(map, route);
      assert.deepEqual({ x: ally.x, z: ally.z }, door);
      assert.equal(ally.phase, 'joining');
      assert.equal(ally.routeIndex, route);
      assert.ok(ally.joining[0].x > house.x + 0.9);
      near(ally.joining[0].z, door.z);
      for (let tick = 0; tick < 100 && ally.phase === 'joining'; tick++) {
        g.update(0.05);
        assert.ok(Math.abs(ally.x - house.x) >= 0.6 || Math.abs(ally.z - house.z) >= 0.6, 'joining must not cut through the cottage');
      }
      assert.equal(ally.phase, 'marching');
      const progress = ally.progress;
      g.update(0.05);
      assert.ok(ally.progress < progress);
      assert.deepEqual({ x: ally.x, z: ally.z }, g.pointAt(ally.progress, route));
      assert.ok(ally.maxTtl > g.routeLength(route) / ally.speed + 10);
    }
  }
});

test('reborn gnomes retrace the correct fork toward their defeated skeleton entrance', () => {
  for (const routeIndex of [0, 1]) {
    const { g, tower } = setup('creek');
    enemyAt(g, 0, routeIndex);
    const join = routeIndex === 0 ? 24 : 16;
    const ally = allyAt(g, tower, join + 1, routeIndex);
    run(g, 0.8);
    near(ally.progress, join + 1 - 3.5 * 0.8);
    near(ally.x, -1);
    assert.ok(routeIndex === 0 ? ally.z < 0 : ally.z > 0);
  }
});

test('allies stop skeletons for melee, obey attack intervals, and take enemy counterattacks', () => {
  const { g, tower } = setup();
  const ally = allyAt(g, tower, 5);
  const enemy = enemyAt(g, 4.35, 0, 'gold', 1);
  g.update(0.05);
  near(ally.progress, 5);
  near(enemy.progress, 4.35);
  assert.equal(ally.phase, 'fighting');
  assert.equal(ally.targetId, enemy.id);
  assert.equal(enemy.allyTargetId, ally.id);
  near(enemy.hp, 197);
  near(ally.hp, 50 - 32 * 0.05);
  run(g, 0.5);
  near(enemy.hp, 197);
  run(g, 0.3);
  near(enemy.hp, 189);
  assert.ok(ally.hp < 30);
});

test('swept encounters prevent fast enemies or allies from passing through one another', () => {
  for (const [allySpeed, enemySpeed] of [[0, 200], [200, 0], [200, 200]]) {
    const { g, tower } = setup();
    const ally = allyAt(g, tower, 6, 0, { speed: allySpeed, hp: 1000, maxHp: 1000 });
    const enemy = enemyAt(g, 2, 0, 'gold', enemySpeed);
    g.update(0.05);
    assert.ok(ally.progress - enemy.progress >= 0.65 - 1e-7);
    assert.equal(ally.phase, 'fighting');
    assert.ok(enemy.hp < enemy.maxHp);
  }
});

test('an ally on a shared tail fights skeletons from either route', () => {
  const { g, tower } = setup('creek');
  const ally = allyAt(g, tower, 27, 0);
  const enemy = enemyAt(g, 18.35, 1, 'gold', 1);
  g.update(0.05);
  near(ally.progress, 27);
  near(enemy.progress, 18.35);
  assert.equal(ally.targetId, enemy.id);
  assert.equal(enemy.allyTargetId, ally.id);
  near(enemy.hp, 197);
  near(ally.hp, 48.4);
  assert.equal(ally.routeIndex, 0);
  assert.equal(enemy.routeIndex, 1);
});

test('allies ignore enemies on unrelated branches and other passes of a looping road', () => {
  const branch = setup('creek');
  const branchAlly = allyAt(branch.g, branch.tower, 3, 0);
  const branchEnemy = enemyAt(branch.g, 3, 1);
  branch.g.update(0.05);
  near(branchEnemy.hp, branchEnemy.maxHp);
  assert.equal(branchAlly.phase, 'marching');
  const loop = setup('orchard');
  const loopAlly = allyAt(loop.g, loop.tower, 26);
  const loopEnemy = enemyAt(loop.g, 4);
  assert.deepEqual({ x: loopAlly.x, z: loopAlly.z }, { x: loopEnemy.x, z: loopEnemy.z });
  loop.g.update(0.05);
  near(loopEnemy.hp, loopEnemy.maxHp);
  assert.equal(loopAlly.phase, 'marching');
  assert.equal(loopAlly.targetId, null);
});

test('reborn kills grant the owner gold and stats exactly once without recursively summoning allies', () => {
  const { g, tower } = setup();
  allyAt(g, tower, 5);
  allyAt(g, tower, 5);
  const enemy = enemyAt(g, 4.35, 0, 'bone');
  enemy.hp = 8;
  enemyAt(g, 30);
  const gold = g.gold;
  g.update(0.05);
  assert.equal(enemy.hp, 0);
  assert.equal(g.gold, gold + 6);
  assert.equal(tower.kills, 1);
  assert.equal(tower.damageDone, 8);
  assert.equal(g.kills, 1);
  assert.equal(tower.soulQueue.length, 0);
  assert.equal(g.allies.length, 2);
  run(g, 0.3);
  assert.equal(g.gold, gold + 6);
  assert.equal(tower.soulQueue.length, 0);
});

test('a defeated ally is removed and cannot attack again after death', () => {
  const { g, tower } = setup();
  const ally = allyAt(g, tower, 5);
  const boss = enemyAt(g, 4.35, 0, 'boss', 0.65);
  run(g, 0.6);
  assert.equal(ally.hp, 0);
  assert.equal(g.allies.length, 0);
  assert.equal(boss.allyTargetId, null);
  assert.equal(tower.damageDone, 8, 'the ally dies before a second attack');
  const health = boss.hp;
  run(g, 1);
  assert.equal(boss.hp, health);
});

test('active caps and dispatch intervals preserve all queued souls instead of dropping kills', () => {
  const { g, tower } = setup();
  for (let i = 0; i < 12; i++) {
    const enemy = enemyAt(g, 2, 0, 'bone');
    g._damage(enemy, enemy.hp, tower.id, { summon: true });
  }
  assert.equal(tower.soulQueue.length, 12);
  g._dispatchReborn(0.05);
  assert.equal(g.allies.length, 1);
  assert.equal(tower.soulQueue.length, 11);
  g._dispatchReborn(0.1);
  assert.equal(g.allies.length, 1);
  g._dispatchReborn(2.3);
  assert.equal(g.allies.length, 2);
  for (let i = 0; i < 20; i++) g._dispatchReborn(3);
  assert.equal(g.allies.length, 3);
  assert.equal(tower.soulQueue.length, 9);
  g.allies[0].hp = 0;
  g._dispatchReborn(3);
  assert.equal(g.allies.filter(ally => ally.hp > 0).length, 3);
  assert.equal(tower.soulQueue.length, 8);
});

test('reborn gnomes retire on expiry, reaching the entrance, owner sale, round end, and defeat', () => {
  for (const reason of ['expiry', 'entrance', 'sale', 'round', 'loss']) {
    const { g, tower } = setup();
    allyAt(g, tower, reason === 'entrance' ? 0.05 : 5, 0, reason === 'expiry' ? { ttl: 0.01 } : {});
    if (!['expiry', 'entrance'].includes(reason)) tower.soulQueue.push({ routeIndex: 0 });
    if (reason !== 'round') enemyAt(g, reason === 'loss' ? g.pathLength - 0.001 : 30, 0, 'gold', reason === 'loss' ? 1 : 0);
    if (reason === 'loss') g.lives = 1;
    if (reason === 'sale') g.sellTower(tower.id);
    else g.update(0.05);
    assert.equal(g.allies.length, 0, reason);
    assert.equal(tower.soulQueue.length, 0, reason);
  }
});

test('friendly crystals do not obstruct the reborn march and gravity can pull skeletons away from melee', () => {
  const { g, tower } = setup();
  const ally = allyAt(g, tower, 5);
  const enemy = enemyAt(g, 4.35, 0, 'gold', 1);
  g.barriers.push({ id: ++g._id, sourceId: tower.id, progress: 6, routeIndex: 0, ...g.pointAt(6), hp: 70, maxHp: 70, ttl: 20, explosionDamage: 0, explosionRadius: 1.5 });
  g.holes.push({ id: ++g._id, sourceId: tower.id, progress: 3.5, routeIndex: 0, ...g.pointAt(3.5), ttl: 3, maxTtl: 3, radius: 2.2, dps: 3, pullSpeed: 7, capture: false, released: [] });
  g.update(0.05);
  assert.ok(enemy.progress < 4.35);
  assert.equal(enemy.allyTargetId, null);
  assert.equal(ally.phase, 'marching');
  assert.equal(tower.soulQueue.length, 0, 'gravity credit cannot create necromancer souls');
  const other = allyAt(g, tower, 6.2);
  g.update(0.2);
  assert.ok(other.progress < 6, 'reborn gnomes walk through friendly barriers');
  assert.ok(g.barriers[0].hp > 0);
});

function spellDefeat(g, tower, routeIndex = 0) {
  const enemy = enemyAt(g, 2, routeIndex, 'bone');
  enemy.hp = 1;
  g._launch(tower, enemy, g.getStats(tower));
  g._advanceProjectiles(2);
  assert.equal(enemy.hp, 0);
  return enemy;
}

test('Soul Echoes is gated before spending points and forged levels do not grant extra summons', () => {
  const { g, tower } = setup();
  g.points = 1000;
  assert.equal(g.isPathUnlocked('missing', 3), false);
  assert.equal(g.isPathUnlocked('necro', -1), false);
  assert.equal(g.isPathUnlocked('necro', 1.5), false);
  assert.equal(g.isPathUnlocked('necro', 0), true);
  assert.equal(g.isPathUnlocked('necro', 3), false);
  assert.equal(g.upgradeTower(tower.id, 3), false);
  assert.equal(g.points, 1000);
  tower.levels[3] = 3;
  assert.equal(g.getStats(tower).summonCount, 1);
  assert.equal(g.getStats(tower).allyLimit, 3);
  spellDefeat(g, tower);
  assert.equal(tower.soulQueue.length, 1);
});

test('every Soul Echoes tier queues the exact batch once through real projectile impacts on the defeated route', () => {
  for (let level = 0; level <= 3; level++) {
    const { g, tower } = setup('creek');
    g.profile.pathUnlocks = [NECRO_PATH_SECRET.id];
    tower.levels[3] = level;
    const enemy = spellDefeat(g, tower, 1);
    const count = level + 1;
    assert.equal(g.getStats(tower).summonCount, count);
    assert.deepEqual(tower.soulQueue, Array.from({ length: count }, () => ({ routeIndex: 1 })));
    assert.equal(g.necroSpellKills, 1, 'count defeated skeletons, not summoned echoes');
    g._damage(enemy, 999, tower.id, { summon: true });
    assert.equal(tower.soulQueue.length, count);
    assert.equal(g.necroSpellKills, 1);
    g._dispatchReborn(.05);
    assert.equal(g.allies.length, 1);
    assert.equal(g.allies[0].routeIndex, 1);
    assert.equal(tower.soulQueue.length, count - 1);
  }
});

test('Soul Echoes keeps dispatch cadence and queued batches when the active cap is full', () => {
  const { g, tower } = setup();
  g.profile.pathUnlocks = [NECRO_PATH_SECRET.id];
  tower.levels = [0, 0, 0, 3];
  spellDefeat(g, tower);
  spellDefeat(g, tower);
  assert.equal(tower.soulQueue.length, 8);
  assert.equal(g.getStats(tower).allyLimit, 4, 'the whole final-tier batch can fit without Soul Procession');
  g._dispatchReborn(.05);
  g._dispatchReborn(.1);
  assert.equal(g.allies.length, 1, 'echoes do not bypass dispatch cooldown');
  for (let i = 0; i < 10; i++) g._dispatchReborn(3);
  assert.equal(g.allies.length, 4);
  assert.equal(tower.soulQueue.length, 4, 'excess souls wait instead of disappearing');
  g.allies[0].hp = 0;
  g._dispatchReborn(.05);
  assert.equal(g.allies.filter(ally => ally.hp > 0).length, 4);
  assert.equal(tower.soulQueue.length, 3);
  tower.levels[1] = 3;
  assert.equal(g.getStats(tower).allyLimit, 9, 'Soul Procession retains its larger cap');
});

test('Echo-enhanced reborn kills still cannot recurse or satisfy direct-spell requirements', () => {
  const { g, tower } = setup('hollow');
  g.profile.pathUnlocks = [NECRO_PATH_SECRET.id];
  tower.levels[3] = 3;
  allyAt(g, tower, 5);
  const enemy = enemyAt(g, 4.35, 0, 'bone');
  enemy.hp = 8;
  enemyAt(g, 30);
  g.update(.05);
  assert.equal(enemy.hp, 0);
  assert.equal(tower.kills, 1);
  assert.equal(g.necroSpellKills, 0);
  assert.equal(tower.soulQueue.length, 0);
  assert.equal(g.allies.length, 1);
});

test('the echo ritual requires ten direct spell defeats in this Hollow run before reverse lantern discovery', () => {
  const { g, tower } = setup('hollow');
  assert.equal(g.canDiscoverNecroPath(), false);
  for (const id of NECRO_PATH_SECRET.order) assert.equal(g.discoverSecret(id), false);
  assert.equal(g.events.filter(event => event.type === 'path-secret-hint').length, 1, 'locked clicks do not spam hints');
  assert.deepEqual(g.pathSecretDiscoveries, []);
  for (let i = 0; i < 9; i++) spellDefeat(g, tower);
  assert.equal(g.necroSpellKills, 9);
  assert.equal(g.discoverSecret(NECRO_PATH_SECRET.order[0]), false);
  const indirect = enemyAt(g, 2, 0, 'bone');
  g._damage(indirect, indirect.hp, tower.id, { summon: false });
  assert.equal(g.necroSpellKills, 9);
  spellDefeat(g, tower);
  assert.equal(g.necroSpellKills, 10);
  assert.equal(g.canDiscoverNecroPath(), true);
  assert.equal(g.events.filter(event => event.type === 'path-secret-ready').length, 1);
  for (const id of NECRO_PATH_SECRET.order) assert.ok(g.discoverSecret(id));
  assert.equal(g.isPathUnlocked('necro', 3), true);
  assert.equal(g.canDiscoverNecroPath(), false);
  assert.equal(g.events.filter(event => event.type === 'path-unlock').length, 1);
  for (const id of NECRO_PATH_SECRET.order) assert.equal(g.discoverSecret(id), false);
  const replay = new Game('creek', JSON.parse(JSON.stringify(g.profile)));
  assert.equal(replay.isPathUnlocked('necro', 3), true);
  assert.equal(replay.necroSpellKills, 0);
  assert.deepEqual(replay.pathSecretDiscoveries, []);
});

test('echo ritual mistakes reset only the second puzzle and repeated latest clicks are ignored', () => {
  const g = new Game('hollow');
  for (const id of SECRETS.hollow.order) g.discoverSecret(id);
  const tower = g.placeTower('necro', -7, 0);
  g.status = 'wave';
  for (let i = 0; i < 10; i++) spellDefeat(g, tower);
  const [flame, leaf, star, moon] = NECRO_PATH_SECRET.order;
  assert.ok(g.discoverSecret(flame));
  assert.equal(g.discoverSecret(flame), false);
  assert.deepEqual(g.pathSecretDiscoveries, [flame]);
  assert.ok(g.discoverSecret(leaf));
  assert.equal(g.discoverSecret(flame), false);
  assert.deepEqual(g.pathSecretDiscoveries, []);
  assert.deepEqual(g.secretDiscoveries, SECRETS.hollow.order, 'Morrow’s original completed puzzle stays lit');
  assert.equal(g.necroSpellKills, 10);
  assert.equal(g.isUnlocked('necro'), true);
  assert.equal(g.isPathUnlocked('necro', 3), false);
  assert.equal(g.events.at(-1).type, 'path-secret-reset');
  assert.ok(g.discoverSecret(flame));
  assert.equal(g.discoverSecret(SECRETS.meadow.spots[0].id), false);
  assert.deepEqual(g.pathSecretDiscoveries, [flame]);
  for (const id of [leaf, star, moon]) assert.ok(g.discoverSecret(id));
  assert.equal(g.isPathUnlocked('necro', 3), true);
});

test('echo prerequisites reset between runs, reject other maps and finished games, and sanitize saved path unlocks', () => {
  const { g, tower } = setup('hollow');
  for (let i = 0; i < 10; i++) spellDefeat(g, tower);
  g.discoverSecret(NECRO_PATH_SECRET.order[0]);
  const restarted = new Game('hollow', JSON.parse(JSON.stringify(g.profile)));
  assert.equal(restarted.necroSpellKills, 0);
  assert.equal(restarted.canDiscoverNecroPath(), false);
  assert.deepEqual(restarted.pathSecretDiscoveries, []);
  const away = setup('meadow');
  for (let i = 0; i < 10; i++) spellDefeat(away.g, away.tower);
  assert.equal(away.g.canDiscoverNecroPath(), false);
  assert.equal(away.g.discoverSecret(NECRO_PATH_SECRET.order[0]), false);
  for (const status of ['won', 'lost']) {
    g.status = status;
    assert.equal(g.canDiscoverNecroPath(), false);
    assert.equal(g.discoverSecret(NECRO_PATH_SECRET.order[1]), false);
  }
  const cleaned = new Game('hollow', { unlocks: ['necro'], pathUnlocks: [null, 'fake', NECRO_PATH_SECRET.id, NECRO_PATH_SECRET.id] });
  assert.deepEqual(cleaned.profile.pathUnlocks, [NECRO_PATH_SECRET.id]);
  assert.deepEqual(new Game('hollow', { unlocks: ['necro'], pathUnlocks: 'necro-echoes' }).profile.pathUnlocks, []);
});

test('unlocked echoes support old three-level towers while still consuming one of two upgrade paths', () => {
  const { g, tower } = setup();
  g.profile.pathUnlocks = [NECRO_PATH_SECRET.id];
  tower.levels = [0, 0, 0];
  g.points = 1000;
  assert.equal(g.getStats(tower).summonCount, 1);
  for (let tier = 0; tier < 3; tier++) assert.ok(g.upgradeTower(tower.id, 3));
  assert.deepEqual(tower.levels, [0, 0, 0, 3]);
  assert.equal(g.points, 1000 - 18 - 36 - 65);
  assert.ok(g.upgradeTower(tower.id, 0));
  const points = g.points;
  assert.equal(g.upgradeTower(tower.id, 1), false);
  assert.equal(g.upgradeTower(tower.id, 2), false);
  assert.equal(g.upgradeTower(tower.id, 3), false);
  assert.equal(g.points, points);
});
