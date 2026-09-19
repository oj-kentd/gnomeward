import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';
import { MAPS, SECRETS, NECRO_PATH_SECRET, cottagePosition } from '../src/data.js';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  if (!localStorage.getItem('gnomeward-profile')) localStorage.setItem('gnomeward-profile', JSON.stringify({ unlocks: ['necro'] }));
});
let stage = 'entering Pumpkin Hollow';
const progress = setInterval(() => console.log('Soul Echoes browser check:', stage), 15000);
progress.unref();
async function ready() {
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  await page.locator('#splash-screen').waitFor({ state: 'hidden' });
}
async function clickWorld(x, y, z) {
  // Opening/closing the dock resizes the canvas. Let ResizeObserver update the
  // camera before projecting a world position into clickable screen space.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const point = await page.evaluate(({ x, y, z }) => {
    const world = gnomeward.renderer, p = world.camera.position.clone().set(x, y, z).project(world.camera);
    const r = world.renderer.domElement.getBoundingClientRect();
    return { x: r.x + (p.x + 1) * r.width / 2, y: r.y + (1 - p.y) * r.height / 2 };
  }, { x, y, z });
  await page.mouse.click(point.x, point.y);
}
async function pumpkin(id) {
  const spot = SECRETS.hollow.spots.find(spot => spot.id === id);
  await clickWorld(spot.x, .38, spot.z);
}
async function selectMap(id) {
  await page.locator('#map-button').click();
  await page.locator(`[data-map="${id}"]`).click();
  await page.waitForFunction(id => gnomeward.game.map.id === id && !document.querySelector('#game-dialog').open, id);
}
async function placeMorrow(x, z) {
  if (await page.locator('#shop-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#shop-toggle').click();
  await page.locator('[data-tower="necro"]').click();
  await clickWorld(x, 0, z);
  await page.waitForFunction(() => gnomeward.game.towers.some(t => t.type === 'necro'));
  await page.locator('#shop-toggle').click();
}
try {
  await mkdir('playtest-results', { recursive: true });
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5175');
  await enterGarden(page); await ready();
  await selectMap('hollow'); await placeMorrow(-7, 0);
  assert.equal(await page.locator('[data-upgrade]').count(), 4);
  assert.equal(await page.locator('[data-upgrade="3"]').isDisabled(), true);
  assert.match(await page.locator('.upgrade-path').nth(3).innerText(), /mysterious|secret|hidden|\?\?\?/i);
  await page.locator('[data-close-upgrades]').click();
  const cottage = cottagePosition(MAPS.find(map => map.id === 'hollow'));
  await clickWorld(cottage.x, 1.5, cottage.z);
  await page.locator('[aria-label="Close cottage clue"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('dialog').innerText(), /10|ten/i);
  await page.locator('[aria-label="Close cottage clue"]').click();
  await pumpkin(NECRO_PATH_SECRET.order[0]);
  assert.equal(await page.evaluate(() => gnomeward.game.pathSecretDiscoveries.length), 0);

  stage = 'earning the second clue through real spell impacts';
  const earned = await page.evaluate(() => {
    const g = gnomeward.game, tower = g.towers[0];
    gnomeward.state.paused = true;
    g.startWave(); g._queue = []; g._spawnTimer = 999; tower.cooldown = 999;
    for (let i = 0; i < 10; i++) {
      const enemy = g._spawn('bone', 0);
      Object.assign(enemy, { hp: 1, maxHp: 1, x: tower.x + 1, z: tower.z, speed: 0 });
      g._launch(tower, enemy, g.getStats(tower));
      g._advanceProjectiles(2);
    }
    g.points = 200; // Upgrade UI fixture; the ritual's kills above are earned by spell impacts.
    return { kills: g.necroSpellKills, ready: g.canDiscoverNecroPath(), unlocked: g.isPathUnlocked('necro', 3) };
  });
  assert.deepEqual(earned, { kills: 10, ready: true, unlocked: false });
  await clickWorld(cottage.x, 1.5, cottage.z);
  await page.locator('[aria-label="Close cottage clue"]').waitFor({ state: 'visible' });
  const clue = await page.locator('dialog').innerText();
  for (const word of ['flame', 'leaf', 'star', 'moon']) assert.match(clue, new RegExp(word, 'i'));
  await page.screenshot({ path: 'playtest-results/echoes-clue.png' });
  await page.locator('[aria-label="Close cottage clue"]').click();

  stage = 'solving the lantern ritual through battlefield clicks';
  await pumpkin(NECRO_PATH_SECRET.order[0]);
  await page.waitForFunction(() => gnomeward.game.pathSecretDiscoveries.length === 1);
  await pumpkin(NECRO_PATH_SECRET.order[2]);
  await page.waitForFunction(() => gnomeward.game.pathSecretDiscoveries.length === 0);
  for (const [index, id] of NECRO_PATH_SECRET.order.entries()) {
    await pumpkin(id);
    await page.waitForFunction(n => gnomeward.game.pathSecretDiscoveries.length === n, index + 1);
  }
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gnomeward-profile')).pathUnlocks?.includes('necro-echoes'));
  await clickWorld(-7, 1.2, 0);
  await page.waitForFunction(() => !document.querySelector('[data-upgrade="3"]').disabled);
  assert.match(await page.locator('.upgrade-path').nth(3).innerText(), /Soul Echoes/);
  for (const count of [2, 3, 4]) {
    await page.locator('[data-upgrade="3"]').click();
    await page.waitForFunction(count => gnomeward.game.getStats(gnomeward.game.towers[0]).summonCount === count, count);
  }
  assert.equal(await page.evaluate(() => gnomeward.game.points), 81);
  await page.screenshot({ path: 'playtest-results/echoes-upgrades.png' });

  stage = 'four guardians leave the cottage after one kill';
  const batch = await page.evaluate(() => {
    const g = gnomeward.game, tower = g.towers[0];
    g.enemies = []; g.allies = []; g.effects = []; g.projectiles = [];
    tower.soulQueue = []; tower.summonCooldown = 0; tower.cooldown = 999;
    const sentinel = g._spawn('king', 0); sentinel.speed = 0; sentinel.hp = sentinel.maxHp = 100000;
    const victim = g._spawn('bone', 0);
    Object.assign(victim, { hp: 1, maxHp: 1, x: tower.x + 1, z: tower.z, speed: 0 });
    g._launch(tower, victim, g.getStats(tower)); g._advanceProjectiles(2);
    const queued = tower.soulQueue.length;
    for (let i = 0; i < 160; i++) g.update(.05);
    gnomeward.renderer.render(g, gnomeward.state, g.time);
    return { queued, active: g.allies.length, rendered: gnomeward.renderer.allies.size, waiting: tower.soulQueue.length };
  });
  assert.deepEqual(batch, { queued: 4, active: 4, rendered: 4, waiting: 0 });
  await page.locator('[data-close-upgrades]').click();
  await page.screenshot({ path: 'playtest-results/echoes-guardians.png' });
  await clickWorld(-7, 1.2, 0);
  await page.locator('[data-upgrade="1"]').click();
  assert.equal(await page.locator('[data-upgrade="0"]').isDisabled(), true);
  assert.equal(await page.locator('[data-upgrade="2"]').isDisabled(), true);

  stage = 'the unlock survives reload and works on other maps';
  await page.reload(); await enterGarden(page); await ready();
  assert.equal(await page.evaluate(() => gnomeward.game.isPathUnlocked('necro', 3)), true);
  assert.equal(await page.evaluate(() => gnomeward.game.necroSpellKills), 0);
  await placeMorrow(-5, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-upgrade="3"]').scrollIntoViewIfNeeded();
  assert.match(await page.locator('.upgrade-path').nth(3).innerText(), /Soul Echoes/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'playtest-results/echoes-phone.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, earned, batch, persisted: true, errors }, null, 2));
} catch (error) {
  console.error('Soul Echoes failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/echoes-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
