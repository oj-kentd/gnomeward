import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMIES, TOWERS } from '../src/data.js';
import { Match } from '../server/match.js';
import { SPOREFIRE, PRISMSTORM } from '../src/combos.js';

function garden() {
  const game = new Game('meadow', { unlocks: Object.keys(TOWERS) });
  game.status = 'wave';
  game.wave = 1;
  game._spawnTimer = 999;
  return game;
}
function tower(game, type, levels, x = -4, z = 0) {
  const unit = game._makeTower(type, x, z, TOWERS[type].cost);
  unit.levels = levels;
  unit.cooldown = 999;
  return unit;
}
function enemy(game, progress = 9, type = 'gold', hp = 10000) {
  const unit = game._spawn(type);
  Object.assign(unit, game.pointAt(progress), { progress, hp, maxHp: hp, speed: 0 });
  return unit;
}
function poisonFromMushroom(game, morel, target) {
  game._plant(morel, game.getStats(morel));
  const trap = game.traps.at(-1);
  assert.ok(trap, 'Morel must place an actual mushroom');
  Object.assign(target, { progress: trap.progress, x: trap.x, z: trap.z });
  game.update(.05);
  assert.equal(target.poison?.sourceId, morel.id, 'the victim must catch real Morel poison');
  return target;
}
function directHit(game, attacker, target) {
  game._launch(attacker, target, game.getStats(attacker));
  game._advanceProjectiles(2);
}

test('ordinary Bramble hits do not ignite incomplete Morel and blast combinations', () => {
  for (const [morelLevels, brambleLevels] of [
    [[2, 0, 0, 3], [0, 3, 0, 0]],
    [[3, 0, 0, 2], [0, 3, 0, 0]],
    [[3, 0, 0, 3], [0, 2, 0, 0]],
  ]) {
    const game = garden();
    const morel = tower(game, 'spore', morelLevels);
    const bramble = tower(game, 'boom', brambleLevels, -4, 2);
    const target = poisonFromMushroom(game, morel, enemy(game));
    const neighbor = enemy(game, target.progress + .7);
    const before = target.hp;
    directHit(game, bramble, target);
    assert.equal(target.hp, before - game.getStats(bramble).damage);
    assert.equal(neighbor.hp, neighbor.maxHp, 'missing any prerequisite must leave nearby enemies unharmed');
  }
});

test('maximal Bramble alone still requires active Morel poison on the hit victim', () => {
  for (const poisonState of [null, 'expired', 'other-source']) {
    const game = garden();
    const bramble = tower(game, 'boom', [0, 3, 0, 0]);
    const target = enemy(game);
    const neighbor = enemy(game, 9.7);
    if (poisonState) target.poison = { remaining: poisonState === 'expired' ? 0 : 4, dps: 32, sourceId: bramble.id };
    const before = target.hp;
    directHit(game, bramble, target);
    assert.equal(target.hp, before - game.getStats(bramble).damage);
    assert.equal(neighbor.hp, neighbor.maxHp);
  }
});

const comboDamage = (combo, target) => combo.damage + target.maxHp * (target.boss ? combo.bossFraction : combo.healthFraction);
function sporefireGarden() {
  const game = garden();
  const morel = tower(game, 'spore', [3, 0, 0, 3]);
  const bramble = tower(game, 'boom', [0, 3, 0, 0], -4, 2);
  const target = poisonFromMushroom(game, morel, enemy(game));
  return { game, morel, bramble, target };
}
function prismGarden() {
  const game = garden();
  const tumble = tower(game, 'multi', [3]);
  const prism = tower(game, 'crystal', [3, 3, 0, 0], -3, 0);
  return { game, tumble, prism };
}

test('Sporefire ignites real volatile mushrooms and hits only living enemies inside its radius', () => {
  const { game, bramble, target } = sporefireGarden();
  assert.equal(target.poison.volatile, true);
  const neighbor = enemy(game, target.progress + .5);
  const outside = enemy(game);
  outside.x = target.x + SPOREFIRE.radius + .01;
  outside.z = target.z;
  directHit(game, bramble, target);
  assert.equal(target.hp, target.maxHp - comboDamage(SPOREFIRE, target) - game.getStats(bramble).damage);
  assert.equal(neighbor.hp, neighbor.maxHp - comboDamage(SPOREFIRE, neighbor));
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 1);
  assert.equal(game.effects.find(effect => effect.type === 'sporefire').radius, SPOREFIRE.radius);
  assert.deepEqual(game.comboDiscoveries, ['sporefire']);
});

