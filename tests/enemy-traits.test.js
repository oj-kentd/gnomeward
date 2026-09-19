import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TRAITS, traitForSpawn, damageMultiplier, damageKindForTower } from '../src/enemy-traits.js';
import { TOWERS } from '../src/data.js';
import { Game } from '../src/game.js';
import { Match } from '../server/match.js';
import { SPOREFIRE, PRISMSTORM, BERRY_SINGULARITY } from '../src/combos.js';

const kinds = ['physical', 'magic', 'poison'];

test('traits introduce the intended three-way damage cycle', () => {
  assert.deepEqual(Object.keys(ENEMY_TRAITS), ['armored', 'runed', 'toxic']);
  assert.deepEqual(kinds.map(kind => damageMultiplier('armored', kind)), [.5, 2, 1]);
  assert.deepEqual(kinds.map(kind => damageMultiplier('runed', kind)), [1, .5, 2]);
  assert.deepEqual(kinds.map(kind => damageMultiplier('toxic', kind)), [2, 1, .5]);
  for (const kind of kinds) {
    const multipliers = Object.keys(ENEMY_TRAITS).map(trait => damageMultiplier(trait, kind));
    assert.deepEqual(multipliers.sort((a, b) => a - b), [.5, 1, 2], `${kind} has one counter, one advantage, and one neutral matchup`);
  }
});

test('campaign, early endless waves, and bosses never acquire traits', () => {
  for (let wave = 1; wave <= 100; wave++) for (let ordinal = 0; ordinal < 12; ordinal++) {
    assert.equal(traitForSpawn(wave, false, false, ordinal), null);
    assert.equal(traitForSpawn(wave, true, true, ordinal), null);
    if (wave < 25) assert.equal(traitForSpawn(wave, true, false, ordinal), null);
  }
});

test('each milestone first introduces its new trait and never introduces a future trait', () => {
  for (const [wave, newest, available] of [
    [25, 'armored', ['armored']], [29, 'armored', ['armored']],
    [30, 'runed', ['armored', 'runed']], [34, 'runed', ['armored', 'runed']],
    [35, 'toxic', ['armored', 'runed', 'toxic']], [70, 'toxic', ['armored', 'runed', 'toxic']],
  ]) {
    assert.equal(traitForSpawn(wave, true, false, 0), newest);
    const spawned = Array.from({ length: 48 }, (_, ordinal) => traitForSpawn(wave, true, false, ordinal)).filter(Boolean);
    assert.deepEqual([...new Set(spawned)].sort(), [...available].sort());
    for (const trait of spawned) assert.ok(ENEMY_TRAITS[trait].startWave <= wave);
  }
});

test('one quarter of regular spawns carry deterministic, evenly distributed available traits', () => {
  for (let wave = 25; wave <= 100; wave++) {
    const sequence = Array.from({ length: 96 }, (_, ordinal) => traitForSpawn(wave, true, false, ordinal));
    assert.equal(sequence.filter(Boolean).length, 24);
    assert.deepEqual(sequence, Array.from({ length: 96 }, (_, ordinal) => traitForSpawn(wave, true, false, ordinal)));
    assert.ok(sequence.every((trait, ordinal) => ordinal % 4 === 0 ? typeof trait === 'string' : trait === null));
    const available = Object.values(ENEMY_TRAITS).filter(trait => trait.startWave <= wave);
    for (const trait of available) assert.equal(sequence.filter(value => value === trait.id).length, 24 / available.length);
  }
});

test('spawn choice is stateless across waves and boss queries', () => {
  const before = traitForSpawn(35, true, false, 0);
  for (let i = 0; i < 30; i++) traitForSpawn(70, true, true, i);
  assert.equal(traitForSpawn(35, true, false, 0), before);
  assert.equal(traitForSpawn(30, true, false, 0), 'runed');
  assert.equal(traitForSpawn(25, true, false, 0), 'armored');
});

