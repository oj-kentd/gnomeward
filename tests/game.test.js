import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, wavePlan } from '../src/game.js';
import { MAPS, TOWERS, ENEMIES } from '../src/data.js';

const openGame = () => new Game('meadow', { unlocks: ['stun', 'multi', 'sniper'] });
const run = (g, duration) => { for (let i = 0; i < duration * 20; i++) g.update(0.05); };
const setEnemy = (g, type, progress) => { const e = g._spawn(type); e.progress = progress; Object.assign(e, g.pointAt(progress)); return e; };

test('five maps contain complete paths and every specified unit has its upgrade paths', () => {
  assert.equal(MAPS.length, 5);
  assert.equal(new Set(MAPS.map(m => m.id)).size, 5);
  for (const m of MAPS) {
    const g = new Game(m.id);
    assert.ok(g.pathLength > 40);
    assert.equal(m.path[0][0], -12);
    assert.equal(m.path.at(-1)[0], 12);
    assert.deepEqual(g.pointAt(g.pathLength), { x: 12, z: m.path.at(-1)[1] });
  }
  assert.deepEqual(Object.values(TOWERS).map(t => t.paths.length), [4, 4, 4, 4, 1, 2]);
  assert.ok(ENEMIES.bone.hp < ENEMIES.green.hp && ENEMIES.green.hp < ENEMIES.blue.hp);
});

test('placement rejects path, border, overlap, locked units and insufficient gold', () => {
  const g = new Game();
  assert.equal(g.canPlace('sprout', -9, 4), false);
  assert.equal(g.canPlace('sprout', 12, 7), false);
  assert.equal(g.canPlace('stun', 0, 0), false);
  assert.equal(g.canPlace('unknown', 0, 0), false);
  const tower = g.placeTower('sprout', -4, 0);
  assert.ok(tower);
  assert.equal(g.gold, 550);
  assert.equal(g.placeTower('sprout', -4, 0), null);
  g.gold = 0;
  assert.equal(g.canPlace('sprout', 9, 6), false);
});

test('a unit may choose at most two paths, each with three levels', () => {
  const g = new Game();
  const tower = g.placeTower('sprout', -4, 0);
  g.points = 1000;
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.points, 990);
  assert.ok(g.upgradeTower(tower.id, 1));
  assert.equal(g.upgradeTower(tower.id, 2), false);
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.upgradeTower(tower.id, 0), false);
  assert.equal(g.upgradeTower(tower.id, -1), false);
  assert.equal(g.upgradeTower(tower.id, 0.5), false);
  assert.equal(g.upgradeTower(999, 0), false);
  assert.ok(g.getStats(tower).damage > 8 * 5);
});

test('upgrades require points and selling returns 75% gold without refunding points', () => {
  const g = new Game();
  const tower = g.placeTower('sprout', -4, 0);
  assert.equal(g.upgradeTower(tower.id, 0), false);
  g.points = 10;
  g.upgradeTower(tower.id, 0);
  assert.equal(g.sellTower(tower.id), true);
  assert.equal(g.gold, 625);
  assert.equal(g.points, 0);
  assert.equal(g.sellTower(tower.id), false);
});

test('waves progress to 20 and include both bosses', () => {
  assert.equal(wavePlan(0).length, 0);
  assert.equal(wavePlan(21).length, 0);
  assert.ok(wavePlan(10).includes('boss'));
  assert.ok(wavePlan(20).includes('king'));
  assert.equal(wavePlan(9).includes('boss'), false);
  const g = new Game();
  assert.ok(g.startWave());
  assert.equal(g.startWave(), false);
  assert.equal(g.wave, 1);
});

test('poison mushrooms apply damage over time and credit their gardener', () => {
  const g = new Game();
  const tower = g.placeTower('spore', -4, 0);
  const e = setEnemy(g, 'bone', 1);
  e.speed = 0;
  g.traps.push({ id: 999, ...g.pointAt(1), sourceId: tower.id, ttl: 28, charges: 1, poisonDps: 6, poisonDuration: 4, radius: 0.7 });
  g.status = 'wave';
  g.update(0.05);
  assert.equal(e.poison.dps, 6);
  assert.equal(e.hp, 13);
  run(g, 1);
  assert.ok(e.hp < 8 && e.hp > 6);
  run(g, 2);
  assert.equal(tower.kills, 1);
  assert.equal(g.kills, 1);
  assert.equal(g.traps.some(t => t.id === 999), false);
});

test('on-kill blasts cause attributable chain reactions, never double-counting kills', () => {
  const g = new Game();
  const tower = g.placeTower('boom', -4, 0);
  const e1 = setEnemy(g, 'bone', 1);
  setEnemy(g, 'bone', 2);
  setEnemy(g, 'bone', 3);
  const far = setEnemy(g, 'bone', 10);
  const gold = g.gold;
  g._damage(e1, 13, tower.id);
  assert.equal(tower.kills, 3);
  assert.equal(g.gold - gold, 18);
  assert.equal(g.points, 3);
  assert.equal(far.hp, 13);
  g._damage(e1, 13, tower.id);
  assert.equal(tower.kills, 3);
});

