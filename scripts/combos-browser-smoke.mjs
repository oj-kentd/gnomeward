import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';
import { playCombo } from './combos-balance.mjs';
import { Match } from '../server/match.js';
import { applyCoopSnapshot } from '../src/multiplayer.js';

// These full round-70 saves earn every coin and upgrade through Game. Only
// collection unlocks are preset, just as on a returning player's browser.
const fixtures = Object.fromEntries(['sporefire', 'prismstorm'].map(name => {
  const { game, result } = playCombo(name, { maxWave: 70 });
  assert.equal(result.cleared, 70);
  game.events = [];
  return [name, JSON.parse(JSON.stringify(game))];
}));
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], combat = {};
page.on('pageerror', error => errors.push(error.message));
let stage = 'opening the garden';
const progress = setInterval(() => console.log('Combo browser check:', stage), 15000); progress.unref();
async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(220); // HUD refreshes at 150ms; screenshot the new state.
}
async function select(type) {
  await page.evaluate(type => { gnomeward.state.selectedTowerId = gnomeward.game.towers.find(t => t.type === type).id; }, type);
  await page.waitForFunction(type => document.querySelector('.upgrade-heading') && document.querySelector('.selected-heading h3')?.textContent === ({ multi: 'Tumble', crystal: 'Prism', spore: 'Morel', boom: 'Bramble' })[type], type);
  await settled();
}
async function currencyFits() {
  const hud = await page.evaluate(() => {
    const gold = document.getElementById('hud-gold'), points = document.querySelector('.hud-stat.points svg');
    const goldBounds = gold.getBoundingClientRect(), pointBounds = points.getBoundingClientRect();
    return { text: gold.textContent, title: gold.title, value: gnomeward.game.gold,
      expected: new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 }).format(gnomeward.game.gold),
      goldRight: goldBounds.right, pointsLeft: pointBounds.left, fits: goldBounds.right <= pointBounds.left + 1 };
  });
  assert.ok(hud.value >= 100000, 'this earned army exercises a six-digit wallet');
  assert.equal(hud.text, hud.expected);
  assert.equal(Number(hud.title.replace(/[^0-9.]/g, '')), hud.value, 'exact gold remains available in the tooltip');
  assert.equal(hud.fits, true, `gold does not overlap the points icon: ${JSON.stringify(hud)}`);
}

async function assertParticipantMarkers(kind, types) {
  const report = await page.evaluate(kind => {
    const { game, renderer } = gnomeward;
    return { count: renderer.comboMarkers.size, participants: [...renderer.comboMarkers].filter(([, marker]) => marker.userData.comboKind === kind).map(([id, marker]) => {
      const tower = game.towers.find(tower => tower.id === id);
      return { id, type: tower?.type, actualTrigger: tower?.comboActive?.kind === kind, attached: !!marker.parent,
        position: marker.position.toArray(), materials: marker.userData.fadeMaterials?.length || 0 };
    }) };
  }, kind);
  assert.ok(report.count <= 64, 'participant markers remain bounded');
  for (const type of types) assert.ok(report.participants.some(marker => marker.type === type && marker.actualTrigger && marker.attached), `${kind} identifies its ${type} participant after actual combat: ${JSON.stringify(report)}`);
  assert.ok(report.participants.every(marker => marker.materials > 0 && marker.position.every(Number.isFinite)));
  return report;
}