test('Sporefire victim cooldown is shared by different Brambles and permits later reactions', () => {
  const { game, bramble, target } = sporefireGarden();
  const other = tower(game, 'boom', [0, 3, 0, 0]);
  const neighbor = enemy(game, target.progress + .5);
  directHit(game, bramble, target);
  const after = neighbor.hp;
  directHit(game, other, target);
  assert.equal(neighbor.hp, after);
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 1);
  game.time += SPOREFIRE.cooldown + .001;
  directHit(game, other, target);
  assert.equal(neighbor.hp, after - comboDamage(SPOREFIRE, neighbor));
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 2);
  assert.equal(game.events.filter(event => event.type === 'combo').length, 1, 'announce a discovered combo only once');
});

test('secondary Morel infection retains volatile spores without creating recursive infection', () => {
  const { game, bramble, target } = sporefireGarden();
  const neighbor = enemy(game, target.progress + .5);
  game._spreadPoison(target, target.poison.spreadInterval);
  assert.equal(neighbor.poison?.volatile, true);
  assert.equal(neighbor.poison.secondary, true);
  const third = enemy(game, neighbor.progress + .1);
  game._spreadPoison(neighbor, 10);
  assert.equal(third.poison, null);
  directHit(game, bramble, neighbor);
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 1);
});

test('expired volatile poison and a sold Bramble cannot ignite in-flight shots', () => {
  for (const reason of ['expired', 'sold']) {
    const { game, bramble, target } = sporefireGarden();
    const neighbor = enemy(game, target.progress + .5);
    game._launch(bramble, target, game.getStats(bramble));
    if (reason === 'expired') target.poison.remaining = 0;
    else game.towers = game.towers.filter(unit => unit !== bramble);
    game._advanceProjectiles(2);
    assert.equal(neighbor.hp, neighbor.maxHp);
    assert.equal(game.effects.some(effect => effect.type === 'sporefire'), false);
  }
});

test('a dense Sporefire kill chain rewards each enemy once and does not recursively ignite', () => {
  const { game, bramble, target } = sporefireGarden();
  const victims = [target, ...Array.from({ length: 20 }, (_, i) => enemy(game, target.progress + i * .03))];
  for (const victim of victims) victim.hp = 1;
  const { gold, points, kills } = game;
  directHit(game, bramble, target);
  assert.ok(victims.every(victim => victim.hp === 0));
  assert.equal(game.kills - kills, victims.length);
  assert.equal(game.gold - gold, victims.reduce((sum, victim) => sum + ENEMIES[victim.type].reward, 0));
  assert.equal(game.points - points, victims.length);
  assert.equal(bramble.kills, victims.length);
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 1);
  assert.equal(game.effects.filter(effect => effect.type === 'explosion').length, victims.length);
  directHit(game, bramble, target);
  assert.equal(game.kills - kills, victims.length);
});

test('Prismstorm requires all three maximum tiers and a nearby partner', () => {
  for (const invalid of ['multi', 'durability', 'volatile', 'range', 'missing']) {
    const { game, tumble, prism } = prismGarden();
    if (invalid === 'multi') tumble.levels[0] = 2;
    if (invalid === 'durability') prism.levels[0] = 2;
    if (invalid === 'volatile') prism.levels[1] = 2;
    if (invalid === 'range') prism.x = tumble.x + PRISMSTORM.partnerRange + .01;
    if (invalid === 'missing') game.towers = [tumble];
    assert.equal(game.prismPartner(tumble), null, invalid);
    enemy(game);
    tumble.cooldown = 0;
    game._step(.01);
    assert.ok(game.projectiles.length > 0);
    assert.ok(game.projectiles.every(shot => shot.type !== 'prism-shard'), invalid);
  }
});

test('Prismstorm accepts the exact partner range and chooses the closest eligible Prism', () => {
  const { game, tumble, prism } = prismGarden();
  prism.x = tumble.x + PRISMSTORM.partnerRange;
  assert.equal(game.prismPartner(tumble), prism);
  const nearer = tower(game, 'crystal', [3, 3, 0, 0], tumble.x + 2, tumble.z);
  assert.equal(game.prismPartner(tumble), nearer);
  assert.equal(game.prismPartner(prism), null);
});

