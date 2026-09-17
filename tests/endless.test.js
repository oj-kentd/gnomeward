import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, wavePlan } from '../src/game.js';
import { MAPS, ENEMIES } from '../src/data.js';

function clear(g, wave) {
  g.wave = wave;
  g.status = 'wave';
  g.enemies = [];
  g._queue = [];
  g.update(.05);
}
function winner(map = 'meadow', profile) {
  const g = new Game(map, profile);
  clear(g, 20);
  return g;
}

test('endless requires an explicit choice after victory and preserves the existing defense', () => {
  const g = new Game();
  assert.equal(g.continueEndless(), false);
  const tower = g.placeTower('sprout', -4, 0);
  g.points = 100;
  assert.ok(g.upgradeTower(tower.id, 0));
  g.lives = 42;
  clear(g, 20);
  const before = JSON.stringify([g.towers, g.gold, g.points, g.lives, g.kills, g.profile.unlocks]);
  assert.equal(g.status, 'won');
  assert.equal(g.startWave(), false);
  assert.equal(g.continueEndless(), true);
  assert.equal(JSON.stringify([g.towers, g.gold, g.points, g.lives, g.kills, g.profile.unlocks]), before);
  assert.equal(g.status, 'planning');
  assert.equal(g.continueEndless(), false);
  assert.equal(g.nextWaveInfo().wave, 21);
  assert.equal(g.startWave(), true);
  assert.equal(g.wave, 21);
  assert.ok(g._queue.length > wavePlan(20).length);
});

test('endless plans recur indefinitely with bosses and bounded crowds', () => {
  for (const invalid of [0, -1, NaN, Infinity, 21.5, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(wavePlan(invalid, true), []);
  assert.deepEqual(wavePlan(21), []);
  for (let wave = 1; wave <= 20; wave++) assert.deepEqual(wavePlan(wave, true), wavePlan(wave));
  for (const wave of [21, 25, 30, 40, 100, 1000, 10000]) {
    const plan = wavePlan(wave, true);
    assert.ok(plan.length >= 52 && plan.length <= 186);
    assert.ok(plan.every(type => ENEMIES[type]));
    assert.equal(plan.some(type => ENEMIES[type].boss), wave % 5 === 0);
    if (wave % 10 === 0) assert.ok(plan.includes('king'));
    const g = winner(); g.continueEndless(); g.wave = wave - 1;
    assert.equal(g.nextWaveInfo().boss, wave % 5 === 0);
    assert.equal(g.nextWaveInfo().count, plan.length);
    g.startWave();
    assert.deepEqual(g._queue, plan);
  }
});

test('health, speed and melee strength keep increasing even after crowd size stops growing', () => {
  const g = winner(); g.continueEndless();
  for (const type of Object.keys(ENEMIES)) {
    let last = { hp: 0, speed: 0, attackDamage: 0 };
    for (const wave of [20, 21, 30, 100, 200, 1000]) {
      g.wave = wave;
      const e = g._spawn(type);
      for (const field of ['hp', 'speed', 'attackDamage']) {
        assert.ok(Number.isFinite(e[field]));
        assert.ok(e[field] > last[field], `${type} ${field} increases on round ${wave}`);
      }
      last = e;
    }
  }
});

test('endless clears keep awarding rewards and never trigger a second campaign victory', () => {
  const g = winner(); g.continueEndless(); g.events = [];
  const gold = g.gold, points = g.points;
  for (const wave of [21, 22, 30, 40, 100]) {
    clear(g, wave);
    assert.equal(g.status, 'planning');
    assert.equal(g.completedWaves, wave);
    assert.equal(g.bestRound, wave);
    assert.ok(g.startWave());
  }
  assert.ok(g.gold > gold && g.points > points);
  assert.equal(g.events.some(e => e.type === 'victory'), false);
});

test('losing counts only fully cleared rounds and stops endless combat', () => {
  const g = winner(); g.continueEndless(); clear(g, 21); g.startWave();
  g._queue = [];
  g.lives = 1;
  const enemy = g._spawn('bone');
  enemy.progress = g.pathLength - .001;
  g.update(.05);
  assert.equal(g.status, 'lost');
  assert.equal(g.wave, 22);
  assert.equal(g.completedWaves, 21);
  assert.equal(g.bestRound, 21);
  assert.equal(g.startWave(), false);
  assert.equal(g.continueEndless(), false);
  const events = g.events.length;
  g.update(1);
  assert.equal(g.events.length, events);
  const first = new Game(); first.startWave(); first.lives = 0; first.update(.05);
  assert.equal(first.bestRound, 0);
  assert.equal(first.completedWaves, 0);
});

test('best rounds persist across restarts and serialization, remain per map and never decrease', () => {
  const profile = { unlocks: ['necro'] };
  const g = winner('meadow', profile); g.continueEndless(); clear(g, 35);
  const reloaded = JSON.parse(JSON.stringify(profile));
  const retry = new Game('meadow', reloaded);
  assert.equal(retry.bestRound, 35);
  assert.equal(retry.endless, false);
  assert.equal(retry.completedWaves, 0);
  clear(retry, 1);
  assert.equal(retry.bestRound, 35);
  const other = new Game('quarry', reloaded);
  assert.equal(other.bestRound, 0);
  clear(other, 7);
  assert.equal(other.bestRound, 7);
  assert.equal(new Game('meadow', reloaded).bestRound, 35);
  assert.deepEqual(reloaded.unlocks, ['necro']);
});

test('legacy and malformed saved records migrate without breaking unlocks', () => {
  for (const bestRounds of [undefined, null, [], 'invalid', { meadow: -1, orchard: Infinity, creek: '30', quarry: 1.5, hollow: 27 }]) {
    const g = new Game('meadow', { unlocks: ['necro'], bestRounds });
    assert.equal(g.bestRound, 0);
    assert.ok(g.isUnlocked('necro'));
    for (const map of MAPS) assert.ok(Number.isSafeInteger(g.profile.bestRounds[map.id]));
    if (bestRounds?.hollow === 27) assert.equal(g.profile.bestRounds.hollow, 27);
  }
});

test('endless still alternates entrances on every two-route map', () => {
  for (const map of MAPS.filter(map => map.paths?.length > 1)) {
    const g = winner(map.id); g.continueEndless(); g.startWave();
    const first = g._spawn(g._queue.shift()), second = g._spawn(g._queue.shift());
    assert.equal(first.routeIndex, 0); assert.equal(second.routeIndex, 1);
    assert.deepEqual({x: second.x, z: second.z}, g.pointAt(0, 1));
  }
});
