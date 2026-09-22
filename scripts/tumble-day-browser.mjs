import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';

// Fixed wall-clock dates exercise Eastern sale boundaries while RAF and timers
// continue normally. Wallet amounts are explicit browser-test fixtures.
const SALE_START = '2026-09-22T04:00:00Z';
const SALE_END = '2026-09-29T04:00:00Z';
const NEXT_YEAR = '2027-09-22T04:00:00Z';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.clock.setFixedTime(new Date(SALE_START));
page.setDefaultTimeout(45000);
const errors = [], checks = [], offers = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'launch-week shop pricing';
const progress = setInterval(() => console.log('Tumble Day browser:', stage), 15000); progress.unref();
const card = page.locator('[data-shop-item="tumble-speed"]');
const buy = card.locator('[data-shop-buy="tumble-speed"]');
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
async function openShop() { await page.locator('#coin-shop-button').click(); await page.locator('#round-coin-shop').waitFor(); }
async function closeShop() { await page.locator('[aria-label="Close Round Coin shop"]').click(); }
async function seedWallet(coins) {
  await page.evaluate(coins => { gnomeward.game.profile.roundCoins = coins; }, coins);
}
async function offer(cost, missing) {
  await page.waitForFunction(cost => {
    const button = document.querySelector('[data-shop-buy="tumble-speed"]');
    return button && Number(button.textContent.replace(/[^0-9]/g, '')) === cost;
  }, cost);
  if (missing > 0) {
    assert.equal(await buy.isDisabled(), true);
    const shortage = await card.locator('.coin-shortage').innerText();
    assert.equal(Number(shortage.replace(/[^0-9]/g, '')), missing);
  } else assert.equal(await buy.isEnabled(), true);
  const note = await card.locator('.tumble-sale-note').innerText();
  assert.match(note, /Tumble Day/i);
  offers.push({ cost, missing, note, text: await card.innerText() });
}
async function freshCollection() {
  await page.evaluate(() => localStorage.removeItem('gnomeward-profile'));
  await page.reload(); await enter();
}

try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enter();
  await seedWallet(49); await openShop(); await offer(50, 1);
  assert.match(await card.innerText(), /1[,.]?000/);
  assert.match(await card.locator('.tumble-sale-note').innerText(), /Sep(?:t(?:ember)?)?\.?\s*22/i);
  assert.match(await card.locator('.tumble-sale-note').innerText(), /28/);
  await buy.dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => ({ coins: gnomeward.game.profile.roundCoins, owned: gnomeward.game.profile.tumbleSpeedUnlocked })),
    { coins: 49, owned: false });
  await closeShop(); await seedWallet(1000); await openShop(); await offer(50, 0);

  stage = 'stale sale button and live open-shop expiry';
  // Simulate the boundary occurring during one synchronous purchase dispatch.
  // Only Date.now changes during this call; the displayed 50-coin node remains
  // the real shop button, and the production handler must re-evaluate its price.
  const stale = await page.evaluate(end => {
    const button = document.querySelector('[data-shop-buy="tumble-speed"]');
    const shown = button.textContent;
    const clockNow = Date.now;
    try { Date.now = () => end; button.click(); }
    finally { Date.now = clockNow; }
    return { shown, coins: gnomeward.game.profile.roundCoins, owned: gnomeward.game.profile.tumbleSpeedUnlocked };
  }, Date.parse(SALE_END));
  assert.match(stale.shown, /50/); assert.equal(stale.coins, 1000); assert.equal(stale.owned, false);
  await page.clock.setFixedTime(new Date(SALE_END));
  await offer(1000, 0);
  assert.equal(await page.locator('#game-dialog').evaluate(node => node.open), true, 'expiry refreshes the already-open shop');
  checks.push('Launch-week price is 50, stale sale buttons cannot charge an unexpected higher price, and an open shop rolls to 1000 at September 29 midnight Eastern');

  stage = 'regular-price shortage and exact purchase';
  await closeShop(); await seedWallet(999); await openShop(); await offer(1000, 1);
  await buy.dispatchEvent('click');
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 999);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.tumbleSpeedUnlocked), false);
  await closeShop(); await seedWallet(1000); await openShop(); await offer(1000, 0);
  await buy.click();
  await page.waitForFunction(() => gnomeward.game.profile.tumbleSpeedUnlocked && gnomeward.game.profile.roundCoins === 0);
  assert.match(await card.locator('.shop-owned').innerText(), /Active forever.*3\s*[×x].*attack speed/i);
  checks.push('999 coins cannot buy outside the event; 1000 coins buys the permanent perk exactly');

  stage = 'launch purchase remains permanent after expiry and reload';
  await page.clock.setFixedTime(new Date(SALE_START)); await freshCollection();
  await seedWallet(50); await openShop(); await offer(50, 0); await buy.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').tumbleSpeedUnlocked === true);
  await page.clock.setFixedTime(new Date(SALE_END)); await page.reload(); await enter();
  assert.deepEqual(await page.evaluate(() => ({ coins: gnomeward.game.profile.roundCoins, owned: gnomeward.game.profile.tumbleSpeedUnlocked })),
    { coins: 0, owned: true });
  await openShop();
  assert.equal(await buy.count(), 0);
  assert.match(await card.locator('.shop-owned').innerText(), /Active forever/);
  checks.push('A 50-coin launch purchase remains owned after the sale expires and the page reloads');

  stage = 'annual return and smallest phone purchase';
  await page.clock.setFixedTime(new Date(NEXT_YEAR)); await freshCollection();
  await seedWallet(50); await openShop(); await offer(50, 0);
  await page.clock.setFixedTime(new Date('2027-09-29T04:00:00Z'));
  await offer(1000, 950);
  await page.clock.setFixedTime(new Date(NEXT_YEAR));
  await offer(50, 0);
  await page.setViewportSize({ width: 320, height: 568 }); await settled();
  await buy.scrollIntoViewIfNeeded();
  const bounds = await buy.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 321 && bounds.y >= 0 && bounds.y + bounds.height <= 569);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.match(await buy.innerText(), /50.*Round Coins/i);
  await page.screenshot({ path: 'playtest-results/tumble-day-phone.png' });
  await buy.click();
  await page.waitForFunction(() => gnomeward.game.profile.tumbleSpeedUnlocked && gnomeward.game.profile.roundCoins === 0);
  checks.push('The 50-coin Tumble Day offer returns September 22, 2027 and remains clear and purchasable at 320px');
  assert.deepEqual(errors, []);
  const summary = { ok: true, checks, offers, stale, phonePurchase: bounds, errors };
  await writeFile('playtest-results/tumble-day-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('Tumble Day browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/tumble-day-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
