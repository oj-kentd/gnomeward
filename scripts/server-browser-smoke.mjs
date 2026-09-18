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
async function join(page, roomId, name, mode) {
  await page.locator('#player-name').fill(name);
  // Do not refresh manually: a host created after this page opened must appear
  // through discovery polling without reloading or sharing a room code.
  const button = page.locator(`#open-lobbies button[data-room-id="${roomId}"]`);
  await button.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `playtest-results/server-${mode}-open-lobbies-phone.png`, fullPage: true });
  await button.click();
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
  await third.page.waitForFunction(() => document.getElementById('lobbies-status').textContent.includes('No open lobbies'));
  assert.equal(await third.page.locator('#open-lobbies button').count(), 0);
  assert.equal(await first.page.locator('#room-code, #copy-code, #join-room').count(), 0);

  for (const mode of ['coop', 'pvp']) {
    stage = `${mode}: creating a room and joining from a phone`;
    await first.page.locator('#player-name').fill('First gardener');
    await first.page.locator('#mode').selectOption(mode);
    await first.page.locator('#create-room').click();
    await first.page.locator('#room').waitFor({ state: 'visible' });
    const roomId = await first.page.locator('#room').getAttribute('data-room-id');
    assert.ok(roomId);
    await first.page.waitForFunction(() => document.getElementById('room-title').textContent === 'First gardener’s lobby');
    // Hold a real, previously available listing in a third browser to exercise
    // the race where somebody clicks Join just after the last seat is taken.
    const openResponse = await third.page.request.get(`${baseURL}/lobbies`);
    const openListing = await openResponse.json();
    assert.equal(openListing.lobbies.length, 1);
    assert.equal(openListing.lobbies[0].roomId, roomId);
    await third.page.route('**/lobbies', route => route.fulfill({ json: openListing }));
    await third.page.locator('#refresh-lobbies').click();
    await third.page.locator(`#open-lobbies button[data-room-id="${roomId}"]`).waitFor();
    assert.match(await third.page.locator('#open-lobbies').textContent(), /First gardener’s lobby/);
    assert.match(await third.page.locator('#open-lobbies').textContent(), /1\/2 players/);
    await third.page.screenshot({ path: `playtest-results/server-${mode}-open-lobbies.png`, fullPage: true });
    await join(second.page, roomId, 'Phone gardener', mode);
    await first.page.waitForFunction(() => document.querySelectorAll('#players li').length === 2);
    assert.equal(await first.page.locator('.board').count(), mode === 'coop' ? 1 : 2);
    assert.equal(await second.page.locator('.board').count(), mode === 'coop' ? 1 : 2);
    assert.match(await first.page.locator('#connection-status').textContent(), /WebSocket is working/);

    stage = `${mode}: rejecting a third seat`;
    await third.page.locator('#player-name').fill('Late gardener');
    await third.page.locator(`#open-lobbies button[data-room-id="${roomId}"]`).click();
    await third.page.waitForFunction(() => document.getElementById('notice').dataset.state === 'error');
    assert.match(await third.page.locator('#notice').textContent(), /Someone else took that seat/);
    assert.equal(await third.page.locator('#lobby').isVisible(), true);
    await third.page.unroute('**/lobbies');
    await third.page.locator('#refresh-lobbies').click();
    await third.page.waitForFunction(() => document.querySelectorAll('#open-lobbies button').length === 0);
    assert.match(await third.page.locator('#lobbies-status').textContent(), /No open lobbies/);

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
      assert.equal(await second.page.locator('#room').getAttribute('data-room-id'), roomId);
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
    await third.page.locator('#refresh-lobbies').click();
    await third.page.waitForFunction(() => document.querySelectorAll('#open-lobbies button').length === 0);
  }
  stage = 'lobby discovery error and refresh recovery';
  await third.page.route('**/lobbies', route => route.fulfill({ status: 503, json: { error: 'Server restarting' } }));
  await third.page.locator('#refresh-lobbies').click();
  await third.page.waitForFunction(() => document.getElementById('lobbies-status').textContent.includes('Could not load open lobbies'));
  assert.equal(await third.page.locator('#create-room').isEnabled(), true);
  await third.page.unroute('**/lobbies');
  await third.page.locator('#refresh-lobbies').click();
  await third.page.waitForFunction(() => document.getElementById('lobbies-status').textContent.includes('No open lobbies'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, baseURL, checks: ['health', 'empty lobby list', 'co-op discovery', 'PvP discovery', 'automatic lobby refresh', 'join from visible lobby', 'stale-list competing join', 'filled lobbies disappear', 'automatic reconnect', 'ready starts server round', 'phone lobby and room layout', 'leave', 'discovery error and refresh recovery'], errors }, null, 2));
} catch (error) {
  console.error(`Server browser check failed at: ${stage}`);
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
