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
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
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
    await page.screenshot({ path: `playtest-results/combo-${name}-round71.png` });
    await select(name === 'sporefire' ? 'spore' : 'multi');
    assert.match(await page.locator('.upgrade-path.invested small').first().innerText(), new RegExp(name, 'i'), 'maxed path retains finalTierHint');
    if (name === 'prismstorm') {
      assert.equal(await page.locator('[data-combo="prismstorm"]').getAttribute('data-active'), 'true');
      await page.setViewportSize({ width: 390, height: 844 }); await settled();
      await currencyFits();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await page.locator('[data-combo="prismstorm"]').boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'combo note fits phone');
      await page.screenshot({ path: 'playtest-results/combo-prismstorm-phone-upgrades.png' });
    }
    await page.locator('[data-close-upgrades]').click();
    if (name === 'prismstorm') {
      stage = 'phone field guide';
      await page.locator('#help-button').click();
      const guide = page.locator('.combo-guide');
      const text = await guide.innerText();
      for (const phrase of ['Sporefire', 'Prismstorm', '7 range', 'server 0.2.5']) assert.ok(text.includes(phrase));
      await guide.scrollIntoViewIfNeeded(); await settled();
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
  await select('multi'); assert.equal(await page.locator('[data-combo="prismstorm"]').getAttribute('data-active'), 'true');
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
  await page.evaluate(() => { gnomeward.game.effects = []; gnomeward.game.projectiles = []; }); await settled();
  assert.equal(await page.evaluate(() => gnomeward.renderer.fx.size), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, combat, coop, budget: { normal: 76, reducedMotion: 70 }, errors }, null, 2));
} catch (error) {
  console.error('Combo browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/combo-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