async function markerLifecycle(kind) {
  return page.evaluate(kind => {
    const { game, state, renderer } = gnomeward;
    state.multiplayer = null; state.paused = true;
    for (const tower of game.towers) delete tower.comboActive;
    renderer.setMap(game.map, 0);
    const tower = game.towers[0], base = game.time, received = performance.now() / 1000;
    const metadata = { roomId: 'marker-clock-fixture', sessionId: 'one', connected: true, started: true, paused: false,
      snapshotTick: 0, snapshotSequence: 900001, snapshotReceivedAt: received };
    renderer.motion.capture(game, metadata);
    game.time = base + 1;
    tower.comboActive = { kind, startedAt: base + .95, until: base + 3.95 };
    Object.assign(metadata, { snapshotTick: 20, snapshotSequence: 900002, snapshotReceivedAt: received + 1 });
    renderer.motion.capture(game, metadata);
    renderer.render(game, { ...state, multiplayer: metadata }, received + 1.1);
    const early = renderer.comboMarkers.size;
    renderer.render(game, { ...state, multiplayer: metadata }, received + 1.3);
    const arrived = renderer.comboMarkers.has(tower.id);
    // Repeated real hits refresh the end timestamp. A newer server start must
    // not hide a marker already introduced on the presentation timeline.
    tower.comboActive = { kind, startedAt: base + 1.2, until: base + 4.2 };
    renderer.render(game, { ...state, multiplayer: metadata }, received + 1.31);
    const retained = renderer.comboMarkers.has(tower.id);
    function disposalProbe(marker) {
      const result = { expected: marker?.userData.fadeMaterials?.length || 0, disposed: 0 };
      for (const material of marker?.userData.fadeMaterials || []) material.addEventListener('dispose', () => result.disposed++);
      return result;
    }
    const expiry = disposalProbe(renderer.comboMarkers.get(tower.id));
    game.time = base + 5;
    renderer.render(game, state, received + 2);
    const expired = renderer.comboMarkers.size === 0;
    tower.comboActive = { kind, startedAt: game.time - .1, until: game.time + 3 };
    renderer.render(game, state, received + 2.1);
    const sale = disposalProbe(renderer.comboMarkers.get(tower.id));
    const reducedY = renderer.comboMarkers.get(tower.id)?.position.y;
    game.time += .1; renderer.render(game, state, received + 2.15);
    const reducedMotionStable = renderer.reducedMotion.matches && renderer.comboMarkers.get(tower.id)?.position.y === reducedY;
    const sold = game.sellTower(tower.id);
    renderer.render(game, state, received + 2.2);
    const removedOnSale = !renderer.comboMarkers.has(tower.id);
    const other = game.towers[0];
    other.comboActive = { kind, startedAt: game.time - .1, until: game.time + 3 };
    renderer.render(game, state, received + 2.3);
    const reset = disposalProbe(renderer.comboMarkers.get(other.id));
    renderer.setMap(game.map, 0);
    const resetEmpty = renderer.comboMarkers.size === 0;
    renderer.updateComboMarkers({ time: game.time, towers: Array.from({ length: 80 }, (_, index) => ({ ...other, id: `marker-budget-${index}` })) });
    const markerCap = renderer.comboMarkers.size;
    renderer.setMap(game.map, 0);
    return { early, arrived, retained, expired, sold: !!sold, removedOnSale, resetEmpty, reducedMotionStable, markerCap, expiry, sale, reset };
  }, kind);
}

function assertMarkerLifecycle(report) {
  assert.equal(report.early, 0, 'new co-op markers wait for buffered presentation time');
  for (const key of ['arrived', 'retained', 'expired', 'sold', 'removedOnSale', 'resetEmpty', 'reducedMotionStable']) assert.equal(report[key], true, key);
  assert.equal(report.markerCap, 64, 'marker rendering has a hard cap');
  for (const key of ['expiry', 'sale', 'reset']) {
    assert.ok(report[key].expected > 0, `${key} exercises material cleanup`);
    assert.equal(report[key].disposed, report[key].expected, `${key} disposes every cloned marker material`);
  }
}

