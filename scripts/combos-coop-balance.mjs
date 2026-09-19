import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Match } from '../server/match.js';
import { TOWERS, SECRETS } from '../src/data.js';
import { COMBO_BUILDS, nextSpot } from './combos-balance.mjs';

// No save imports, granted currency, artificial unlocks, or tower/stat mutations.
// Both wallets start at the server defaults and spend only through Match.command.
export function playCoopCombo(name, { maxWave = 75, cap = 18 } = {}) {
  assert.ok(COMBO_BUILDS[name]);
  const match = new Match({ mode: 'coop', mapId: name === 'prismstorm' ? 'quarry' : 'meadow' });
  match.addPlayer('host', 'First gardener');
  match.addPlayer('guest', 'Second gardener');
  const game = match.board();
  assert.deepEqual(game.profile.unlocks, [], 'start with no imported collection unlocks');
  for (const player of match.players.values()) {
    assert.equal(player.gold, 325);
    assert.equal(player.points, 0);
  }
  const commands = { place: 0, upgrade: 0, discover: 0, ready: 0, endless: 0 };
  const command = (owner, message) => { match.command(owner, message); commands[message.action]++; };
  const place = (owner, type) => {
    if (game.towers.length >= cap || match.players.get(owner).gold < TOWERS[type].cost) return false;
    const spot = nextSpot(game, type);
    if (!spot) return false;
    command(owner, { action: 'place', type, x: spot.x, z: spot.z });
    return true;
  };
  if (name === 'prismstorm') {
    for (const spot of SECRETS.quarry.spots) command('guest', { action: 'discover', id: spot.id });
    assert.ok(game.towers.some(tower => tower.type === 'crystal' && tower.ownerId === 'guest' && tower.purchaseCost === 0));
    place('host', 'sprout');
    place('guest', 'boom');
  }
  const rounds = [];
  const unlockedAfterRound = {};
  let comboFirstRound = null;
  for (const type of game.profile.unlocks) unlockedAfterRound[type] = 0;
  while (!match.result && game.completedWaves < maxWave) {
    if (game.status === 'won') {
      command('host', { action: 'endless' });
      assert.equal(game.status, 'won', 'both players must consent');
      command('guest', { action: 'endless' });
    }
    // Fund one growth Sprout for the bootstrap, then invest the host's points
    // in Tumble immediately after its earned unlock; do not dilute the budget
    // across spare starters before a complete cross-player pair is online.
    const beforeTumble = name === 'prismstorm' && !game.isUnlocked('multi');
    for (const [owner, index] of [['host', 0], ['guest', 1]]) {
      const type = beforeTumble ? (owner === 'host' ? 'sprout' : 'boom') : COMBO_BUILDS[name][index][0];
      const ownerCap = beforeTumble ? (owner === 'host' ? 1 : 2) : Math.ceil(cap / 2);
      while (game.towers.filter(tower => tower.ownerId === owner).length < ownerCap && place(owner, type)) {}
      const owned = game.towers.filter(tower => tower.ownerId === owner).sort((a, b) => Number(b.type === type) - Number(a.type === type));
      for (const tower of owned) {
        const paths = tower.type === 'sprout' ? [3, 1] : name === 'prismstorm' && tower.type === 'boom' ? [0, 1] : COMBO_BUILDS[name].find(([type]) => tower.type === type)?.[1];
        if (!paths) continue;
        let affordable = true;
        // Optional fire/planting speed supports dense endless waves, but it
        // is bought only after this gnome's single combo path reaches tier 3.
        const stages = name === 'sporefire' ? [paths, [2]] : [paths];
        for (const stage of stages) {
          if (!affordable) break;
          for (let tier = 1; tier <= 3 && affordable; tier++) for (const path of stage) {
            const level = tower.levels[path];
            if (level >= tier) continue;
            if (match.players.get(owner).points < TOWERS[tower.type].paths[path].costs[level]) { affordable = false; break; }
            if (name === 'sporefire' && path === 2) assert.ok(paths.every(core => tower.levels[core] === 3), 'optional speed follows the completed combo path');
            command(owner, { action: 'upgrade', towerId: tower.id, path });
          }
        }
        if (!affordable) break;
      }
    }
    assert.ok(game.towers.length <= cap);
    for (const owner of ['host', 'guest']) {
      assert.ok(match.players.get(owner).gold >= 0 && match.players.get(owner).points >= 0);
      command(owner, { action: 'ready' });
      if (owner === 'host') assert.equal(game.status, 'planning', 'one player cannot start alone');
    }
    assert.equal(game.status, 'wave');
    const started = game.time;
    while (game.status === 'wave' && game.time - started < 180) match.step(.05);
    assert.notEqual(game.status, 'wave', `${name} must not trap a round for three minutes`);
    for (const type of game.profile.unlocks) unlockedAfterRound[type] ??= game.completedWaves;
    if (game.comboDiscoveries.includes(name)) comboFirstRound ??= game.wave;
    rounds.push({ wave: game.wave, cleared: game.completedWaves, lives: game.lives, seconds: +(game.time - started).toFixed(2),
      wallets: [...match.players.values()].map(({ id, gold, points }) => ({ id, gold, points })) });
  }
  return { name, mode: 'coop', map: game.map.id, cap, step: .05, cleared: game.completedWaves, failed: match.result ? game.wave : null,
    lives: game.lives, longestRound: Math.max(...rounds.map(round => round.seconds)), discovered: game.comboDiscoveries, unlocks: game.profile.unlocks,
    optionalPaths: name === 'sporefire' ? { spore: 'Fast Harvest after Wild Garden 3', boom: 'Quick Fuse after Big Bang 3' } : {},
    commands, unlockedAfterRound, comboFirstRound, towers: game.towers.map(({ type, ownerId, x, z, levels, kills }) => ({ type, ownerId, x, z, levels, kills })), rounds };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const results = [];
  for (const name of (process.env.COMBOS || 'sporefire,prismstorm').split(',')) {
    const result = playCoopCombo(name, { maxWave: Number(process.env.MAX_WAVE || 75), cap: Number(process.env.TOWER_CAP || 18) });
    results.push(result);
    console.log(JSON.stringify({ name, mode: result.mode, map: result.map, cap: result.cap, cleared: result.cleared, lives: result.lives, longestRound: result.longestRound, discovered: result.discovered }));
  }
  await mkdir('playtest-results', { recursive: true });
  await writeFile(process.env.RESULT_FILE || 'playtest-results/combos-coop-balance.json', JSON.stringify(results, null, 2));
  for (const result of results) {
    assert.ok(result.cleared > 70, `${result.name} must survive past round 70 with two real earned wallets`);
    assert.ok(result.discovered.includes(result.name), 'the cross-player combo must actually trigger');
    assert.ok(result.longestRound < 180);
    const [first, second] = COMBO_BUILDS[result.name].map(([type]) => type);
    assert.ok(result.towers.filter(tower => tower.type === first).every(tower => tower.ownerId === 'host'));
    assert.ok(result.towers.filter(tower => tower.type === second).every(tower => tower.ownerId === 'guest'));
    if (result.name === 'prismstorm') {
      assert.equal(result.unlockedAfterRound.multi, 15, 'Tumble is earned by completing round 15');
      assert.equal(result.unlockedAfterRound.crystal, 0, 'Prism is earned through the three quarry discoveries');
      assert.equal(result.commands.discover, 3);
    }
  }
}
