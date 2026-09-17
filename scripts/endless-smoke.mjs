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
let page, stage = 'loading';
async function ready() {
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 4);
}
async function changeMap(id) {
  await page.locator('#map-button').click();
  await page.locator(`[data-map="${id}"]`).click();
  await page.waitForFunction(id => gnomeward.game.map.id === id, id);
}
async function clearRound(wave) {
  await page.evaluate(wave => {
    const game = gnomeward.game;
    gnomeward.state.paused = true;
    game.wave = wave; game.status = 'wave'; game._queue = []; game.enemies = [];
    game.projectiles = []; game.update(.05);
  }, wave);
}
async function savedBest(map, value) {
  await page.waitForFunction(({ map, value }) => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').bestRounds?.[map] === value, { map, value });
}
async function modalFits() {
  return page.locator('#game-dialog').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    const button = dialog.querySelector('[data-continue-endless]');
    const b = button?.getBoundingClientRect();
    return { inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, noHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth + 1, continueVisible: !!b && b.top >= rect.top && b.bottom <= rect.bottom && b.left >= rect.left && b.right <= rect.right };
  });
}
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173'); await ready();
  await page.getByRole('button', { name: 'Dismiss welcome tip' }).click();
  await page.locator('[data-tower="sprout"]').click();
  const position = await page.evaluate(() => {
    const world = gnomeward.renderer;
    const p = world.camera.position.clone().set(8, 0, -1).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  });
  await page.mouse.click(position.x, position.y);
  await page.waitForFunction(() => gnomeward.game.towers.length === 1);
  await page.evaluate(() => { gnomeward.game.points = 100; });
  await page.waitForFunction(() => !document.querySelector('[data-upgrade="0"]').disabled);
  await page.locator('[data-upgrade="0"]').click();
  await page.locator('[data-close-upgrades]').click();
  await page.locator('#auto-button').click();

  stage = 'offering endless mode after campaign victory';
  await clearRound(20);
  await page.locator('[data-continue-endless]').waitFor();
  await savedBest('meadow', 20);
  assert.match(await page.locator('#game-dialog').innerText(), /VICTORY!/);
  assert.deepEqual(await modalFits(), { inViewport: true, noHorizontalOverflow: true, continueVisible: true });
  const victory = await page.evaluate(() => {
    const game = gnomeward.game;
    return { towers: game.towers, gold: game.gold, points: game.points, lives: game.lives, completed: game.completedWaves, endless: game.endless };
  });
  assert.equal(victory.completed, 20); assert.equal(victory.endless, false);
  assert.equal(victory.towers[0].levels[0], 1);
  await page.screenshot({ path: 'playtest-results/endless-victory.png' });
  await page.getByRole('button', { name: 'View the battlefield' }).click();
  await page.evaluate(() => { gnomeward.state.paused = false; });
  await page.waitForTimeout(3400);
  assert.deepEqual(await page.evaluate(() => ({ wave: gnomeward.game.wave, status: gnomeward.game.status, countdown: gnomeward.state.autoCountdown })), { wave: 20, status: 'won', countdown: null }, 'Auto rounds cannot bypass the explicit endless choice');
  await page.locator('#auto-button').click();
  await page.locator('#start-button').click();
  await page.locator('[data-continue-endless]').click();
  await page.waitForFunction(() => gnomeward.game.endless && document.getElementById('hud-round-label').textContent === 'ENDLESS');
  const continued = await page.evaluate(() => {
    const game = gnomeward.game;
    return { towers: game.towers, gold: game.gold, points: game.points, lives: game.lives, wave: game.wave, status: game.status };
  });
  assert.deepEqual(continued, { towers: victory.towers, gold: victory.gold, points: victory.points, lives: victory.lives, wave: 20, status: 'planning' });
  assert.equal(await page.locator('#hud-wave').innerText(), '21/∞');
  assert.equal(await page.locator('#hud-best').innerText(), 'BEST 20');
  assert.match(await page.locator('#preview-title').innerText(), /ROUND 21/);
  assert.ok(await page.locator('.enemy-badge').count() > 0);
  assert.match(await page.locator('#start-button').innerText(), /START ROUND 21/);
  await page.screenshot({ path: 'playtest-results/endless-ready.png' });

  stage = 'automatic rounds beyond 20 and recording only survived rounds';
  await page.locator('#auto-button').click();
  await page.waitForFunction(() => gnomeward.game.wave === 21 && gnomeward.game.status === 'wave');
  assert.ok(await page.evaluate(() => gnomeward.game._queue.length + gnomeward.game.enemies.length > 0));
  await clearRound(21); await savedBest('meadow', 21);
  await page.locator('#pause-button').click();
  await page.waitForFunction(() => gnomeward.game.wave === 22 && gnomeward.game.status === 'wave');
  await page.evaluate(() => { gnomeward.state.paused = true; gnomeward.game.lives = 0; gnomeward.game.update(.05); });
  await page.getByRole('heading', { name: 'What a stand!' }).waitFor();
  assert.match(await page.locator('#game-dialog').innerText(), /survived through round 21/);
  assert.match(await page.locator('#game-dialog').innerText(), /fell during round 22/);
  assert.match(await page.locator('.result-best').innerText(), /round 21/);
  assert.equal(await page.locator('[data-continue-endless]').count(), 0);
  await page.screenshot({ path: 'playtest-results/endless-defeat.png' });
  await savedBest('meadow', 21);

  stage = 'persisting records across reloads, retries, and different maps';
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => gnomeward.game.bestRound), 21);
  assert.equal(await page.evaluate(() => gnomeward.game.endless), false);
  await page.locator('#map-button').click();
  assert.match(await page.locator('[data-map="meadow"] .map-best').innerText(), /round 21/);
  assert.match(await page.locator('[data-map="quarry"] .map-best').innerText(), /No rounds cleared/);
  await page.getByRole('button', { name: 'Close map selection' }).click();
  await clearRound(1);
  assert.equal(await page.evaluate(() => gnomeward.game.bestRound), 21);
  await changeMap('quarry');
  assert.equal(await page.evaluate(() => gnomeward.game.bestRound), 0);
  await clearRound(2); await savedBest('quarry', 2);
  await page.locator('#map-button').click();
  assert.match(await page.locator('[data-map="meadow"] .map-best').innerText(), /round 21/);
  assert.match(await page.locator('[data-map="quarry"] .map-best').innerText(), /round 2/);
  await page.screenshot({ path: 'playtest-results/endless-records.png' });
  await page.locator('[data-map="meadow"]').click();

  stage = 'checking the victory dialog and endless controls on a phone';
  await page.setViewportSize({ width: 390, height: 844 });
  await clearRound(20); await page.locator('[data-continue-endless]').waitFor();
  const mobile = await modalFits();
  assert.deepEqual(mobile, { inViewport: true, noHorizontalOverflow: true, continueVisible: true });
  await page.screenshot({ path: 'playtest-results/endless-mobile-victory.png' });
  await page.locator('[data-continue-endless]').click();
  await page.waitForFunction(() => document.getElementById('hud-round-label').textContent === 'ENDLESS');
  assert.equal(await page.locator('#hud-wave').innerText(), '21/∞');
  assert.equal(await page.locator('#hud-best').innerText(), 'BEST 21');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => gnomeward.game.wave === 21 && gnomeward.game.status === 'wave');
  await page.locator('#pause-button').click();
  await page.screenshot({ path: 'playtest-results/endless-mobile-round.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ version: await page.evaluate(() => gnomeward.version), retained: continued, records: await page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile')).bestRounds), mobile, errors }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: 'playtest-results/endless-failure.png', timeout: 10000 }).catch(() => {});
  console.error(JSON.stringify({ stage, errors }, null, 2));
  throw new Error(`Endless smoke failed while ${stage}: ${error.message}`, { cause: error });
} finally {
  await browser.close();
}