async function hiddenRecipes(scope) {
  assert.equal(await page.locator('.combo-guide, .combo-note, [data-combo]').count(), 0, 'pairing recipes and active-combo panels stay hidden');
  assert.doesNotMatch(await scope.innerText(), /sporefire|prismstorm|late-game pairings/i, 'ordinary game UI does not disclose hidden combo names or recipes');
}
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  assert.equal(await page.evaluate(() => gnomeward.renderer.comboMarkers.size), 0, 'no markers appear before a combination actually triggers');
  stage = 'desktop field guide keeps combinations secret';
  await page.locator('#help-button').click();
  await hiddenRecipes(page.locator('#game-dialog'));
  await page.locator('[aria-label="Close field guide"]').click();
  stage = 'legacy server discovery messages remain secret';
  await page.evaluate(() => {
    gnomeward.state.paused = true;
    // A previous server may still include its recipe in the discovery payload.
    // Keep the celebratory name while refusing to display that legacy message.
    gnomeward.game.events.push({ type: 'combo', combo: 'sporefire', message: 'LEGACY_RECIPE_FIXTURE: Morel tier 3 and Bramble tier 3 reveal this recipe.' });
  });
  await page.waitForFunction(() => document.querySelector('.round-announcement')?.textContent.includes('SPOREFIRE'));
  await settled();
  assert.doesNotMatch(await page.locator('.toast-stack').innerText(), /LEGACY_RECIPE_FIXTURE|reveal this recipe/);
  for (const name of ['sporefire', 'prismstorm']) {
    stage = `earned ${name} round 71 combat`;
    combat[name] = await page.evaluate(({ fixture, name }) => {
      const { game, state, renderer } = gnomeward;
      Object.assign(game, fixture); Object.assign(state, { paused: true, autoStart: false, multiplayer: null, selectedTowerId: null, placingType: null });
      // A different earned save can reuse tower IDs for different gnomes.
      // Rebuild the same Meadow scenery so entity caches match this save.
      renderer.setMap(game.map, 0);
      if (!game.startWave()) throw new Error('Earned fixture must start round 71');
      let best = null, bestScore = -1, observed = 0;
      // Advance the real browser simulation, selecting an actual combat frame
      // with several simultaneous hits for a reproducible visual inspection.
      for (let step = 0; step < 900 && game.status === 'wave'; step++) {
        game.update(.05);
        const wanted = name === 'sporefire' ? 'sporefire' : 'prism-shard';
        const active = [...game.effects, ...game.projectiles].filter(e => e.type === wanted);
        observed += active.length;
        const aged = active.filter(e => e.ttl / e.maxTtl < .85 && e.ttl / e.maxTtl > .25).length;
        const score = aged * 10 + Math.min(game.enemies.length, 35);
        if (aged && score > bestScore) { best = JSON.parse(JSON.stringify(game)); bestScore = score; }
      }
      if (!best || !observed) throw new Error(`${name} never triggered through real combat`);
      Object.assign(game, best); game.events = [];
      return { wave: game.wave, cleared: game.completedWaves, observed, gold: game.gold, points: game.points,
        enemies: game.enemies.length, effects: game.effects.map(e => e.type), projectiles: game.projectiles.map(e => e.type),
        models: ['sporefire-petals', 'combo-sparks', 'prism-burst', 'prism-shard'].every(key => !!renderer.models[key]) };
    }, { fixture: fixtures[name], name });
    assert.equal(combat[name].models, true); assert.equal(combat[name].wave, 71); assert.equal(combat[name].cleared, 70);
    await page.waitForFunction(() => document.getElementById('hud-wave').textContent.includes('71'));
    await settled();
    await currencyFits();
    const rendered = await page.evaluate(name => {
      const game = gnomeward.game, wanted = name === 'sporefire' ? 'sporefire' : 'prism-shard';
      return [...game.effects, ...game.projectiles].filter(e => e.type === wanted && gnomeward.renderer.fx.has(e.id)).length;
    }, name);
    assert.ok(rendered > 0, 'actual combat effects rendered');
    combat[name].markers = await assertParticipantMarkers(name, name === 'sporefire' ? ['spore', 'boom'] : ['multi', 'crystal']);
    await page.screenshot({ path: `playtest-results/combo-${name}-round71.png` });
    await select(name === 'sporefire' ? 'spore' : 'multi');
    await hiddenRecipes(page.locator('#selection-panel'));
    assert.match(await page.locator('.upgrade-path.invested small').first().innerText(), /Maximum upgrade reached/i, 'maxed paths describe their tier without giving away recipes');
    if (name === 'prismstorm') {
      await page.setViewportSize({ width: 390, height: 844 }); await settled();
      await currencyFits();
      await hiddenRecipes(page.locator('#selection-panel'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await page.locator('#selection-panel').boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'selected upgrades fit phone');
      await page.screenshot({ path: 'playtest-results/combo-prismstorm-phone-upgrades.png' });
    }
    await page.locator('[data-close-upgrades]').click();
    if (name === 'prismstorm') {
      stage = 'phone field guide keeps combinations secret after activation';
      await page.locator('#help-button').click();
      await hiddenRecipes(page.locator('#game-dialog'));
      await page.locator('.help-steps').scrollIntoViewIfNeeded(); await settled();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: 'playtest-results/combo-phone-guide.png' });
      await page.locator('[aria-label="Close field guide"]').click();
      await page.setViewportSize({ width: 1280, height: 800 }); await settled();
    }
  }

  stage = 'server snapshots and buffered co-op crystal projectiles';
  // The same earned board now goes through real Match.snapshot and the public
  // client snapshot adapter. Synthetic owners test cross-owner presentation;
  // this is transport-independent coverage, not a WebSocket connectivity test.
  const earnedCombat = await page.evaluate(() => JSON.parse(JSON.stringify(gnomeward.game)));
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'More sparks'); match.addPlayer('two', 'More crystals');
  Object.assign(match.board(), earnedCombat);
  for (const tower of match.board().towers) tower.ownerId = tower.type === 'multi' ? 'one' : 'two';
  match.started = true;
  for (const player of match.players.values()) { player.gold = Math.floor(earnedCombat.gold / 2); player.points = Math.floor(earnedCombat.points / 2); }
  let adapterGame;
  for (let i = 0; i < 8; i++) {
    if (i) { match.board().update(.05); match.tick++; }
    const adapted = applyCoopSnapshot(adapterGame, match.snapshot('combo-fixture'), 'one'); adapterGame = adapted.game;
    await page.evaluate(({ game, multiplayer }) => {
      Object.assign(gnomeward.game, game);
      multiplayer.snapshotReceivedAt = performance.now() / 1000;
      Object.assign(gnomeward.state, { multiplayer, paused: false, selectedTowerId: null });
      // SwiftShader can render slower than the packet cadence. Capture each
      // fixture packet explicitly rather than letting RAF skip intermediate
      // assignments; normal renderer.render uses this same capture method.
      gnomeward.renderer.motion.capture(gnomeward.game, multiplayer);
    }, JSON.parse(JSON.stringify({ game: adapted.game, multiplayer: adapted.multiplayer })));
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => gnomeward.renderer.motion.frames.length > 1);
  const coop = await page.evaluate(() => ({ supported: gnomeward.state.multiplayer.combosSupported, frames: gnomeward.renderer.motion.frames.length,
    partner: !!gnomeward.game.prismPartner(gnomeward.game.towers.find(t => t.type === 'multi')),
    models: [...gnomeward.renderer.fx.values()].filter(object => object.getObjectByName('prism-shard')).length }));
  assert.equal(coop.supported, true); assert.equal(coop.partner, true); assert.ok(coop.frames > 1);
  assert.ok(coop.models > 0, 'real shard projectiles survive the co-op presentation buffer');
  coop.markers = await assertParticipantMarkers('prismstorm', ['multi', 'crystal']);
  await select('multi'); await hiddenRecipes(page.locator('#selection-panel'));
  await page.locator('[data-close-upgrades]').click(); await settled();
  await page.screenshot({ path: 'playtest-results/combo-prismstorm-coop.png' });

  stage = 'bounded rendering and effect cleanup';
  // This last fixture checks rendering budgets only; it contributes no damage
  // or progression to the legitimately earned combat checks above.
  await page.evaluate(() => {
    const { game, state } = gnomeward; state.multiplayer = null; state.paused = true;
    game.effects = Array.from({ length: 200 }, (_, i) => ({ id: `budget-burst${i}`, type: i % 2 ? 'sporefire' : 'prism-burst', x: i % 20 - 10, z: Math.floor(i / 20) - 5, radius: 3, ttl: .4, maxTtl: .8 }));
    game.projectiles = Array.from({ length: 200 }, (_, i) => ({ id: `budget-shard${i}`, type: 'prism-shard', x: i % 20 - 10, z: 0, tx: 0, tz: 1, ttl: .3, maxTtl: .6, color: '#7dedff' }));
  }); await settled();
  assert.deepEqual(await page.evaluate(() => ({ visible: gnomeward.renderer.fx.size, authoritative: gnomeward.game.effects.length + gnomeward.game.projectiles.length })), { visible: 76, authoritative: 400 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await settled();
  assert.equal(await page.evaluate(() => gnomeward.renderer.fx.size), 70);
  await assertParticipantMarkers('prismstorm', ['multi', 'crystal']);
  await page.evaluate(() => { gnomeward.game.effects = []; gnomeward.game.projectiles = []; }); await settled();
  assert.equal(await page.evaluate(() => gnomeward.renderer.fx.size), 0);
  stage = 'participant marker timing, sale and material cleanup';
  const markerCleanup = await markerLifecycle('prismstorm');
  assertMarkerLifecycle(markerCleanup);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, combat, coop, markerCleanup, budget: { normal: 76, reducedMotion: 70 }, errors }, null, 2));
} catch (error) {
  console.error('Combo browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/combo-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