test('invalid spawn inputs do not create accidental traits', () => {
  for (const wave of [undefined, null, NaN, Infinity, -1, 25.5, '35']) assert.equal(traitForSpawn(wave, true, false, 0), null);
  for (const ordinal of [undefined, null, NaN, Infinity, -4, .5, '0']) assert.equal(traitForSpawn(35, true, false, ordinal), null);
  for (const endless of [undefined, null, 1, 'true']) assert.equal(traitForSpawn(35, endless, false, 0), null);
});

test('all current gnomes have explicit damage categories', () => {
  for (const type of ['sprout', 'boom', 'multi', 'sniper', 'strawberry']) assert.equal(damageKindForTower(type), 'physical');
  for (const type of ['stun', 'gravity', 'crystal', 'necro']) assert.equal(damageKindForTower(type), 'magic');
  assert.equal(damageKindForTower('spore'), 'poison');
  for (const type of Object.keys(TOWERS)) assert.ok(kinds.includes(damageKindForTower(type)), `new tower ${type} needs a damage category`);
});

test('unknown traits and damage kinds remain neutral; unrecognized towers use physical damage', () => {
  for (const trait of [undefined, null, '', 'unknown', '__proto__', 'constructor', 'toString', ['armored'], { toString: null }]) {
    for (const kind of kinds) assert.equal(damageMultiplier(trait, kind), 1);
  }
  for (const type of [undefined, null, '', 'unknown', '__proto__', 'constructor', 'toString', ['armored'], { toString: null }]) assert.equal(damageKindForTower(type), 'physical');
  for (const trait of Object.keys(ENEMY_TRAITS)) {
    for (const kind of [undefined, null, '', 'unknown', 'constructor']) assert.equal(damageMultiplier(trait, kind), 1);
  }
});

test('shared trait definitions cannot be modified by consumers', () => {
  assert.equal(Object.isFrozen(ENEMY_TRAITS), true);
  for (const trait of Object.values(ENEMY_TRAITS)) assert.equal(Object.isFrozen(trait), true);
  assert.throws(() => { ENEMY_TRAITS.armored.weak = 'physical'; }, TypeError);
  assert.equal(damageMultiplier('armored', 'magic'), 2);
});

// Integration checks exercise the actual spawn ledger, discovery profile, and
// damage entry point; these do not replace the deterministic module checks.

function endlessGame(wave, map = 'meadow') {
  const game = new Game(map);
  game.endless = true;
  game.wave = wave - 1;
  assert.equal(game.startWave(), true);
  return game;
}