test('Poppy slows only on impact, halves movement for two seconds, then restores full speed', () => {
  const g = openGame();
  const tower = g.placeTower('stun', -10, 1.5);
  const enemy = setEnemy(g, 'gold', 2);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(enemy.slowRemaining, 0, 'the slow waits for the bubble to arrive');
  assert.equal(enemy.slowMultiplier, 1);
  assert.ok(Math.abs(enemy.progress - 2 - enemy.speed * 0.05) < 1e-9);
  assert.equal(g.projectiles[0].slowDuration, 2);
  assert.equal(g.projectiles[0].slowMultiplier, 0.5);
  tower.cooldown = 99;
  for (let i = 0; i < 40 && enemy.slowRemaining === 0; i++) g.update(0.05);
  assert.ok(enemy.slowRemaining > 1.9 && enemy.slowRemaining <= 2);
  assert.equal(enemy.slowMultiplier, 0.5);
  const slowedStart = enemy.progress;
  run(g, 1);
  assert.ok(Math.abs(enemy.progress - slowedStart - enemy.speed * 0.5) < 1e-9);
  const remaining = enemy.slowRemaining;
  const beforeExpiry = enemy.progress;
  g.update(remaining + 0.25);
  assert.ok(Math.abs(enemy.progress - beforeExpiry - enemy.speed * (remaining * 0.5 + 0.25)) < 1e-9);
  assert.equal(enemy.slowRemaining, 0);
  assert.equal(enemy.slowMultiplier, 1);
  const normalStart = enemy.progress;
  run(g, 0.5);
  assert.ok(Math.abs(enemy.progress - normalStart - enemy.speed * 0.5) < 1e-9);
  g.points = 100;
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.getStats(tower).slowDuration, 2.8);
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.getStats(tower).slowDuration, 3.6);
  assert.ok(g.upgradeTower(tower.id, 0));
  assert.equal(g.getStats(tower).slowDuration, 4.4);
  assert.equal(g.getStats(tower).slowMultiplier, 0.5);
});

test('repeated bubble impacts refresh duration without adding time or stacking slow strength', () => {
  const g = openGame();
  const tower = g.placeTower('stun', -10, 1.5);
  const enemy = setEnemy(g, 'gold', 2);
  const stats = g.getStats(tower);
  enemy.slowRemaining = 0.25;
  enemy.slowMultiplier = 0.5;
  for (let i = 0; i < 4; i++) g._launch(tower, enemy, stats);
  g._advanceProjectiles(2);
  assert.equal(enemy.slowRemaining, 2, 'four simultaneous impacts refresh to two seconds');
  assert.equal(enemy.slowMultiplier, 0.5);
  enemy.slowRemaining = 3.5;
  g._launch(tower, enemy, stats);
  g._advanceProjectiles(2);
  assert.equal(enemy.slowRemaining, 3.5, 'a weaker bubble cannot shorten an existing upgraded slow');
  assert.equal(enemy.slowMultiplier, 0.5);
});

test('multiple fully upgraded rapid Poppies cannot stop or compound the slow on skeletons or bosses', () => {
  for (const type of ['gold', 'boss']) {
    const g = openGame();
    const towers = [g.placeTower('stun', -10, 1.5), g.placeTower('stun', -8.5, 1.5)];
    g.points = 1000;
    for (const tower of towers) {
      for (const path of [0, 1]) for (let tier = 0; tier < 3; tier++) assert.ok(g.upgradeTower(tower.id, path));
    }
    const enemy = setEnemy(g, type, 2);
    g.status = 'wave';
    let slowTicks = 0;
    for (let tick = 0; tick < 160; tick++) {
      const before = enemy.progress;
      g.update(0.05);
      assert.ok(enemy.hp > 0);
      assert.ok(enemy.progress - before >= enemy.speed * 0.025 - 1e-9, `${type} keeps moving at at least half speed`);
      assert.ok(enemy.slowRemaining <= 4.4);
      assert.ok(enemy.slowMultiplier >= 0.5);
      if (enemy.slowRemaining > 0) slowTicks++;
    }
    assert.ok(slowTicks > 140, 'rapid bubbles maintain the slow');
    assert.ok(towers.every(tower => tower.damageDone > 12), 'both Poppies landed repeated hits');
  }
});

