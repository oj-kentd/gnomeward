import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.SERVER_URL || 'http://localhost:2567';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const errors = [];
const contexts = [];
let stage = 'health check';
async function device(options = {}) {
  const context = await browser.newContext(options);
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => document.getElementById('health-status').textContent === 'Server ready');
  return { context, page };
}
async function join(page, code, name) {
  await page.locator('#player-name').fill(name);
  await page.locator('#room-code').fill(code);
  await page.locator('#join-room').click();
  await page.locator('#room').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#players li').length === 2);
}
try {
  await mkdir('playtest-results', { recursive: true });
  const first = await device({ viewport: { width: 1200, height: 1000 } });
  const health = await first.page.request.get(`${baseURL}/healthz`);
  assert.equal(health.status(), 200);
  assert.equal((await health.json()).protocol, 1);
  const second = await device({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const third = await device();

  for (const mode of ['coop', 'pvp']) {
    stage = `${mode}: creating a room and joining from a phone`;
    await first.page.locator('#player-name').fill('First gardener');
    await first.page.locator('#mode').selectOption(mode);
    await first.page.locator('#create-room').click();
    await first.page.locator('#room').waitFor({ state: 'visible' });
    const code = await first.page.locator('#room-title').textContent();
    assert.ok(code.length > 0);
    await join(second.page, code, 'Phone gardener');
    await first.page.waitForFunction(() => document.querySelectorAll('#players li').length === 2);
    assert.equal(await first.page.locator('.board').count(), mode === 'coop' ? 1 : 2);
    assert.equal(await second.page.locator('.board').count(), mode === 'coop' ? 1 : 2);
    assert.match(await first.page.locator('#connection-status').textContent(), /WebSocket is working/);

    stage = `${mode}: rejecting a third seat`;
    await third.page.locator('#room-code').fill(code);
    await third.page.locator('#join-room').click();
    await third.page.waitForFunction(() => document.getElementById('notice').dataset.state === 'error');
    assert.match(await third.page.locator('#notice').textContent(), /no available seat/);
    assert.equal(await third.page.locator('#lobby').isVisible(), true);

    if (mode === 'coop') {
      stage = 'recovering a briefly dropped phone connection';
      await second.context.setOffline(true);
      // Trigger the browser event used by the SDK as well: browser automation can
      // leave an existing WebSocket alive when its network is toggled offline.
      await second.page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await second.page.waitForFunction(() => document.getElementById('connection-status').textContent.includes('reconnecting'));
      assert.equal(await second.page.locator('#ready').isDisabled(), true);
      await second.context.setOffline(false);
      await second.page.waitForFunction(() => document.getElementById('connection-status').textContent.includes('Reconnected'));
      assert.equal(await second.page.locator('#room-title').textContent(), code);
      await first.page.waitForFunction(() => !document.getElementById('players').textContent.includes('Reconnecting'));
    }

    stage = `${mode}: both players ready, authoritative round starts`;
    await first.page.locator('#ready').click();
    await first.page.waitForFunction(() => document.getElementById('ready').textContent.includes('waiting'));
    assert.match(await second.page.locator('.round-state').first().textContent(), /Round 0/);
    await second.page.locator('#ready').click();
    await first.page.waitForFunction(() => [...document.querySelectorAll('.round-state')].every(el => /Round 1 · wave/.test(el.textContent)));
    await second.page.waitForFunction(() => [...document.querySelectorAll('.round-state')].every(el => /Round 1 · wave/.test(el.textContent)));
    assert.equal(await second.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await first.page.screenshot({ path: `playtest-results/server-${mode}-desktop.png`, fullPage: true });
    await second.page.screenshot({ path: `playtest-results/server-${mode}-phone.png`, fullPage: true });

    stage = `${mode}: leaving the test room`;
    await second.page.locator('#leave').click();
    await first.page.locator('#leave').click();
    await second.page.locator('#lobby').waitFor({ state: 'visible' });
    await first.page.locator('#lobby').waitFor({ state: 'visible' });
    assert.equal(await first.page.locator('#create-room').isEnabled(), true);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, baseURL, checks: ['health', 'co-op room', 'PvP room', 'two independent clients', 'third-seat rejection', 'automatic reconnect', 'ready starts server round', 'phone layout', 'leave'], errors }, null, 2));
} catch (error) {
  console.error(`Server browser check failed at: ${stage}`);
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
