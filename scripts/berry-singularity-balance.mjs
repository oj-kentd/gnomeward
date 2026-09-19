import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Game } from '../src/game.js';
import { nextSpot } from './combos-balance.mjs';

// This is a development balance fixture. Only collection unlocks are preset;
// every purchase and upgrade uses the normal starting wallet and earned rewards.
function buildDefense(game, { cap, orbitCap, secondaryPaths, berriesPerOrbit, orbitPath, berryPath }) {
  while (game.towers.length < cap) {
    const orbits = game.towers.filter(tower => tower.type === 'gravity').length;
    const berries = game.towers.filter(tower => tower.type === 'strawberry').length;
    const type = berries === 0 ? 'strawberry' : orbits < orbitCap && berries >= 1 + orbits * berriesPerOrbit ? 'gravity' : 'strawberry';
    const spot = nextSpot(game, type);
    if (!spot || !game.placeTower(type, spot.x, spot.z)) break;
  }
  // Focus one guardian at a time, alternating its two legal upgrade paths.
  for (const tower of game.towers) {
    const paths = [tower.type === 'gravity' ? 0 : 1];
    if (secondaryPaths) paths.push(tower.type === 'gravity' ? orbitPath : berryPath);
    for (let tier = 1; tier <= 3; tier++) for (const path of paths) {
      if (tower.levels[path] < tier && !game.upgradeTower(tower.id, path)) return;
    }
  }
}

export function playBerrySingularity({ maxWave = 75, map = 'meadow', step = .05, cap = 18, orbitCap = 9, secondaryPaths = true, berriesPerOrbit = 1, orbitPath = 3, berryPath = 2, roundLimit = 180 } = {}) {
  assert.ok(step > 0 && step <= .1, 'A legal fixed simulation step is required');
  const game = new Game(map, { unlocks: ['gravity', 'strawberry'] });
  const rounds = [];
  let reactions = 0, lastEffect = 0, stalled = null;
  while (game.status !== 'lost' && game.completedWaves < maxWave) {
    if (game.status === 'won') assert.equal(game.continueEndless(), true);
    buildDefense(game, { cap, orbitCap, secondaryPaths, berriesPerOrbit, orbitPath, berryPath });
    assert.equal(game.startWave(), true);
    const start = game.time, priorReactions = reactions;
    while (game.status === 'wave' && game.time - start < roundLimit) {
      game.update(step);
      for (const effect of game.effects) if (effect.id > lastEffect && effect.type === 'berry-singularity') reactions++;
      for (const effect of game.effects) lastEffect = Math.max(lastEffect, effect.id);
    }
    rounds.push({ wave: game.wave, cleared: game.completedWaves, lives: game.lives, gold: game.gold, points: game.points,
      seconds: +(game.time - start).toFixed(2), reactions: reactions - priorReactions });
    if (game.status === 'wave') {
      stalled = { wave: game.wave, enemies: game.enemies.map(enemy => ({ type: enemy.type, hp: Math.round(enemy.hp), progress: +enemy.progress.toFixed(2), capturedBy: enemy.capturedBy })) };
      break;
    }
  }
  return { game, result: { name: 'berry-singularity', map, step, cap, orbitCap, secondaryPaths, berriesPerOrbit, orbitPath, berryPath, cleared: game.completedWaves,
    failed: game.status === 'lost' ? game.wave : null, stalled, lives: game.lives, reactions,
    longestRound: Math.max(...rounds.map(round => round.seconds)), discovered: game.comboDiscoveries,
    towers: game.towers.map(tower => ({ type: tower.type, x: tower.x, z: tower.z, levels: tower.levels, kills: tower.kills })), rounds } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const results = [];
  await mkdir('playtest-results', { recursive: true });
  for (const map of (process.env.MAPS || 'meadow').split(',')) {
    const { result } = playBerrySingularity({ map, maxWave: Number(process.env.MAX_WAVE || 75), step: Number(process.env.STEP || .05),
      cap: Number(process.env.CAP || 18), orbitCap: Number(process.env.ORBIT_CAP || 9), secondaryPaths: process.env.SECONDARY_PATHS !== 'false' });
    results.push(result);
    await writeFile(process.env.RESULT_FILE || 'playtest-results/berry-singularity-balance.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ map, cleared: result.cleared, lives: result.lives, reactions: result.reactions, longestRound: result.longestRound, stalled: result.stalled?.wave ?? null }));
    assert.equal(result.stalled, null, 'Rounds must not be trapped for three minutes');
    assert.ok(result.reactions > 0 && result.discovered.includes('berry-singularity'), 'The real combination must trigger during the earned run');
    if (map === 'meadow') assert.ok(result.cleared >= Number(process.env.MAX_WAVE || 75), 'Meadow must reach the requested late-game round with earned resources');
  }
}