test('Prismstorm empowers complete volleys periodically while normal attacks continue between them', () => {
  const { game, tumble } = prismGarden();
  const count = game.getStats(tumble).shots;
  for (let i = 0; i < count; i++) enemy(game, 8.5 + i * .1, 'gold', 1000000);
  tumble.cooldown = 0;
  game._step(.01);
  assert.equal(game.projectiles.filter(shot => shot.type === 'prism-shard').length, count);
  assert.equal(tumble.prismCooldown, PRISMSTORM.cooldown);
  game.projectiles = [];
  tumble.cooldown = 0;
  game._step(.01);
  assert.equal(game.projectiles.length, count);
  assert.ok(game.projectiles.every(shot => shot.type !== 'prism-shard'));
  game.projectiles = [];
  tumble.cooldown = 999;
  game.update(PRISMSTORM.cooldown);
  tumble.cooldown = 0;
  game._step(.01);
  assert.equal(game.projectiles.filter(shot => shot.type === 'prism-shard').length, count);
  assert.equal(game.events.filter(event => event.type === 'combo').length, 1);
});

test('each Prism shard hits at most three unique victims and then expires', () => {
  const { game, tumble } = prismGarden();
  const victims = Array.from({ length: 4 }, (_, i) => enemy(game, 9 + i * .5));
  game._launchPrismShard(tumble, victims[0]);
  for (let hop = 0; hop <= PRISMSTORM.bounces; hop++) {
    const active = game.projectiles[0];
    assert.equal(active.bounces, PRISMSTORM.bounces - hop);
    assert.equal(new Set(active.hitIds).size, active.hitIds.length);
    assert.equal(active.hitIds.length, hop);
    game._advanceProjectiles(1);
  }
  assert.equal(game.projectiles.length, 0);
  for (const victim of victims.slice(0, 3)) assert.equal(victim.hp, victim.maxHp - comboDamage(PRISMSTORM, victim));
  assert.equal(victims[3].hp, victims[3].maxHp);
  assert.equal(tumble.damageDone, victims.slice(0, 3).reduce((sum, victim) => sum + comboDamage(PRISMSTORM, victim), 0));
});

test('Prism shards track moving targets and do not damage before reaching them', () => {
  const { game, tumble } = prismGarden();
  const target = enemy(game);
  game._launchPrismShard(tumble, target);
  target.x += 1;
  target.z += 1;
  game._advanceProjectiles(.01);
  assert.equal(game.projectiles[0].tx, target.x);
  assert.equal(game.projectiles[0].tz, target.z);
  assert.equal(target.hp, target.maxHp);
  game._advanceProjectiles(1);
  assert.equal(target.hp, target.maxHp - comboDamage(PRISMSTORM, target));
});

test('dead Prism targets consume finite hops and never award damage or rewards', () => {
  const { game, tumble } = prismGarden();
  const victims = Array.from({ length: 6 }, (_, i) => enemy(game, 9 + i * .1));
  const { kills, gold, points } = game;
  game._launchPrismShard(tumble, victims[0]);
  for (let hop = 0; hop <= PRISMSTORM.bounces; hop++) {
    const active = game.projectiles[0];
    assert.ok(active);
    game.enemies.find(victim => victim.id === active.targetId).hp = 0;
    game._advanceProjectiles(1);
  }
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.kills, kills);
  assert.equal(game.gold, gold);
  assert.equal(game.points, points);
  assert.equal(tumble.damageDone, 0);
});

test('combo percentage damage scales less aggressively against bosses', () => {
  for (const combo of [SPOREFIRE, PRISMSTORM]) {
    const damages = [];
    for (const boss of [false, true]) {
      const { game, bramble, target } = sporefireGarden();
      target.boss = boss;
      if (combo === SPOREFIRE) game._igniteSpores(target, bramble.id);
      else {
        const tumble = tower(game, 'multi', [3]);
        game._launchPrismShard(tumble, target);
        game._advanceProjectiles(1);
      }
      damages.push(target.maxHp - target.hp);
      assert.ok(Math.abs(damages.at(-1) - comboDamage(combo, target)) < 1e-8);
    }
    assert.ok(damages[0] > damages[1]);
  }
});

test('Prism shards cannot ricochet beyond range and disappear when their source is sold', () => {
  for (const reason of ['range', 'sold']) {
    const { game, tumble } = prismGarden();
    const target = enemy(game);
    const outside = enemy(game);
    outside.x = target.x + PRISMSTORM.ricochetRange + .01;
    game._launchPrismShard(tumble, target);
    if (reason === 'sold') game.towers = game.towers.filter(unit => unit !== tumble);
    game._advanceProjectiles(1);
    assert.equal(game.projectiles.length, 0);
    assert.equal(outside.hp, outside.maxHp);
    assert.equal(target.hp, reason === 'sold' ? target.maxHp : target.maxHp - comboDamage(PRISMSTORM, target));
  }
});

