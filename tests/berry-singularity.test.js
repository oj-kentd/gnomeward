import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';
import { BERRY_SINGULARITY } from '../src/combos.js';
import { Match } from '../server/match.js';

function unit(game, type, levels, x = -4, z = 0) {
  const tower = game._makeTower(type, x, z, TOWERS[type].cost);
  tower.levels = levels;
  tower.cooldown = 999;
  return tower;
}
function enemy(game, x, z, hp = 10000) {
  const target = game._spawn('bone');
  Object.assign(target, { x, z, progress: 9, speed: 0, hp, maxHp: hp });
  return target;
}
function openWell(game, orbit, progress = 9) {
  const target = { ...game.pointAt(progress), progress, routeIndex: 0 };
  assert.equal(game._openHole(orbit, game.getStats(orbit), target), true);
  return game.holes.at(-1);
}
function garden(game = new Game('meadow', { unlocks: ['gravity', 'strawberry'] })) {
  Object.assign(game, { status: 'wave', wave: 1, _spawnTimer: 999 });
  const orbit = unit(game, 'gravity', [3, 0, 0, 0]);
  const berry = unit(game, 'strawberry', [0, 3, 0], 0, 0);
  const hole = openWell(game, orbit);
  return { game, orbit, berry, hole };
}
function mortar(game, berry, center) {
  game._launch(berry, center, game.getStats(berry));
  return game.projectiles.pop();
}
function burst(game, berry, center) {
  game._burstStrawberry(mortar(game, berry, center));
  return game.projectiles.filter(shot => shot.type === 'strawberry-seed');
}

test('Berry Singularity needs only Seed Storm 3 and Event Horizon 3 on an actual living well', () => {
  const { game, orbit, berry, hole } = garden();
  const target = enemy(game, hole.x, hole.z);
  game._launch(berry, target, game.getStats(berry));
  game._advanceProjectiles(game.getStats(berry).flightDuration);
  assert.equal(target.hp, target.maxHp - game.getStats(berry).damage, 'the ordinary mortar blast still lands');
  const seeds = game.projectiles;
  assert.equal(seeds.length, game.getStats(berry).seedCount);
  assert.ok(seeds.every(seed => seed.gravityCharged === true));
  assert.ok(seeds.every(seed => seed.orbitDuration > 0 && seed.orbitRemaining === seed.orbitDuration));
  assert.ok(seeds.every(seed => seed.damage > game.getStats(berry).seedDamage && seed.pierce > game.getStats(berry).seedPierce));
  assert.ok(seeds.every(seed => seed.color === '#111111'));
  assert.deepEqual(berry.levels, [0, 3, 0]);
  assert.deepEqual(orbit.levels, [3, 0, 0, 0]);
  assert.deepEqual(game.comboDiscoveries, ['berry-singularity']);
});

test('ordinary berry seeds remain unchanged without every active combo prerequisite', () => {
  for (const missing of ['seed-tier', 'horizon-tier', 'well', 'outside', 'expired', 'sold-orbit', 'sold-berry']) {
    const { game, orbit, berry, hole } = garden();
    const center = { x: hole.x, z: hole.z };
    if (missing === 'seed-tier') berry.levels[1] = 2;
    if (missing === 'horizon-tier') orbit.levels[0] = 2;
    if (missing === 'well') game.holes = [];
    if (missing === 'outside') center.x += hole.radius + .01;
    if (missing === 'expired') hole.ttl = 0;
    const shot = mortar(game, berry, center);
    if (missing === 'sold-orbit') game.towers = game.towers.filter(tower => tower !== orbit);
    if (missing === 'sold-berry') game.towers = game.towers.filter(tower => tower !== berry);
    game._burstStrawberry(shot);
    assert.equal(game.projectiles.length, shot.seedCount, missing);
    assert.ok(game.projectiles.every(seed => !seed.gravityCharged && seed.damage === shot.seedDamage && seed.pierce === shot.seedPierce), missing);
    assert.ok(!game.comboDiscoveries.includes('berry-singularity'), missing);
  }
});

test('the landing position is checked against the well, including its exact boundary', () => {
  const { game, berry, hole } = garden();
  burst(game, berry, { x: hole.x + hole.radius, z: hole.z });
  assert.ok(game.projectiles.every(seed => seed.gravityCharged));
});