test('Game starts each endless round at trait ordinal zero, excluding bosses and route choices', () => {
  const game = endlessGame(25, 'creek');
  assert.equal(game._spawn('boss', 1).trait, null);
  assert.equal(game._spawn('king', 0).trait, null);
  const regulars = Array.from({ length: 8 }, (_, index) => game._spawn('gold', index % 2));
  assert.deepEqual(regulars.map(enemy => enemy.trait), ['armored', null, null, null, 'armored', null, null, null]);
  assert.deepEqual(regulars.map(enemy => enemy.routeIndex), [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.ok(regulars.every(enemy => enemy.hp === regulars[0].hp && enemy.color === regulars[0].color), 'traits preserve ordinary skeleton health and color');
  game.status = 'planning';
  game.wave = 29;
  assert.equal(game.startWave(), true);
  assert.equal(game._spawn('bone').trait, 'runed');
  game.status = 'planning';
  game.wave = 34;
  assert.equal(game.startWave(), true);
  assert.equal(game._spawn('bone').trait, 'toxic');
});

test('Game never gives traits to campaign spawns or the first four endless rounds', () => {
  for (const [wave, endless] of [[20, false], [35, false], [21, true], [24, true]]) {
    const game = new Game();
    Object.assign(game, { wave, endless });
    for (let index = 0; index < 12; index++) assert.equal(game._spawn('gold').trait, null);
    assert.deepEqual(game.profile.enemyTraits, []);
  }
});

test('trait discovery persists once per profile and filters unknown or duplicate saved entries', () => {
  const game = endlessGame(35);
  for (let ordinal = 0; ordinal < 24; ordinal++) game._spawn('bone');
  assert.deepEqual([...game.profile.enemyTraits].sort(), ['armored', 'runed', 'toxic']);
  const announcements = game.events.filter(event => event.type === 'trait-discovered');
  assert.equal(announcements.length, 3);
  assert.deepEqual([...new Set(announcements.map(event => event.trait))].sort(), ['armored', 'runed', 'toxic']);
  const reloaded = new Game('meadow', JSON.parse(JSON.stringify(game.profile)));
  Object.assign(reloaded, { endless: true, wave: 35 });
  for (let ordinal = 0; ordinal < 12; ordinal++) reloaded._spawn('bone');
  assert.equal(reloaded.events.filter(event => event.type === 'trait-discovered').length, 0);
  assert.deepEqual(new Game('meadow', { enemyTraits: ['armored', 'toxic', 'armored', null, 'fake', '__proto__', ['armored'], { toString: null }] }).profile.enemyTraits, ['armored', 'toxic']);
  assert.deepEqual(new Game('meadow', { enemyTraits: 'armored' }).profile.enemyTraits, []);
});

test('every gnome damage category changes actual damage and damage attribution by its matchup', () => {
  for (const type of Object.keys(TOWERS)) for (const trait of Object.keys(ENEMY_TRAITS)) {
    const game = new Game();
    const tower = game._makeTower(type, -4, 0, TOWERS[type].cost);
    const target = game._spawn('gold');
    Object.assign(target, { hp: 10000, maxHp: 10000, trait });
    game._damage(target, 100, tower.id);
    const expected = 100 * damageMultiplier(trait, damageKindForTower(type));
    assert.equal(target.hp, 10000 - expected, `${type} versus ${trait}`);
    assert.equal(tower.damageDone, expected);
    assert.equal(game.kills, 0);
  }
});

test('co-op snapshots copy discovered traits and enemy trait tags without shared profile references', () => {
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'First'); match.addPlayer('two', 'Second');
  const game = match.board();
  Object.assign(game, { endless: true, wave: 35 });
  const target = game._spawn('gold');
  const state = match.snapshot('trait-fixture').boards[0].state;
  assert.equal(state.enemies.find(enemy => enemy.id === target.id).trait, 'toxic');
  assert.deepEqual(state.profile.enemyTraits, ['toxic']);
  state.profile.enemyTraits.push('armored');
  state.enemies.find(enemy => enemy.id === target.id).trait = 'runed';
  assert.deepEqual(game.profile.enemyTraits, ['toxic']);
  assert.equal(target.trait, 'toxic');
});

function combatTarget(game, trait, progress = 9) {
  const target = game._spawn('gold');
  Object.assign(target, game.pointAt(progress), { progress, hp: 1e6, maxHp: 1e6, speed: 0, trait });
  return target;
}

test('in-flight magic shots retain their damage category after their gnome is sold', () => {
  const game = new Game();
  const poppy = game._makeTower('stun', -4, 0, TOWERS.stun.cost);
  const target = combatTarget(game, 'armored');
  const stats = game.getStats(poppy);
  game._launch(poppy, target, stats);
  game.towers = [];
  game._advanceProjectiles(2);
  assert.equal(target.hp, target.maxHp - stats.damage * 2);
});

test('lingering poison remains poison after the Morel source is gone', () => {
  for (const trait of Object.keys(ENEMY_TRAITS)) {
    const game = new Game();
    Object.assign(game, { status: 'wave', wave: 1, _spawnTimer: 999 });
    const morel = game._makeTower('spore', -4, 0, TOWERS.spore.cost);
    const target = combatTarget(game, trait);
    target.poison = { sourceId: morel.id, dps: 100, remaining: 2 };
    game.towers = [];
    game._step(.1);
    assert.equal(target.hp, target.maxHp - 10 * damageMultiplier(trait, 'poison'));
  }
});

test('reborn melee is physical even though its credited Necromancer casts magic', () => {
  const game = new Game();
  const necro = game._makeTower('necro', -4, 0, TOWERS.necro.cost);
  const target = combatTarget(game, 'armored');
  const ally = game._spawnReborn(necro, 0);
  Object.assign(ally, game.pointAt(9), { progress: 9, phase: 'marching', cooldown: 0 });
  game._fightReborn();
  assert.equal(target.hp, target.maxHp - ally.damage * .5);
  assert.equal(necro.damageDone, ally.damage * .5);
  game._damage(target, 100, necro.id);
  assert.equal(target.hp, target.maxHp - ally.damage * .5 - 200);
});

test('Sporefire and Prismstorm explicitly override their physical shooters with poison and magic', () => {
  const poisonGame = new Game();
  const morel = poisonGame._makeTower('spore', -4, 0, TOWERS.spore.cost);
  morel.levels = [0, 0, 0, 3];
  const bramble = poisonGame._makeTower('boom', -3, 0, TOWERS.boom.cost);
  bramble.levels = [0, 3, 0, 0];
  const poisoned = combatTarget(poisonGame, 'runed');
  poisoned.poison = { sourceId: morel.id, volatile: true, remaining: 2 };
  assert.equal(poisonGame._igniteSpores(poisoned, bramble.id), true);
  assert.equal(poisoned.hp, poisoned.maxHp - 2 * (SPOREFIRE.damage + poisoned.maxHp * SPOREFIRE.healthFraction));
  const magicGame = new Game();
  const tumble = magicGame._makeTower('multi', -4, 0, TOWERS.multi.cost);
  tumble.levels = [3];
  const armored = combatTarget(magicGame, 'armored');
  magicGame._launchPrismShard(tumble, armored);
  magicGame._advanceProjectiles(1);
  assert.equal(armored.hp, armored.maxHp - 2 * (PRISMSTORM.damage + armored.maxHp * PRISMSTORM.healthFraction));
});

test('only gravity-charged Strawberry seeds become magic; ordinary seeds stay physical', () => {
  for (const charged of [false, true]) {
    const game = new Game();
    const berry = game._makeTower('strawberry', -4, 0, TOWERS.strawberry.cost);
    berry.levels = [0, 3, 0];
    const anchor = { ...game.pointAt(9), progress: 9, routeIndex: 0 };
    let center = anchor;
    if (charged) {
      const orbit = game._makeTower('gravity', -4, 0, TOWERS.gravity.cost);
      orbit.levels = [3, 0, 0, 0];
      assert.equal(game._openHole(orbit, game.getStats(orbit), anchor), true);
      center = game.holes[0];
    }
    game._launch(berry, center, game.getStats(berry));
    const mortar = game.projectiles.pop();
    mortar.damage = 0;
    game._burstStrawberry(mortar);
    const seed = game.projectiles[0];
    assert.equal(!!seed.gravityCharged, charged);
    game.projectiles = [seed];
    const target = combatTarget(game, 'armored');
    Object.assign(target, { x: center.x + 1, z: center.z });
    game._advanceProjectiles(seed.maxTtl + .1);
    const raw = seed.damage + (charged ? target.maxHp * BERRY_SINGULARITY.healthFraction : 0);
    assert.equal(target.hp, target.maxHp - raw * (charged ? 2 : .5));
  }
});

test('weakness-adjusted lethal hits credit actual health and award each defeat once', () => {
  const game = new Game();
  const sprout = game._makeTower('sprout', -4, 0, TOWERS.sprout.cost);
  const target = combatTarget(game, 'toxic');
  target.hp = target.maxHp = 15;
  const { gold, points } = game;
  game._damage(target, 10, sprout.id);
  assert.equal(target.hp, 0);
  assert.equal(sprout.damageDone, 15);
  assert.equal(sprout.kills, 1);
  assert.equal(game.kills, 1);
  assert.equal(game.gold, gold + 20);
  assert.equal(game.points, points + 1);
  game._damage(target, 10, sprout.id);
  assert.equal(game.kills, 1);
  assert.equal(game.gold, gold + 20);
  assert.equal(game.points, points + 1);
});
