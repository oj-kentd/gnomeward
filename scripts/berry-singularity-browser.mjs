import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';
import { playBerrySingularity } from './berry-singularity-balance.mjs';
import { Match } from '../server/match.js';
import { applyCoopSnapshot } from '../src/multiplayer.js';
import { BERRY_SINGULARITY } from '../src/combos.js';

// Balance fixture earns every coin and tier. Preset collection unlocks model a
// returning solo player; fixture injection is not a progression or network test.
const { game, result } = playBerrySingularity({ maxWave: 70 });
assert.equal(result.cleared, 70, 'the visual fixture must earn its late-game army');
assert.equal(game.startWave(), true);
const frames = {};
for (let step = 0; step < 1800 && game.status === 'wave'; step++) {
  game.update(.05);
  for (const phase of ['orbit', 'flight']) {
    if (frames[phase]) continue;
    const seeds = game.projectiles.filter(seed => seed.gravityCharged && (phase === 'orbit'
      ? seed.orbitRemaining > .12 && seed.orbitRemaining < .35
      : seed.orbitRemaining <= 0 && seed.ttl > .15 && seed.ttl < .5));
    if (seeds.length && game.effects.some(effect => effect.type === 'berry-singularity')) {
      frames[phase] = JSON.parse(JSON.stringify(game));
      frames[phase].events = [];
    }
  }
  if (frames.orbit && frames.flight) break;
}
assert.ok(frames.orbit && frames.flight, 'real round 71 combat must expose both charged seed phases');
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], combat = {};
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'loading';
const progress = setInterval(() => console.log('Berry browser check:', stage), 15000); progress.unref();
async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(220);
}
async function hiddenRecipes(scope) {
  assert.equal(await page.locator('.combo-guide, .combo-note, [data-combo]').count(), 0);
  assert.doesNotMatch(await scope.innerText(), /berry singularity|berry-singularity|pair.*Orbit|pair.*Strawberry/i);
}
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  for (const phase of ['orbit', 'flight']) {
    stage = `earned round 71 ${phase} rendering`;
    await page.evaluate(fixture => {
      const { game, state, renderer } = gnomeward;
      Object.assign(game, fixture);
      Object.assign(state, { paused: true, autoStart: false, multiplayer: null, selectedTowerId: null, placingType: null });
      renderer.setMap(game.map, 0);
    }, frames[phase]);
    await settled();
    combat[phase] = await page.evaluate(phase => {
      const { game, renderer } = gnomeward;
      const candidates = game.projectiles.filter(seed => seed.gravityCharged && (phase === 'orbit' ? seed.orbitRemaining > .12 && seed.orbitRemaining < .35 : seed.orbitRemaining <= 0 && seed.ttl > .15 && seed.ttl < .5));
      const seeds = candidates.filter(seed => renderer.fx.has(seed.id)).map(seed => {
        const model = renderer.fx.get(seed.id), colors = [], ringNodes = new Set();
        const ring = model.getObjectByName('berry-singularity-seed-ring');
        ring?.traverse(child => ringNodes.add(child));
        model.traverse(child => { if (child.isMesh && !ringNodes.has(child)) for (const material of Array.isArray(child.material) ? child.material : [child.material]) colors.push(material.color.getHexString()); });
        return { id: seed.id, position: model.position.toArray(), center: [seed.ox, seed.oz], colors,
          modeled: !!model.getObjectByName('strawberry-seed'), outlined: !!ring, orbitRemaining: seed.orbitRemaining, ttl: seed.ttl };
      });
      const bursts = game.effects.filter(effect => effect.type === 'berry-singularity' && renderer.fx.has(effect.id)).map(effect => {
        const model = renderer.fx.get(effect.id), materials = [];
        model.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.push({ color: material.color.getHexString(), transparent: material.transparent, depthWrite: material.depthWrite }); });
        return { arcs: !!model.getObjectByName('berry-singularity-arcs'), stars: !!model.getObjectByName('berry-singularity-stars'), materials };
      });
      return { wave: game.wave, cleared: game.completedWaves, seeds, bursts, assets: ['berry-singularity-arcs', 'berry-singularity-stars', 'berry-singularity-seed-ring', 'strawberry-seed'].every(key => !!renderer.models[key]) };
    }, phase);
    const observed = combat[phase];
    assert.equal(observed.wave, 71); assert.equal(observed.cleared, 70); assert.equal(observed.assets, true);
    assert.ok(observed.seeds.length > 0 && observed.bursts.length > 0);
    for (const seed of observed.seeds) {
      assert.equal(seed.modeled, true); assert.equal(seed.outlined, true);
      assert.ok(seed.colors.length && seed.colors.every(color => color === '111111'), 'charged seeds remain black');
      assert.ok(seed.position.every(Number.isFinite));
      const radius = Math.hypot(seed.position[0] - seed.center[0], seed.position[2] - seed.center[1]);
      if (phase === 'orbit') assert.ok(radius > .1 && radius <= BERRY_SINGULARITY.orbitRadius + .01);
      else assert.ok(radius > BERRY_SINGULARITY.orbitRadius, 'released seeds visibly fly beyond the orbit');
    }
    for (const burst of observed.bursts) {
      assert.ok(burst.arcs && burst.stars);
      assert.ok(burst.materials.every(material => material.transparent && !material.depthWrite), 'open translucent ribbons keep the path visible');
    }
    await page.screenshot({ path: `playtest-results/berry-singularity-${phase}-round71.png` });
  }
  stage = 'hidden recipes on desktop and phone';
  for (const type of ['gravity', 'strawberry']) {
    await page.evaluate(type => { gnomeward.state.selectedTowerId = gnomeward.game.towers.find(tower => tower.type === type).id; }, type);
    await page.waitForFunction(() => document.querySelector('.upgrade-heading'));
    await settled();
    await hiddenRecipes(page.locator('#selection-panel'));
    if (type === 'strawberry') {
      await page.setViewportSize({ width: 390, height: 844 }); await settled();
      await hiddenRecipes(page.locator('#selection-panel'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: 'playtest-results/berry-singularity-phone-upgrades.png' });
    }
    await page.locator('[data-close-upgrades]').click();
  }
  await page.locator('#help-button').click();
  await hiddenRecipes(page.locator('#game-dialog'));
  await page.locator('[aria-label="Close field guide"]').click();
  await page.setViewportSize({ width: 1280, height: 800 });

  stage = 'server snapshots and buffered cross-owner charged seeds';
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'Orbit gardener'); match.addPlayer('two', 'Berry gardener');
  Object.assign(match.board(), frames.orbit);
  for (const tower of match.board().towers) tower.ownerId = tower.type === 'gravity' ? 'one' : 'two';
  match.started = true;
  // Transport-only fixture: owners and wallets accompany an already earned
  // board. Match progression/authority is exercised by separate server tests.
  for (const player of match.players.values()) { player.gold = frames.orbit.gold / 2; player.points = frames.orbit.points / 2; }
  let adapterGame;
  for (let i = 0; i < 6; i++) {
    if (i) { match.board().update(.05); match.tick++; }
    const adapted = applyCoopSnapshot(adapterGame, match.snapshot('berry-fixture'), 'one');
    adapterGame = adapted.game;
    await page.evaluate(({ game, multiplayer }) => {
      Object.assign(gnomeward.game, game);
      multiplayer.snapshotReceivedAt = performance.now() / 1000;
      Object.assign(gnomeward.state, { multiplayer, paused: false, selectedTowerId: null });
      gnomeward.renderer.motion.capture(gnomeward.game, multiplayer);
    }, JSON.parse(JSON.stringify({ game: adapted.game, multiplayer: adapted.multiplayer })));
    await page.waitForTimeout(50);
  }
  await settled();
  const coop = await page.evaluate(() => {
    const { game, renderer } = gnomeward;
    const samples = renderer.motion.frames;
    const records = samples.flatMap(frame => frame.projectiles).filter(seed => seed.gravityCharged);
    return { frames: samples.length, preserved: records.length > 0 && records.every(seed => Number.isFinite(seed.orbitDuration) && Number.isFinite(seed.orbitRemaining) && Number.isFinite(seed.flightDuration) && Array.isArray(seed.hitIds)),
      rendered: [...new Set(records.map(seed => seed.id))].filter(id => renderer.fx.get(id)?.getObjectByName('strawberry-seed')).length,
      owners: [...new Set(game.towers.map(tower => tower.ownerId))] };
  });
  assert.ok(coop.frames > 1 && coop.preserved && coop.rendered > 0);
  assert.deepEqual(coop.owners.sort(), ['one', 'two']);
  await page.screenshot({ path: 'playtest-results/berry-singularity-coop.png' });

  stage = 'synthetic rendering budgets and cleanup';
  await page.evaluate(() => {
    const { game, state } = gnomeward;
    state.multiplayer = null; state.paused = true;
    const template = game.projectiles.find(seed => seed.gravityCharged);
    if (!template) throw new Error('charged seed fixture expired too early');
    game.projectiles = Array.from({ length: 128 }, (_, index) => ({ ...template, id: `budget-seed-${index}`, hitIds: [], ttl: .8, orbitRemaining: .15 }));
    game.effects = Array.from({ length: 100 }, (_, index) => ({ id: `budget-burst-${index}`, type: 'berry-singularity', x: index % 20 - 10, z: Math.floor(index / 20) - 2, radius: 4, ttl: .8, maxTtl: 1.1 }));
  });
  await settled();
  const budget = await page.evaluate(() => ({ displayed: gnomeward.renderer.fx.size, authoritative: gnomeward.game.projectiles.length + gnomeward.game.effects.length }));
  assert.deepEqual(budget, { displayed: 76, authoritative: 228 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await settled();
  assert.equal(await page.evaluate(() => gnomeward.renderer.fx.size), 70);
  await page.evaluate(() => { gnomeward.game.effects = []; gnomeward.game.projectiles = []; }); await settled();
  assert.equal(await page.evaluate(() => gnomeward.renderer.fx.size), 0);
  assert.deepEqual(errors, []);
  const summary = { ok: true, earned: { cleared: result.cleared, lives: result.lives, cap: result.cap }, combat, coop, budget, errors };
  await writeFile('playtest-results/berry-singularity-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: true, earned: summary.earned, phases: Object.keys(combat), coop, budget, errors }, null, 2));
} catch (error) {
  console.error('Berry browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/berry-singularity-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