test('a well shares its combo cooldown across different Strawberry gnomes', () => {
  const { game, berry, hole } = garden();
  const otherBerry = unit(game, 'strawberry', [0, 3, 0], 2, 0);
  assert.ok(burst(game, berry, hole).every(seed => seed.gravityCharged));
  game.projectiles = [];
  assert.ok(burst(game, otherBerry, hole).every(seed => !seed.gravityCharged));
  game.projectiles = [];
  game.time += BERRY_SINGULARITY.cooldown + .001;
  assert.ok(burst(game, otherBerry, hole).every(seed => seed.gravityCharged));
  assert.equal(game.events.filter(event => event.type === 'combo' && event.combo === 'berry-singularity').length, 1);
});

test('charged seeds deal no shrapnel damage while orbiting and retain their radial flight budget', () => {
  const { game, berry, hole } = garden();
  const seed = burst(game, berry, hole)[0];
  game.projectiles = [seed];
  const target = enemy(game, hole.x + .2, hole.z);
  const originalTtl = seed.ttl;
  const duration = seed.orbitRemaining;
  game._advanceProjectiles(duration / 2);
  assert.equal(target.hp, target.maxHp);
  assert.ok(Math.abs(seed.ttl - (originalTtl - duration / 2)) < 1e-8);
  game._advanceProjectiles(duration / 2);
  assert.equal(target.hp, target.maxHp);
  assert.equal(seed.orbitRemaining, 0);
  assert.ok(Math.abs(seed.ttl - BERRY_SINGULARITY.flightDuration) < 1e-8);
  game._advanceProjectiles(.1);
  assert.equal(target.hp, target.maxHp - seed.damage - target.maxHp * BERRY_SINGULARITY.healthFraction);
  assert.equal(new Set(seed.hitIds).size, seed.hitIds.length);
});

test('charged radial seeds have finite pierce, unique victims, and bounded lifetime', () => {
  const { game, berry, hole } = garden();
  const seed = burst(game, berry, hole)[0];
  game.projectiles = [seed];
  const range = Math.hypot(seed.tx - seed.x, seed.tz - seed.z);
  assert.ok(range > game.getStats(berry).seedRange);
  const targets = Array.from({ length: seed.pierce + 1 }, (_, index) => enemy(game, hole.x + (index + 1) * range / (seed.pierce + 2), hole.z));
  game._advanceProjectiles(seed.orbitRemaining);
  game._advanceProjectiles(seed.maxTtl + .1);
  assert.equal(game.projectiles.length, 0);
  assert.equal(seed.hitIds.length, seed.pierce);
  assert.equal(new Set(seed.hitIds).size, seed.pierce);
  for (const target of targets.slice(0, seed.pierce)) assert.equal(target.hp, target.maxHp - seed.damage - target.maxHp * BERRY_SINGULARITY.healthFraction);
  assert.equal(targets.at(-1).hp, targets.at(-1).maxHp);
  game._advanceProjectiles(10);
  assert.equal(game.projectiles.length, 0);
});

test('an empty charged burst still expires and cannot spawn recursive seeds', () => {
  const { game, berry, hole } = garden();
  const seeds = burst(game, berry, hole);
  const ttl = Math.max(...seeds.map(seed => seed.orbitRemaining + seed.ttl));
  game._advanceProjectiles(ttl + 1);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.kills, 0);
});

test('co-op partners share Berry Singularity and snapshots preserve independent orbital state', () => {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('host', 'First');
  match.addPlayer('guest', 'Second');
  const { game, orbit, berry, hole } = garden(match.board());
  orbit.ownerId = 'host';
  berry.ownerId = 'guest';
  burst(game, berry, hole);
  game._advanceProjectiles(.1);
  const state = JSON.parse(JSON.stringify(match.snapshot('room'))).boards[0].state;
  assert.equal(state.projectiles.length, game.getStats(berry).seedCount);
  const shot = state.projectiles[0];
  assert.equal(shot.gravityCharged, true);
  assert.equal(shot.sourceId, berry.id);
  assert.equal(shot.orbitRemaining, game.projectiles[0].orbitRemaining);
  assert.ok(shot.orbitRemaining < shot.orbitDuration);
  shot.hitIds.push('not-authoritative');
  assert.deepEqual(game.projectiles[0].hitIds, []);
  assert.ok(state.events.some(event => event.combo === 'berry-singularity'));
});

