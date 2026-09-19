import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Game } from '../src/game.js';

export const COMBO_BUILDS = {
  sporefire: [['spore', [3]], ['boom', [1]]],
  prismstorm: [['multi', [0]], ['crystal', [1]]],
};
const placements = new Map();
export function nextSpot(game, type) {
  const key = `${game.map.id}:${type}`;
  if (!placements.has(key)) {
    const range = game.getStats({ type, levels: [], kills: 0 }).range;
    const trail = game.routes.flatMap((route, routeIndex) => Array.from({ length: Math.ceil(route.length) }, (_, p) => ({ ...game.pointAt(p, routeIndex), fraction: p / route.length })));
    const candidates = [];
    for (let x = -11; x <= 11; x += .75) for (let z = -6.75; z <= 6.75; z += .75) {
      if (game.pathDistance(x, z) < 1.35) continue;
      const score = trail.reduce((sum, p) => sum + (Math.hypot(x - p.x, z - p.z) <= range ? 1.2 - p.fraction * .35 : 0), 0);
      candidates.push({ x, z, score });
    }
    placements.set(key, candidates.sort((a, b) => b.score - a.score));
  }
  return placements.get(key).find(p => game.canPlace(type, p.x, p.z));
}

export function buyForCombo(game, name, cap = 18) {
  const build = COMBO_BUILDS[name];
  while (game.towers.length < cap) {
    const [type] = build[game.towers.filter(t => !t.starting && build.some(([type]) => t.type === type)).length % build.length];
    const spot = nextSpot(game, type);
    if (!spot || !game.placeTower(type, spot.x, spot.z)) break;
  }
  for (const tower of game.towers) {
    if (tower.type === 'sprout' && name === 'prismstorm') continue;
    const paths = build.find(([type]) => type === tower.type)?.[1] || [0, 2];
    for (let tier = 1; tier <= 3; tier++) for (const path of paths) {
      if (tower.levels[path] < tier && !game.upgradeTower(tower.id, path)) return;
    }
  }
}

export function playCombo(name, { map = 'meadow', maxWave = 75, cap = 18, step = .05, combos = true } = {}) {
  assert.ok(COMBO_BUILDS[name], 'known combo');
  // Only collection unlocks are preset. All currency and upgrades are earned.
  const game = new Game(map, { unlocks: name === 'prismstorm' ? ['multi', 'crystal'] : [] });
  // Hollow's outer bend is far from its high-coverage inner spiral. A cheap
  // guard prevents early Prism walls marooning weak enemies outside gun range.
  if (name === 'prismstorm' && map === 'hollow') assert.ok(game.placeTower('sprout', -7.5, -4.5));
  if (!combos) { game._igniteSpores = () => false; game.prismPartner = () => null; }
  const rounds = [];
  while (game.status !== 'lost' && game.completedWaves < maxWave) {
    if (game.status === 'won') game.continueEndless();
    buyForCombo(game, name, cap);
    assert.equal(game.startWave(), true);
    const start = game.time;
    while (game.status === 'wave' && game.time - start < 180) game.update(step);
    assert.notEqual(game.status, 'wave', `${name} ${map} round ${game.wave} should not trap a round for three minutes: ${JSON.stringify(game.enemies.map(e => ({ type: e.type, hp: Math.round(e.hp), progress: +e.progress.toFixed(2) })))}`);
    rounds.push({ wave: game.wave, cleared: game.completedWaves, lives: game.lives, gold: game.gold, points: game.points, seconds: +(game.time - start).toFixed(2) });
  }
  return { game, result: { name, map, cap, step, combos, cleared: game.completedWaves, failed: game.status === 'lost' ? game.wave : null,
    lives: game.lives, longestRound: Math.max(...rounds.map(r => r.seconds)), discovered: game.comboDiscoveries,
    towers: game.towers.map(t => ({ type: t.type, x: t.x, z: t.z, levels: t.levels, kills: t.kills })), rounds } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await mkdir('playtest-results', { recursive: true });
  const results = [];
  const maps = (process.env.MAPS || 'meadow').split(',');
  const steps = (process.env.STEPS || '.05').split(',').map(Number);
  for (const map of maps) for (const step of steps) for (const name of Object.keys(COMBO_BUILDS)) {
    const { result } = playCombo(name, { map, step, maxWave: Number(process.env.MAX_WAVE || 75) });
    results.push(result);
    await writeFile(process.env.RESULT_FILE || 'playtest-results/combos-balance.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ name, map, step, cleared: result.cleared, lives: result.lives, longestRound: result.longestRound }));
    if (map === 'meadow') assert.ok(result.cleared >= 70, `${name} must reach round 70 with normal earnings`);
  }
  for (const name of Object.keys(COMBO_BUILDS)) {
    const { result } = playCombo(name, { combos: false });
    results.push(result);
    console.log(JSON.stringify({ name, control: true, cleared: result.cleared }));
    assert.ok(result.cleared < 70, 'the deliberate synergy must make a measurable difference');
  }
  await writeFile(process.env.RESULT_FILE || 'playtest-results/combos-balance.json', JSON.stringify(results, null, 2));
}