test('unlocks require boss kills or wave 15 completion and persist between games', () => {
  const profile = { unlocks: [] };
  const g = new Game('meadow', profile);
  g.wave = 10;
  const boss = setEnemy(g, 'boss', 0);
  assert.equal(g.isUnlocked('stun'), false);
  g._damage(boss, boss.hp, 0);
  assert.equal(g.isUnlocked('stun'), true);
  g.enemies = [];
  g.wave = 15;
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.isUnlocked('multi'), true);
  const king = setEnemy(g, 'king', 0);
  g._damage(king, king.hp, 0);
  assert.equal(new Game('quarry', profile).isUnlocked('sniper'), true);
  assert.deepEqual(profile.unlocks, ['stun', 'multi', 'sniper']);
});

test('leaked bosses do not unlock their corresponding characters', () => {
  const g = new Game();
  g.wave = 10;
  g.status = 'wave';
  const boss = setEnemy(g, 'boss', g.pathLength - 0.001);
  g.update(0.05);
  assert.equal(g.lives, 70);
  assert.equal(g.isUnlocked('stun'), false);
  assert.equal(g.kills, 0);
  assert.equal(boss.hp, 0);
});

test('multi attacks several targets; sniper attacks at full-map range', () => {
  const g = openGame();
  const multi = g.placeTower('multi', -10, 1.5);
  const sniper = g.placeTower('sniper', 10, 6);
  const e1 = setEnemy(g, 'gold', 1);
  const e2 = setEnemy(g, 'gold', 2);
  const e3 = setEnemy(g, 'gold', 3);
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.projectiles.length, 4);
  assert.equal(e1.hp, 205, 'launching a projectile does not deal instant damage');
  multi.cooldown = sniper.cooldown = 99;
  run(g, 1.8);
  assert.equal(e1.hp, 197);
  assert.equal(e2.hp, 197);
  assert.equal(e3.hp, 192);
  assert.equal(multi.damageDone, 24);
  assert.equal(sniper.damageDone, 5);
  g.points = 200;
  g.upgradeTower(multi.id, 0);
  assert.ok(g.getStats(multi).damage > 8);
  assert.ok(g.getStats(multi).interval < 1.3);
});

test('projectiles travel before impact and disappearing targets cannot award duplicate kills', () => {
  const g = new Game();
  const tower = g.placeTower('sprout', -10, 1.5);
  const enemy = setEnemy(g, 'bone', 2);
  enemy.speed = 0;
  g.status = 'wave';
  g.update(0.05);
  const shot = g.projectiles[0];
  assert.equal(shot.targetId, enemy.id);
  assert.equal(enemy.hp, 13);
  tower.cooldown = 99;
  g.update(shot.maxTtl / 2);
  assert.equal(enemy.hp, 13);
  g.update(shot.maxTtl / 2 + 0.01);
  assert.equal(enemy.hp, 8);
  assert.equal(tower.damageDone, 5);
  assert.equal(g.projectiles.length, 0);

  tower.cooldown = 0;
  g.update(0.05);
  assert.equal(g.projectiles.length, 1);
  g._damage(enemy, 8, tower.id);
  run(g, 1);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.kills, 1);
});

test('Bramble projectile impacts trigger credited chain explosions', () => {
  const g = new Game();
  const tower = g.placeTower('boom', -10, 1.5);
  const first = setEnemy(g, 'bone', 2);
  const second = setEnemy(g, 'bone', 3);
  first.speed = second.speed = 0;
  g.status = 'wave';
  g.update(0.05);
  assert.equal(g.kills, 0);
  run(g, 0.5);
  assert.equal(g.kills, 2);
  assert.equal(tower.kills, 2);
});

test('loss halts combat and final-wave completion produces a victory', () => {
  const g = new Game();
  g.status = 'wave';
  g.lives = 1;
  setEnemy(g, 'bone', g.pathLength - 0.001);
  g.update(0.05);
  assert.equal(g.status, 'lost');
  assert.equal(g.startWave(), false);
  assert.equal(g.canPlace('sprout', 0, 0), false);
  const win = new Game();
  win.wave = 20;
  win.status = 'wave';
  win.update(0.05);
  assert.equal(win.status, 'won');
  assert.ok(win.events.some(e => e.type === 'victory'));
});

test('simulation is deterministic and a starter defense can clear wave one', () => {
  const play = () => {
    const g = new Game();
    for (const [x,z] of [[-9,1],[-5,0],[-3,-2],[-3,2],[1,0],[3,0]]) g.placeTower('sprout',x,z);
    g.startWave();
    run(g, 60);
    return g;
  };
  const a = play(), b = play();
  assert.equal(a.status, 'planning');
  assert.equal(a.lives, 100);
  assert.equal(a.kills, 11);
  assert.deepEqual([a.gold, a.points, a.kills, a.towers.map(t => t.kills)], [b.gold, b.points, b.kills, b.towers.map(t => t.kills)]);
});

