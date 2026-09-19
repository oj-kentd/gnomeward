import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';
import { SPOREFIRE, PRISMSTORM, BERRY_SINGULARITY } from '../src/combos.js';
import { Match } from '../server/match.js';

function unit(game, type, levels, x = -4, z = 0) {
  const tower = game._makeTower(type, x, z, TOWERS[type].cost);
  Object.assign(tower, { levels, cooldown: 999 });
  return tower;
}
function scenario(kind, { incomplete = false, game = new Game('meadow', { unlocks: Object.keys(TOWERS) }) } = {}) {
  Object.assign(game, { status: 'wave', wave: 1, _spawnTimer: 999 });
  const target = game._spawn('gold');
  Object.assign(target, game.pointAt(9), { progress: 9, hp: 1e9, maxHp: 1e9, speed: 0 });
  let first, second, trigger, cooldown;
  if (kind === 'sporefire') {
    first = unit(game, 'spore', [0, 0, 0, incomplete ? 2 : 3]);
    second = unit(game, 'boom', [0, 3, 0, 0]);
    game._plant(first, game.getStats(first));
    const trap = game.traps.at(-1);
    Object.assign(target, { x: trap.x, z: trap.z, progress: trap.progress });
    game.update(.05);
    assert.equal(target.poison.sourceId, first.id);
    trigger = () => {
      game._launch(second, target, game.getStats(second));
      game._advanceProjectiles(2);
    };
    cooldown = SPOREFIRE.cooldown;
  } else if (kind === 'prismstorm') {
    first = unit(game, 'multi', [incomplete ? 2 : 3]);
    second = unit(game, 'crystal', [0, 3, 0, 0], -3, 0);
    trigger = () => { first.cooldown = 0; game._step(.01); };
    cooldown = PRISMSTORM.cooldown;
  } else {
    first = unit(game, 'gravity', [incomplete ? 2 : 3, 0, 0, 0]);
    second = unit(game, 'strawberry', [0, 3, 0], 0, 0);
    assert.equal(game._openHole(first, game.getStats(first), target), true);
    const hole = game.holes.at(-1);
    trigger = () => {
      game._launch(second, hole, game.getStats(second));
      game._burstStrawberry(game.projectiles.pop());
    };
    cooldown = BERRY_SINGULARITY.cooldown;
  }
  const bystander = unit(game, 'sprout', [3, 3, 0, 0], 8, 5);
  return { game, first, second, bystander, target, trigger, cooldown };
}
function marked(tower, kind, time) {
  assert.deepEqual(tower.comboActive, { kind, startedAt: time, until: time + 3 });
}
const kinds = ['sporefire', 'prismstorm', 'berry-singularity'];

