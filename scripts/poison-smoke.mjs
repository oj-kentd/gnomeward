import { enterGarden } from './browser-helpers.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let stage = 'loading the garden';
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(45000);
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); console.error('Browser console:', message.text()); } });
  await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden);
  await page.waitForFunction(() => gnomeward.renderer.renderer.info.render.frame > 4);

  stage = 'placing and upgrading Morel';
  // Place Morel and buy Wild Garden through the actual shop and upgrade popup.
  await page.locator('[data-tower="spore"]').click();
  const point = await page.evaluate(() => {
    const world = gnomeward.renderer;
    const p = world.camera.position.clone().set(-5, 0, -2).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => gnomeward.game.towers.some((tower) => tower.type === 'spore'));
  await page.evaluate(() => { gnomeward.game.points = 250; });
  await page.waitForFunction(() => !document.querySelector('[data-upgrade="3"]').disabled);
  const path = page.locator('.upgrade-path').filter({ has: page.locator('[data-upgrade="3"]') });
  assert.match(await path.innerText(), /Wild Garden/);
  assert.match(await path.innerText(), /Poison spreads to nearby skeletons/);
  assert.equal(await page.locator('[data-targeting]').count(), 0, 'Morel chooses mushroom positions automatically');
  const tierStats = [];
  for (let tier = 1; tier <= 3; tier++) {
    await page.locator('[data-upgrade="3"]').click();
    const stats = await page.evaluate(() => {
      const game = gnomeward.game;
      const morel = game.towers.find((tower) => tower.type === 'spore');
      return { level: morel.levels[3], ...game.getStats(morel) };
    });
    assert.equal(stats.level, tier);
    assert.equal(stats.poisonSpreadTargets, tier);
    assert.ok(Math.abs(stats.poisonSpreadRadius - [0, 1.3, 1.9, 2.5][tier]) < 1e-8);
    assert.equal(stats.poisonSpreadInterval, 1);
    assert.equal(stats.poisonSpreadMultiplier, .65);
    tierStats.push({ tier, radius: stats.poisonSpreadRadius, targets: stats.poisonSpreadTargets });
  }
  assert.match(await page.locator('.poison-spread-note').innerText(), /65% damage/);
  assert.match(await page.locator('.poison-spread-note').innerText(), /cannot spread again/);
  assert.equal(await page.locator('[data-upgrade="3"]').isDisabled(), true, 'Tier three must be maxed');
  await page.locator('[data-upgrade="0"]').click();
  assert.equal(await page.locator('[data-upgrade="1"]').isDisabled(), true, 'Only two upgrade paths may be chosen');
  assert.equal(await page.locator('[data-upgrade="2"]').isDisabled(), true);
  await page.screenshot({ path: 'playtest-results/poison-upgrades.png' });
  await page.getByRole('button', { name: 'Close upgrades' }).click();
  await page.locator('#pause-button').click();
  assert.equal(await page.evaluate(() => gnomeward.state.paused), true);

  stage = 'checking poison spread and its visual';
  const spread = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer;
    const morel = game.towers.find((tower) => tower.type === 'spore');
    const stats = game.getStats(morel);
    game.startWave();
    game._queue = [];
    game._spawnTimer = 999;
    game.enemies = [];
    game.traps = [];
    game.effects = [];
    // An upgraded, real mushroom infects the first stationary skeleton. The next
    // is outside mushroom radius but inside spread radius; the last is only near
    // the secondary infection. This isolates spread from ordinary trap contact.
    game._plant(morel, stats);
    const trap = game.traps[0];
    if (!trap) throw Error('Morel did not plant a mushroom');
    Object.assign(trap, game.pointAt(8, 0), { progress: 8, routeIndex: 0 });
    morel.cooldown = 999;
    const enemies = [8, 10, 12].map((progress) => {
      game._spawn('purple');
      const enemy = game.enemies.at(-1);
      Object.assign(enemy, game.pointAt(progress, 0), { progress, routeIndex: 0, speed: 0, hp: 1000, maxHp: 1000 });
      return enemy;
    });
    game.update(.05);
    if (!enemies[0].poison || enemies[1].poison || enemies[2].poison) throw Error('Fixture must begin with only one direct mushroom infection');
    let effect;
    for (let step = 0; step < 40 && !effect; step++) {
      game.update(.05);
      effect = game.effects.find((item) => item.type === 'poison-spread');
    }
    if (!effect || !enemies[1].poison?.secondary) throw Error('Wild Garden did not spread poison to the nearby skeleton');
    const primary = enemies[0].poison;
    const secondary = enemies[1].poison;
    if (Math.abs(secondary.dps - primary.dps * .65) > 1e-8) throw Error('Secondary poison should deal 65% of primary damage');
    if (secondary.remaining > primary.remaining + .001) throw Error('Spread poison must not gain extra duration');
    if (secondary.spreadTargetsLeft !== 0) throw Error('Secondary poison must not spread again');
    world.render(game, gnomeward.state, game.time);
    const object = world.fx.get(effect.id);
    if (!object) throw Error('The poison-spread effect was not rendered');
    const before = object.position.clone();
    const scale = object.scale.toArray();
    game.update(.1);
    world.render(game, gnomeward.state, game.time);
    const moved = object.position.distanceTo(before) > .01;
    const round = Math.max(...scale) - Math.min(...scale) < .001;
    window.__poisonSmoke = { ids: enemies.map((enemy) => enemy.id), effectId: effect.id };
    return { primaryDps: primary.dps, secondaryDps: secondary.dps, round, moved, targetId: effect.targetId, expectedTargetId: enemies[1].id, effectType: effect.type };
  });
  assert.equal(spread.moved, true, 'Poison spread must have a moving visual');
  assert.equal(spread.round, true, 'Poison spread should use a compact pellet');
  assert.equal(spread.targetId, spread.expectedTargetId);
  await page.screenshot({ path: 'playtest-results/poison-spread.png' });
  const chainCheck = await page.evaluate(() => {
    const game = gnomeward.game;
    for (let step = 0; step < 45; step++) game.update(.05);
    const [primary, secondary, untouched] = window.__poisonSmoke.ids.map((id) => game.enemies.find((enemy) => enemy.id === id));
    return { secondaryStillPoisoned: !!secondary?.poison, noChain: !untouched?.poison, primaryBudget: primary?.poison?.spreadTargetsLeft };
  });
  assert.equal(chainCheck.secondaryStillPoisoned, true);
  assert.equal(chainCheck.noChain, true, 'A secondary infection must not start an unlimited chain');
  assert.equal(chainCheck.primaryBudget, 2, 'Only the one successful transmission should consume budget');
  assert.deepEqual(errors, [], 'Browser should not report errors');
  console.log(JSON.stringify({ tierStats, spread, chainCheck, errors }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: 'playtest-results/poison-failure.png', timeout: 10000 }).catch(() => {});
  console.error(JSON.stringify({ stage, errors, loading: page ? await page.locator('#loading-message').textContent({ timeout: 1000 }).catch(() => null) : null }, null, 2));
  throw new Error(`Poison smoke failed while ${stage}: ${error.message}`, { cause: error });
} finally {
  await browser.close();
}