test('a budget-respecting mixed defense can complete the campaign on all five maps', () => {
  for (const map of MAPS) {
    const g = new Game(map.id);
    const place = (type) => {
      let best = null;
      for (let x = -10; x <= 10; x += 1.5) {
        for (let z = -6.5; z <= 6.5; z += 1.5) {
          if (!g.canPlace(type, x, z)) continue;
          let coverage = 0;
          for (let progress = 0; progress < g.pathLength; progress += 0.4) {
            const p = g.pointAt(progress);
            if (Math.hypot(p.x - x, p.z - z) < 3.5) coverage++;
          }
          if (!best || coverage > best.coverage) best = { x, z, coverage };
        }
      }
      return best && g.placeTower(type, best.x, best.z);
    };
    for (const type of ['boom', 'spore', 'sprout', 'sprout']) assert.ok(place(type));
    for (let wave = 1; wave <= 20; wave++) {
      if (wave > 1) {
        while (g.gold >= 210 && g.towers.length < 12) {
          if (!place(g.towers.length % 3 === 0 ? 'spore' : 'boom')) break;
        }
        for (let level = 0; level < 3; level++) {
          for (const tower of g.towers) {
            for (const path of [0, 1]) {
              if (tower.levels[path] === level) g.upgradeTower(tower.id, path);
            }
          }
        }
      }
      assert.ok(g.startWave());
      for (let tick = 0; tick < 12000 && g.status === 'wave'; tick++) g.update(0.05);
      assert.notEqual(g.status, 'wave', `${map.id} wave ${wave} must finish`);
      assert.notEqual(g.status, 'lost', `${map.id} should be winnable`);
      assert.ok(g.gold >= 0 && g.points >= 0);
    }
    assert.equal(g.status, 'won');
    assert.deepEqual(g.profile.unlocks, ['stun', 'multi', 'sniper']);
  }
});

test('target modes choose first, last, strongest, or closest enemies within attack range', () => {
  for (const [mode, expectedIndex] of [['first', 3], ['last', 0], ['strong', 1], ['close', 2]]) {
    const g = new Game();
    const tower = g.placeTower('sprout', -10, 1.5);
    assert.equal(tower.targeting, 'first');
    const enemies = [['bone', 0.5], ['gold', 1], ['blue', 2], ['green', 3]].map(([type, progress]) => setEnemy(g, type, progress));
    // Strong uses the enemy's health class, even after it has already taken damage.
    enemies[1].hp = 1;
    setEnemy(g, 'king', 30); // Out of range must not attract Strong or First.
    assert.equal(g.setTargeting(tower.id, mode), true);
    g.status = 'wave';
    g.update(0.05);
    assert.equal(g.projectiles.length, 1);
    assert.equal(g.projectiles[0].targetId, enemies[expectedIndex].id, mode);
  }
});

test('Strong and Close break equal priorities by choosing the furthest along the path', () => {
  for (const mode of ['strong', 'close']) {
    const g = new Game();
    const tower = g.placeTower('sprout', -10, 1.5);
    setEnemy(g, 'green', 1);
    const front = setEnemy(g, 'green', 3);
    g.setTargeting(tower.id, mode);
    g.status = 'wave';
    g.update(0.05);
    assert.equal(g.projectiles[0].targetId, front.id, mode);
  }
});

test('targeting changes reject unknown modes, missing gnomes, mushrooms, and finished games', () => {
  const g = new Game();
  const tower = g.placeTower('sprout', -10, 1.5);
  const mushroom = g.placeTower('spore', -4, 0);
  assert.equal(g.setTargeting(tower.id, 'last'), true);
  assert.equal(g.setTargeting(tower.id, 'random'), false);
  assert.equal(g.setTargeting(tower.id, null), false);
  assert.equal(g.setTargeting(9999, 'first'), false);
  assert.equal(g.setTargeting(mushroom.id, 'strong'), false);
  assert.equal(tower.targeting, 'last');
  g.status = 'wave';
  assert.equal(g.setTargeting(tower.id, 'close'), true);
  for (const status of ['won', 'lost']) {
    g.status = status;
    assert.equal(g.setTargeting(tower.id, 'first'), false);
    assert.equal(tower.targeting, 'close');
  }
});

test('multi-attacks follow target priority and select distinct targets', () => {
  for (const [mode, order] of [['first', [3, 2, 1]], ['last', [0, 1, 2]], ['strong', [1, 2, 3]], ['close', [2, 3, 1]]]) {
    const g = openGame();
    const tower = g.placeTower('multi', -10, 1.5);
    const enemies = [['bone', 0.5], ['gold', 1], ['blue', 2], ['green', 3]].map(([type, progress]) => setEnemy(g, type, progress));
    g.setTargeting(tower.id, mode);
    g.status = 'wave';
    g.update(0.05);
    assert.deepEqual(g.projectiles.map(shot => shot.targetId), order.map(index => enemies[index].id), mode);
  }
});