for (const kind of kinds) {
  test(`${kind} marks only its actual participants after a real reaction, not after upgrades`, () => {
    const { game, first, second, bystander, trigger } = scenario(kind);
    assert.equal(first.comboActive, undefined);
    assert.equal(second.comboActive, undefined);
    const extra = kind === 'prismstorm'
      ? unit(game, 'crystal', [0, 3, 0, 0], -2, 0)
      : unit(game, first.type, [...first.levels]);
    if (kind === 'berry-singularity') assert.equal(game._openHole(extra, game.getStats(extra), { ...game.pointAt(9.5), progress: 9.5, routeIndex: 0 }), true);
    trigger();
    marked(first, kind, game.time);
    marked(second, kind, game.time);
    assert.equal(bystander.comboActive, undefined);
    assert.equal(extra.comboActive, undefined, 'another eligible tower is not automatically a participant');
    assert.notEqual(first.comboActive, second.comboActive, 'each tower owns independent metadata');
  });

  test(`${kind} missing prerequisites never advertise an active combination`, () => {
    const { first, second, bystander, trigger } = scenario(kind, { incomplete: true });
    trigger();
    for (const tower of [first, second, bystander]) assert.equal(tower.comboActive, undefined);
  });

  test(`${kind} cooldown attempts do not refresh indicators, but a later reaction does`, () => {
    const { game, first, second, trigger, cooldown } = scenario(kind);
    trigger();
    const initial = structuredClone(first.comboActive);
    game.time += .1;
    trigger();
    assert.deepEqual(first.comboActive, initial);
    assert.deepEqual(second.comboActive, initial);
    if (kind === 'prismstorm') {
      // Advance the real attack/cooldown loop; the next eligible volley renews it.
      game._step(cooldown);
    } else {
      game.time += cooldown;
      trigger();
    }
    marked(first, kind, game.time);
    marked(second, kind, game.time);
    assert.ok(first.comboActive.until > initial.until);
  });

  test(`${kind} activation crosses co-op ownership and snapshot metadata is isolated`, () => {
    const match = new Match({ mode: 'coop', mapId: 'meadow' });
    match.addPlayer('one', 'First');
    match.addPlayer('two', 'Second');
    const { game, first, second, trigger } = scenario(kind, { game: match.board() });
    first.ownerId = 'one';
    second.ownerId = 'two';
    trigger();
    const state = JSON.parse(JSON.stringify(match.snapshot('indicator-fixture'))).boards[0].state;
    const firstCopy = state.towers.find(tower => tower.id === first.id);
    const secondCopy = state.towers.find(tower => tower.id === second.id);
    marked(firstCopy, kind, game.time);
    marked(secondCopy, kind, game.time);
    assert.equal(firstCopy.ownerId, 'one');
    assert.equal(secondCopy.ownerId, 'two');
    firstCopy.comboActive.until = 999999;
    marked(first, kind, game.time);
    marked(secondCopy, kind, game.time);
  });
}

test('expired indicator metadata has a fixed simulation deadline without changing combat', () => {
  const { game, first, second, trigger } = scenario('sporefire');
  trigger();
  const deadline = first.comboActive.until;
  const before = { firstKills: first.kills, secondKills: second.kills, firstDamage: first.damageDone, secondDamage: second.damageDone };
  game.time = deadline + .01;
  assert.ok(first.comboActive.until < game.time && second.comboActive.until < game.time);
  assert.deepEqual({ firstKills: first.kills, secondKills: second.kills, firstDamage: first.damageDone, secondDamage: second.damageDone }, before);
});

test('a sold Morel cannot create a phantom participant when its lingering spores react', () => {
  const { game, first, second, trigger } = scenario('sporefire');
  game.towers = game.towers.filter(tower => tower !== first);
  trigger();
  marked(second, 'sporefire', game.time);
  assert.equal(first.comboActive, undefined);
  assert.equal(game.towers.some(tower => tower.id === first.id), false);
});

test('a full Prism shard budget leaves an ordinary volley unmarked and preserves combo readiness', () => {
  const { game, first, second, target, trigger } = scenario('prismstorm');
  for (let i = 0; i < PRISMSTORM.projectileLimit; i++) assert.equal(game._launchPrismShard(first, target), true);
  const existing = new Set(game.projectiles.map(shot => shot.id));
  trigger();
  const launched = game.projectiles.filter(shot => !existing.has(shot.id));
  assert.ok(launched.length > 0 && launched.every(shot => shot.type === 'shot'));
  assert.equal(first.comboActive, undefined);
  assert.equal(second.comboActive, undefined);
  assert.equal(first.prismCooldown || 0, 0);
  assert.ok(!game.events.some(event => event.type === 'combo' && event.combo === 'prismstorm'));
  assert.ok(!game.effects.some(effect => effect.type === 'prism-burst'));
  assert.ok(!game.comboDiscoveries.includes('prismstorm'));
  // Releasing one charged slot permits an actual empowered attack immediately.
  const freed = game.projectiles.findIndex(shot => shot.type === 'prism-shard');
  game.projectiles.splice(freed, 1);
  trigger();
  marked(first, 'prismstorm', game.time);
  marked(second, 'prismstorm', game.time);
  assert.equal(game.projectiles.filter(shot => shot.type === 'prism-shard').length, PRISMSTORM.projectileLimit);
  assert.equal(first.prismCooldown, PRISMSTORM.cooldown);
});