test('the nearest eligible overlapping well receives the burst and its own cooldown', () => {
  const { game, berry, hole } = garden();
  const secondOrbit = unit(game, 'gravity', [3, 0, 0, 0]);
  const near = openWell(game, secondOrbit, 9.5);
  const center = { x: near.x, z: near.z + .1 };
  const seeds = burst(game, berry, center);
  assert.ok(seeds.every(seed => seed.x === near.x && seed.z === near.z));
  assert.equal(near.berryReadyAt, game.time + BERRY_SINGULARITY.cooldown);
  assert.equal(hole.berryReadyAt, undefined);
  game.projectiles = [];
  const fallback = burst(game, berry, center);
  assert.ok(fallback.every(seed => seed.gravityCharged && seed.x === hole.x && seed.z === hole.z));
  assert.equal(hole.berryReadyAt, game.time + BERRY_SINGULARITY.cooldown);
});

test('burst limits include charged seeds still pending in the same projectile update', () => {
  const { game, berry, hole } = garden();
  const count = game.getStats(berry).seedCount;
  const groups = Math.floor(BERRY_SINGULARITY.projectileLimit / count);
  burst(game, berry, hole);
  for (let i = 1; i < groups; i++) {
    openWell(game, unit(game, 'gravity', [3, 0, 0, 0]));
    burst(game, berry, hole);
  }
  assert.equal(game.projectiles.filter(seed => seed.gravityCharged).length, groups * count);
  const spare = openWell(game, unit(game, 'gravity', [3, 0, 0, 0]));
  const shot = mortar(game, berry, hole);
  shot.ttl = .01;
  game.projectiles.unshift(shot);
  game._advanceProjectiles(.02);
  assert.equal(game.projectiles.filter(seed => seed.gravityCharged).length, groups * count);
  assert.equal(game.projectiles.filter(seed => !seed.gravityCharged).length, count, 'the mortar falls back to ordinary seeds');
  assert.equal(spare.berryReadyAt, undefined, 'a rejected charge must not consume the spare well cooldown');
  assert.ok(game.projectiles.filter(seed => seed.gravityCharged).length <= BERRY_SINGULARITY.projectileLimit);
});

test('crossing the orbit boundary spends leftover frame time on flight consistently', () => {
  const simulations = [[BERRY_SINGULARITY.orbitDuration + .1], [BERRY_SINGULARITY.orbitDuration, .1]].map(steps => {
    const { game, berry, hole } = garden();
    const seed = burst(game, berry, hole)[0];
    game.projectiles = [seed];
    const target = enemy(game, hole.x + .4, hole.z);
    for (const dt of steps) game._advanceProjectiles(dt);
    return { hp: target.hp, ttl: seed.ttl, orbitRemaining: seed.orbitRemaining, hits: seed.hitIds.length };
  });
  assert.equal(simulations[0].hp, simulations[1].hp);
  assert.equal(simulations[0].hits, 1);
  assert.equal(simulations[0].orbitRemaining, 0);
  assert.ok(Math.abs(simulations[0].ttl - simulations[1].ttl) < 1e-8);
});

test('charged seed health scaling is weaker against bosses and every defeat rewards once', () => {
  for (const boss of [false, true]) {
    const { game, berry, hole } = garden();
    const seed = burst(game, berry, hole)[0];
    game.projectiles = [seed];
    const target = enemy(game, hole.x + 1, hole.z);
    target.boss = boss;
    game._advanceProjectiles(seed.maxTtl + .1);
    const fraction = boss ? BERRY_SINGULARITY.bossFraction : BERRY_SINGULARITY.healthFraction;
    assert.equal(target.hp, target.maxHp - seed.damage - target.maxHp * fraction);
  }
  const { game, berry, hole } = garden();
  const seed = burst(game, berry, hole)[0];
  game.projectiles = [seed];
  enemy(game, hole.x + .5, hole.z, 1);
  enemy(game, hole.x + 1, hole.z, 1);
  const { gold, points } = game;
  game._advanceProjectiles(seed.maxTtl + .1);
  assert.equal(game.kills, 2);
  assert.equal(berry.kills, 2);
  assert.equal(game.gold - gold, 12);
  assert.equal(game.points - points, 2);
  assert.equal(game.projectiles.length, 0);
  game._advanceProjectiles(10);
  assert.equal(game.kills, 2);
  assert.equal(game.effects.filter(effect => effect.type === 'berry-singularity').length, 1);
});