test('Prism launch cap bounds simultaneous shards including ricochets', () => {
  const { game, tumble } = prismGarden();
  const target = enemy(game, 9, 'gold', 1000000000);
  enemy(game, 9.5, 'gold', 1000000000);
  for (let i = 0; i < PRISMSTORM.projectileLimit; i++) assert.equal(game._launchPrismShard(tumble, target), true);
  assert.equal(game._launchPrismShard(tumble, target), false);
  game._advanceProjectiles(1);
  assert.ok(game.projectiles.length <= PRISMSTORM.projectileLimit);
  game._advanceProjectiles(1);
  game._advanceProjectiles(1);
  assert.equal(game.projectiles.length, 0);
});

test('co-op teammates can form Prismstorm and snapshots retain independent projectile histories', () => {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('a', 'One');
  match.addPlayer('b', 'Two');
  const game = match.board();
  Object.assign(game, { status: 'wave', wave: 1, _spawnTimer: 999 });
  const tumble = tower(game, 'multi', [3]);
  const prism = tower(game, 'crystal', [3, 3, 0, 0], -3, 0);
  tumble.ownerId = 'a';
  prism.ownerId = 'b';
  const first = enemy(game);
  enemy(game, 9.5);
  assert.equal(game.prismPartner(tumble), prism);
  tumble.cooldown = 0;
  game._step(.01);
  game._advanceProjectiles(1);
  assert.ok(game.projectiles.some(shot => shot.hitIds.includes(first.id)));
  const state = JSON.parse(JSON.stringify(match.snapshot('room'))).boards[0].state;
  assert.ok(state.effects.some(effect => effect.type === 'prism-burst'));
  const snapshotShot = state.projectiles[0];
  const authoritativeShot = game.projectiles.find(shot => shot.id === snapshotShot.id);
  assert.equal(snapshotShot.sourceId, tumble.id);
  assert.equal(snapshotShot.bounces, PRISMSTORM.bounces - 1);
  assert.deepEqual(snapshotShot.hitIds, authoritativeShot.hitIds);
  snapshotShot.hitIds.push('forged');
  assert.ok(!authoritativeShot.hitIds.includes('forged'));
});

test('overlapping Sporefire bursts protect every previous victim, not only the trigger target', () => {
  const { game, morel, bramble, target } = sporefireGarden();
  const second = enemy(game, target.progress + .6);
  game._spreadPoison(target, target.poison.spreadInterval);
  assert.equal(second.poison.sourceId, morel.id);
  directHit(game, bramble, target);
  const after = target.hp;
  directHit(game, bramble, second);
  assert.equal(target.hp, after, 'changing poisoned targets must not bypass the shared victim cooldown');
  assert.equal(game.effects.filter(effect => effect.type === 'sporefire').length, 1);
});

test('poison ticks alone cannot trigger Sporefire even with a nearby maximized Bramble', () => {
  const { game, target } = sporefireGarden();
  const before = target.hp;
  const dps = target.poison.dps;
  game._step(.05);
  assert.equal(target.hp, before - dps * .05);
  assert.ok(!game.effects.some(effect => effect.type === 'sporefire'));
});

test('co-op snapshots retain volatile infection and shared reaction cooldown without references', () => {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('a', 'One');
  match.addPlayer('b', 'Two');
  const game = match.board();
  Object.assign(game, { status: 'wave', wave: 1, _spawnTimer: 999 });
  const morel = tower(game, 'spore', [3, 0, 0, 3]);
  const bramble = tower(game, 'boom', [0, 3, 0, 0]);
  morel.ownerId = 'a';
  bramble.ownerId = 'b';
  const target = poisonFromMushroom(game, morel, enemy(game));
  directHit(game, bramble, target);
  const state = JSON.parse(JSON.stringify(match.snapshot('room'))).boards[0].state;
  const snapshotTarget = state.enemies.find(unit => unit.id === target.id);
  assert.equal(snapshotTarget.poison.volatile, true);
  assert.equal(snapshotTarget.sporefireReadyAt, game.time + SPOREFIRE.cooldown);
  assert.equal(state.effects.find(effect => effect.type === 'sporefire').radius, SPOREFIRE.radius);
  snapshotTarget.poison.volatile = false;
  assert.equal(target.poison.volatile, true);
});
