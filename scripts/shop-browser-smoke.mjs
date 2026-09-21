import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';

// Explicit fixtures supply a wallet and a defeated wave; all rewards, shop
// transactions, profile saves and visual changes use the production handlers.
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], checks = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'opening a fresh garden';
const progress = setInterval(() => console.log('Round Coin shop browser check:', stage), 15000); progress.unref();

async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}
async function enter() {
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  await page.evaluate(() => Object.assign(gnomeward.state, { paused: true, autoStart: false }));
  await settled();
}
async function openShop() {
  await page.locator('#coin-shop-button').click();
  await page.locator('#round-coin-shop').waitFor();
  await settled();
}
async function closeShop() {
  await page.locator('#game-dialog [data-close]').first().click();
  await page.waitForFunction(() => !document.querySelector('#game-dialog[open]'));
}
async function wallet(expected) {
  await page.waitForFunction(value => Number(document.querySelector('#shop-wallet-value')?.textContent.replace(/[^\d]/g, '')) === value, expected);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), expected);
}
async function model(towerId, modelName) {
  await page.waitForFunction(({ towerId, modelName }) => gnomeward.renderer.entities.get('t' + towerId)?.userData.modelName === modelName, { towerId, modelName });
}
async function doublePurchase(item) {
  // A rapid repeated click must neither double-charge nor duplicate ownership.
  await page.evaluate(id => {
    const button = document.querySelector(`[data-shop-buy="${id}"]`);
    if (!button || button.disabled) throw new Error('Purchase fixture is unavailable: ' + id);
    button.click(); button.click();
  }, item);
  await settled();
}
async function checkPhone(width) {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await settled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page fits the phone horizontally');
  const dialog = page.locator('#game-dialog');
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, 'shop dialog fits the phone');
  const items = [];
  for (const item of ['necro-skeletor', 'boss-damage']) {
    const button = page.locator(`[data-shop-buy="${item}"]`);
    await button.scrollIntoViewIfNeeded();
    const rect = await button.boundingBox();
    assert.ok(rect && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.x + rect.width <= width + 1,
      item + ' purchase button fits the phone');
    assert.ok(rect.y >= 0 && rect.y + rect.height <= (width === 320 ? 568 : 844) + 1,
      item + ' purchase button can scroll into view');
    items.push({ item, rect });
  }
  await page.locator('#round-coin-shop').evaluate(node => { for (let parent = node; parent; parent = parent.parentElement) parent.scrollTop = 0; });
  await settled();
  await page.screenshot({ path: `playtest-results/shop-${width}.png` });
  layouts.push({ width, dialog: bounds, items });
}

try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await page.locator('#splash-shop').click();
  await page.waitForFunction(() => window.gnomeward?.ready);
  await page.locator('#round-coin-shop').waitFor();
  await page.evaluate(() => Object.assign(gnomeward.state, { paused: true, autoStart: false }));
  await wallet(0);
  checks.push('Splash shop button enters the shop directly');
  for (const item of ['necro-skeletor', 'boss-damage']) assert.equal(await page.locator(`[data-shop-buy="${item}"]`).isDisabled(), true);
  checks.push('Fresh collection has zero coins and cannot buy unaffordable items');
  await closeShop();

  stage = 'one coin per completed round';
  const round = await page.evaluate(() => {
    const game = gnomeward.game;
    if (!game.startWave()) throw new Error('Round fixture did not start');
    game._queue = []; game.enemies = [];
    game.update(.05);
    const once = game.profile.roundCoins;
    game.update(.05); game.update(.05);
    return { once, after: game.profile.roundCoins, completed: game.completedWaves, wave: game.wave };
  });
  assert.deepEqual(round, { once: 1, after: 1, completed: 1, wave: 1 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').roundCoins === 1);
  await openShop(); await wallet(1); await closeShop();
  await page.locator('#map-button').click();
  await page.locator('[data-map="meadow"]').click();
  await page.waitForFunction(() => gnomeward.game.wave === 0);
  await page.evaluate(() => { gnomeward.state.paused = true; });
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 1);
  checks.push('Completing a real round awards exactly one persistent coin; restarting preserves it');

  stage = 'purchases and equipping an existing Morrow';
  const towerId = await page.evaluate(() => {
    const game = gnomeward.game;
    game.profile.roundCoins = 150;
    if (!game.profile.unlocks.includes('necro')) game.profile.unlocks.push('necro');
    return game._makeTower('necro', 0, 0, 0).id;
  });
  await settled();
  await model(towerId, 'gnome-necro');
  await openShop(); await wallet(150);
  await page.screenshot({ path: 'playtest-results/shop-desktop.png' });
  await doublePurchase('necro-skeletor'); await wallet(50);
  assert.deepEqual(await page.evaluate(() => gnomeward.game.profile.cosmetics), ['necro-skeletor']);
  await doublePurchase('boss-damage'); await wallet(0);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.bossDamageUnlocked), true);
  const equip = page.locator('[data-shop-skin="skeletor"]');
  if (await equip.isEnabled()) await equip.click();
  await page.waitForFunction(() => gnomeward.game.profile.equippedNecroSkin === 'skeletor');
  await model(towerId, 'gnome-necro-skeletor');
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('gnomeward-profile') || '{}');
    return saved.roundCoins === 0 && saved.bossDamageUnlocked && saved.equippedNecroSkin === 'skeletor' && saved.cosmetics?.includes('necro-skeletor');
  });
  checks.push('100-coin skin and 50-coin permanent perk purchase once; equipping swaps an existing model');
  await closeShop();

  stage = 'purchase and costume persistence';
  await page.reload(); await enter();
  const restored = await page.evaluate(() => {
    const game = gnomeward.game;
    const tower = game._makeTower('necro', 0, 0, 0);
    return { coins: game.profile.roundCoins, cosmetics: game.profile.cosmetics, perk: game.profile.bossDamageUnlocked,
      equipped: game.profile.equippedNecroSkin, towerId: tower.id, skin: tower.skin };
  });
  assert.deepEqual({ ...restored, towerId: 0 }, { coins: 0, cosmetics: ['necro-skeletor'], perk: true, equipped: 'skeletor', towerId: 0, skin: 'skeletor' });
  await model(restored.towerId, 'gnome-necro-skeletor');
  await openShop(); await wallet(0);
  await page.locator('[data-shop-skin="default"]').click();
  await page.waitForFunction(() => !gnomeward.game.profile.equippedNecroSkin);
  await model(restored.towerId, 'gnome-necro');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').equippedNecroSkin);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 0);
  checks.push('Purchases survive reload, newly placed Morrow wears the selected skin, and original look is free to restore');
  await closeShop();

  stage = 'small-screen shop controls';
  await page.evaluate(() => localStorage.removeItem('gnomeward-profile'));
  await page.reload(); await enter(); await openShop();
  await checkPhone(390); await checkPhone(320);
  checks.push('390px and 320px shops have no horizontal overflow and both purchase controls remain reachable');
  assert.deepEqual(errors, []);
  const summary = { ok: true, checks, round, restored, layouts, errors };
  await writeFile('playtest-results/shop-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('Round Coin shop browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/shop-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
