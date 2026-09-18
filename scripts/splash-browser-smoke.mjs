import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.PLAYTEST_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const contexts = [], errors = [], gameRequests = [], expectedLoadErrors = [];
let stage = 'opening the landing page';

async function device({ failAssets = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 720 }, deviceScaleFactor: 1 });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  if (failAssets) {
    await page.route('**/assets/ground.glb*', route => route.abort('failed'));
    page.on('console', message => { if (message.type() === 'error') expectedLoadErrors.push(message.text()); });
  }
  page.on('request', request => {
    if (/\.glb(?:\?|$)|\/src\/main\.js(?:\?|$)|\/assets\/main-[^/]+\.js(?:\?|$)/.test(request.url())) gameRequests.push(request.url());
  });
  await page.goto(baseURL);
  await page.locator('#splash-play:enabled').waitFor({ state: 'visible' });
  return { context, page };
}
async function assertLanding(page) {
  assert.equal(await page.locator('#splash-screen').isVisible(), true);
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.equal(await page.locator('#app').evaluate(element => element.inert), true);
  assert.equal(await page.evaluate(() => !!window.gnomeward), false);
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.getByRole('button', { name: /play solo/i }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: /play co-op/i }).isVisible(), true);
}
async function assertLayout(page, viewport, name) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(() => [...document.querySelectorAll('#splash-screen img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name} has no horizontal overflow`);
  for (const id of ['splash-play', 'splash-coop']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const bounds = await page.locator(`#${id}`).boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, `${name} ${id} remains a usable touch target`);
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1, `${name} ${id} fits the screen`);
    assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1, `${name} ${id} can be reached without clipping`);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `playtest-results/splash-${name}.png`, fullPage: true });
}
async function gameReady(page) {
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 0);
  await page.locator('#splash-screen').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#app').isVisible(), true);
  assert.equal(await page.locator('#app').evaluate(element => element.inert), false);
}

try {
  await mkdir('playtest-results', { recursive: true });
  const solo = await device(), page = solo.page;
  await assertLanding(page);
  const accessibleBrand = await page.getByRole('heading', { name: /gnomeward/i }).count() + await page.getByRole('img', { name: /gnomeward/i }).count();
  assert.ok(accessibleBrand > 0, 'Gnomeward branding has an accessible heading or image name');
  assert.ok(await page.locator('#splash-screen img').count() > 0, 'the illustrated landing artwork is present');
  assert.equal(await page.locator('#splash-status').count(), 1);

  stage = 'landing artwork and controls fit desktop, phone and landscape';
  await assertLayout(page, { width: 1440, height: 900 }, 'desktop');
  await assertLayout(page, { width: 390, height: 844 }, 'phone');
  await assertLayout(page, { width: 320, height: 568 }, 'narrow-phone');
  await assertLayout(page, { width: 844, height: 390 }, 'landscape');
  await assertLayout(page, { width: 568, height: 320 }, 'narrow-landscape');

  stage = 'game keyboard shortcuts do nothing behind the landing page';
  await page.setViewportSize({ width: 1080, height: 720 });
  await page.locator('#splash-screen').click({ position: { x: 2, y: 2 } });
  for (const key of ['p', '1', 'Escape', 'Space']) await page.keyboard.press(key);
  await assertLanding(page);
  assert.deepEqual(gameRequests, [], 'the game module and Blender models load only after choosing Play');
  assert.equal(await page.evaluate(() => localStorage.getItem('gnomeward-profile')), null);

  stage = 'keyboard navigation enters solo play';
  for (let tab = 0; tab < 12 && !(await page.locator('#splash-play').evaluate(element => element === document.activeElement)); tab++) await page.keyboard.press('Tab');
  assert.equal(await page.locator('#splash-play').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  await gameReady(page);
  assert.equal(await page.evaluate(() => gnomeward.game.wave), 0);
  assert.equal(await page.evaluate(() => !!gnomeward.state.multiplayer), false);
  assert.ok(gameRequests.some(url => /\.glb(?:\?|$)/.test(url)), 'choosing Play loads actual game models');
  await solo.context.close();

  stage = 'Play co-op opens the in-game public lobby browser';
  const coop = await device();
  await assertLanding(coop.page);
  await coop.page.locator('#splash-coop').click();
  await gameReady(coop.page);
  await coop.page.locator('#game-dialog').waitFor({ state: 'visible' });
  assert.equal(await coop.page.locator('#coop-name').isVisible(), true);
  assert.equal(await coop.page.locator('[data-coop-create]').isVisible(), true);
  assert.equal(await coop.page.locator('#coop-lobbies').count(), 1);
  await coop.context.close();

  stage = 'an interrupted model download keeps the splash visible and offers retry';
  const failure = await device({ failAssets: true });
  await failure.page.locator('#splash-play').click();
  await failure.page.locator('#splash-retry').waitFor({ state: 'visible' });
  assert.equal(await failure.page.locator('#splash-screen').isVisible(), true);
  assert.equal(await failure.page.locator('#app').isVisible(), false);
  assert.equal(await failure.page.locator('#app').evaluate(element => element.inert), true);
  assert.equal(await failure.page.evaluate(() => gnomeward.ready), false);
  assert.match(await failure.page.locator('#splash-status').textContent(), /could not load|try again/i);
  const beforeKeys = await failure.page.evaluate(() => ({ wave: gnomeward.game.wave, paused: gnomeward.state.paused, placingType: gnomeward.state.placingType }));
  await failure.page.locator('#splash-screen').click({ position: { x: 2, y: 2 } });
  for (const key of ['p', '1', 'Escape', 'Space']) await failure.page.keyboard.press(key);
  assert.deepEqual(await failure.page.evaluate(() => ({ wave: gnomeward.game.wave, paused: gnomeward.state.paused, placingType: gnomeward.state.placingType })), beforeKeys, 'failed loading does not enable hidden game shortcuts');
  await failure.page.screenshot({ path: 'playtest-results/splash-load-failure.png', fullPage: true });
  await failure.page.unroute('**/assets/ground.glb*');
  await failure.page.locator('#splash-retry').click();
  await failure.page.locator('#splash-play:enabled').waitFor({ state: 'visible' });
  await assertLanding(failure.page);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, baseURL, checks: ['accessible branded artwork', 'game loads on demand', 'hidden game is inert', 'desktop/phone/narrow/landscape layouts', 'keyboard solo entry', 'co-op entry opens lobby', 'failed download keeps landing controls and retry', 'retry returns to landing page'], expectedLoadErrors: expectedLoadErrors.length, errors }, null, 2));
} catch (error) {
  console.error(`Splash browser check failed at: ${stage}`);
  console.error(error);
  for (const [index, context] of contexts.entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: `playtest-results/splash-failure-${index}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
  await browser.close();
}
