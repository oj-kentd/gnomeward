import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, wavePlan } from '../src/game.js';
import { MAPS, SECRETS } from '../src/data.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
function progressAt(g, x, z, routeIndex = 0, occurrence = 0) {
  const values = [];
  for (const s of g.routes[routeIndex].segments) {
    const t = ((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / s.length ** 2;
    if (t < 0 || t > 1 || Math.hypot(x - s.ax - t * (s.bx - s.ax), z - s.az - t * (s.bz - s.az)) > 1e-6) continue;
    const p = s.start + t * s.length;
    if (!values.some(value => Math.abs(value - p) < 1e-6)) values.push(p);
  }
  assert.ok(values[occurrence] !== undefined, `point (${x},${z}) on route ${routeIndex}, occurrence ${occurrence}`);
  return values[occurrence];
}
const enemyAt = (g, type, progress, routeIndex = 0) => {
  const enemy = g._spawn(type, routeIndex);
  enemy.progress = progress;
  Object.assign(enemy, g.pointAt(progress, routeIndex));
  return enemy;
};
const unlocked = (map = 'creek') => {
  const g = new Game(map, { unlocks: ['gravity', 'crystal', 'sniper'] });
  g.gold = 2000;
  return g;
};
const addHole = (g, tower, progress, routeIndex = 0, extra = {}) => {
  const hole = { id: ++g._id, sourceId: tower.id, routeIndex, progress, ...g.pointAt(progress, routeIndex), ttl: 3, maxTtl: 3, radius: 2.2, dps: 3, pullSpeed: 2.2, capture: false, released: [], ...extra };
  g.holes.push(hole);
  return hole;
};
const addBarrier = (g, tower, progress, routeIndex = 0) => {
  const barrier = { id: ++g._id, sourceId: tower.id, routeIndex, progress, ...g.pointAt(progress, routeIndex), hp: 500, maxHp: 500, ttl: 20, explosionDamage: 0, explosionRadius: 1.5 };
  g.barriers.push(barrier);
  return barrier;
};

test('six maps provide finite loops, a spiral, and two unequal dual-entry routes', () => {
  assert.equal(MAPS.length, 6);
  assert.deepEqual(MAPS.filter(map => map.paths?.length === 2).map(map => map.id), ['creek', 'crossroads']);
  for (const map of MAPS) {
    const g = new Game(map.id);
    assert.ok(map.topology);
    assert.deepEqual(map.paths?.[0] || map.path, map.path);
    for (let route = 0; route < g.routes.length; route++) {
      assert.ok(g.routeLength(route) > 40);
      const path = g.routes[route].path;
      assert.ok(path.every(([x, z]) => Math.abs(x) <= 12 && Math.abs(z) <= 6));
      assert.deepEqual(g.pointAt(g.routeLength(route), route), { x: path.at(-1)[0], z: path.at(-1)[1] });
    }
    if (g.routes.length === 2) assert.notEqual(g.routeLength(0), g.routeLength(1));
  }
  const orchard = MAPS.find(map => map.id === 'orchard');
  assert.ok(new Set(orchard.path.map(point => point.join(','))).size < orchard.path.length, 'the finite route revisits junctions');
  for (const mapId of ['orchard', 'hollow']) {
    const g = new Game(mapId);
    const enemy = enemyAt(g, 'bone', 0);
    enemy.speed = 100;
    g.status = 'wave';
    g.update(2);
    assert.equal(g.enemies.length, 0);
    assert.equal(g.lives, 99, `${mapId} eventually exits rather than looping forever`);
  }
});

test('dual entrances alternate deterministically without changing wave compositions', () => {
  for (const map of ['creek', 'crossroads']) {
    const g = new Game(map);
    const enemies = Array.from({ length: 6 }, () => g._spawn('bone'));
    assert.deepEqual(enemies.map(enemy => enemy.routeIndex), [0, 1, 0, 1, 0, 1]);
    for (const enemy of enemies) assert.deepEqual({ x: enemy.x, z: enemy.z }, g.pointAt(0, enemy.routeIndex));
    assert.equal(g._spawn('boss', 1).routeIndex, 1);
    assert.equal(wavePlan(10).filter(type => type === 'boss').length, 1);
    const run = new Game(map);
    run.startWave();
    run.update(1.8);
    assert.deepEqual(run.enemies.map(enemy => enemy.routeIndex), [0, 1, 0]);
  }
});

test('leaks use each enemy route length and retain boss unlock requirements', () => {
  const g = new Game('creek');
  const shortEnd = g.routeLength(1) - 0.001;
  const long = enemyAt(g, 'bone', shortEnd, 0);
  const short = enemyAt(g, 'bone', shortEnd, 1);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(short.hp, 0);
  assert.ok(long.hp > 0);
  assert.equal(g.lives, 99);
  const boss = enemyAt(g, 'boss', g.routeLength(1) - 0.001, 1);
  g.update(0.05);
  assert.equal(boss.hp, 0);
  assert.equal(g.isUnlocked('stun'), false);
  const defeated = enemyAt(g, 'boss', 0, 1);
  g._damage(defeated, defeated.hp, 0);
  assert.equal(g.isUnlocked('stun'), true);
});

test('placement excludes every route, including the secondary-only entrance road', () => {
  const creek = new Game('creek');
  near(creek.pathDistance(-10, 5), 0);
  assert.equal(creek.canPlace('sprout', -10, 5), false);
  assert.ok(creek.canPlace('sprout', 2, 2));
  const crossing = new Game('crossroads');
  near(crossing.pathDistance(10, -5), 0);
  assert.equal(crossing.canPlace('sprout', 10, -5), false);
});

test('First and Last compare remaining road distance across unequal routes', () => {
  for (const [mode, expectedRoute] of [['first', 1], ['last', 0], ['strong', 1]]) {
    const g = unlocked();
    const tower = g.placeTower('sniper', 10, 6);
    assert.ok(tower);
    enemyAt(g, 'gold', 10, 0); // 41 world units from the exit.
    enemyAt(g, 'gold', 5, 1); // Only 38 units remain despite less progress.
    g.setTargeting(tower.id, mode);
    g.status = 'wave';
    g.update(0.05);
    const target = g.enemies.find(enemy => enemy.id === g.projectiles[0].targetId);
    assert.equal(target.routeIndex, expectedRoute, mode);
  }
});

test('Morel plants ahead on the approaching enemy route, and shared-road traps poison both routes', () => {
  const g = unlocked();
  const morel = g.placeTower('spore', -5, 4);
  assert.ok(morel);
  const approaching = enemyAt(g, 'gold', progressAt(g, -5, 2, 1), 1);
  g._plant(morel, g.getStats(morel));
  assert.equal(g.traps[0].routeIndex, 1);
  assert.ok(g.traps[0].progress > approaching.progress);
  assert.deepEqual({ x: g.traps[0].x, z: g.traps[0].z }, g.pointAt(g.traps[0].progress, 1));
  morel.cooldown = 99;
  const a = enemyAt(g, 'gold', progressAt(g, 2, 0, 0), 0);
  const b = enemyAt(g, 'gold', progressAt(g, 2, 0, 1), 1);
  g.traps.push({ id: ++g._id, sourceId: morel.id, x: 2, z: 0, ttl: 20, charges: 1, poisonDps: 6, poisonDuration: 4, radius: 0.7, routeIndex: 0 });
  g.status = 'wave';
  g.update(0.05);
  assert.equal(a.poison.sourceId, morel.id);
  assert.equal(b.poison.sourceId, morel.id);
});

test('a well on a shared tail pulls both routes toward the same physical center without changing routes', () => {
  const g = unlocked();
  const orbit = g.placeTower('gravity', 2, 2);
  orbit.cooldown = 99;
  const primary = progressAt(g, 2, 0, 0);
  const secondary = progressAt(g, 2, 0, 1);
  const hole = addHole(g, orbit, primary);
  const a = enemyAt(g, 'gold', primary + 1, 0);
  const b = enemyAt(g, 'gold', secondary + 1, 1);
  g.status = 'wave';
  g.update(0.05);
  near(a.progress, primary + 1 + 0.05 - 0.11);
  near(b.progress, secondary + 1 + 0.05 - 0.11);
  near(a.x, b.x);
  near(a.z, b.z);
  assert.equal(b.routeIndex, 1);
  near(a.maxHp - a.hp, 0.15);
  near(b.maxHp - b.hp, 0.15);
  assert.deepEqual(hole.routeProgressMap, [[primary], [secondary]]);
});

test('a shared crystal blocks both routes at the same place and receives both attacks', () => {
  const g = unlocked();
  const prism = g.placeTower('crystal', 2, 2);
  prism.cooldown = 99;
  const primary = progressAt(g, 2, 0, 0);
  const secondary = progressAt(g, 2, 0, 1);
  const barrier = addBarrier(g, prism, primary);
  const a = enemyAt(g, 'gold', primary - 0.35, 0);
  const b = enemyAt(g, 'gold', secondary - 0.35, 1);
  g.status = 'wave';
  g.update(0.05);
  near(a.progress, primary - 0.35);
  near(b.progress, secondary - 0.35);
  near(a.x, b.x);
  near(barrier.hp, 500 - 2 * 32 * 0.05);
});

test('branch-local terrain cannot affect unrelated route progress numbers', () => {
  const g = unlocked();
  const tower = g.placeTower('gravity', -10, -3);
  assert.ok(tower);
  tower.cooldown = 99;
  addHole(g, tower, 2, 0, { radius: 20 });
  addBarrier(g, tower, 4, 0);
  const other = enemyAt(g, 'gold', 3.65, 1);
  g.status = 'wave';
  g.update(0.05);
  near(other.progress, 3.7);
  near(other.hp, other.maxHp);
});

test('terrain uses the nearby occurrence at repeated loop junctions without teleporting across a lap', () => {
  const g = unlocked('orchard');
  const tower = g.placeTower('gravity', -5, -2.5);
  assert.ok(tower);
  tower.cooldown = 99;
  const first = progressAt(g, -8, 0, 0, 0);
  const second = progressAt(g, -8, 0, 0, 1);
  assert.ok(second - first > 10);
  addHole(g, tower, first);
  const later = enemyAt(g, 'gold', second + 0.2);
  g.status = 'wave';
  g.update(0.05);
  near(later.progress, second + 0.14);
  assert.ok(later.progress > second);
  g.holes = [];
  addBarrier(g, tower, first);
  const arriving = enemyAt(g, 'gold', second - 0.4);
  g.update(0.1);
  near(arriving.progress, second - 0.35);
});

test('a perpendicular road crossing does not act like a shared segment for crystals or gravity', () => {
  const g = unlocked('hollow');
  const tower = g.placeTower('gravity', 2, 2.5);
  assert.ok(tower);
  tower.cooldown = 99;
  const earlier = progressAt(g, 0, 4, 0, 0);
  const later = progressAt(g, 0, 4, 0, 1);
  addBarrier(g, tower, later);
  addHole(g, tower, later);
  const crossing = enemyAt(g, 'gold', earlier - 0.1);
  g.status = 'wave';
  g.update(0.2);
  near(crossing.progress, earlier + 0.1);
  near(crossing.hp, crossing.maxHp);
});

test('the original secret roads stay unchanged and all discovery locations remain clear', () => {
  assert.deepEqual(MAPS.find(map => map.id === 'meadow').path, [[-12,4],[-7,4],[-7,-4],[-1,-4],[-1,3],[5,3],[5,-3],[12,-3]]);
  assert.deepEqual(MAPS.find(map => map.id === 'quarry').path, [[-12,-4],[-5,-4],[-5,3],[2,3],[2,-3],[7,-3],[7,2],[12,2]]);
  for (const [map, secret] of Object.entries(SECRETS)) {
    const g = new Game(map);
    assert.equal(g.routes.length, 1);
    for (const spot of secret.spots) assert.ok(g.pathDistance(spot.x, spot.z) >= 1.3);
  }
});
