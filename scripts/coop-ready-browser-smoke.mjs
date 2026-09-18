import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { Client } from '@colyseus/sdk';
import { startServer } from '../server/index.js';
import { readConfig } from '../server/config.js';
import { enterGarden } from './browser-helpers.mjs';

// A private authoritative server lets the fixture finish two rounds quickly.
// Browser commands and received snapshots still travel over real WebSockets.
const baseURL = process.env.PLAYTEST_URL || 'http://127.0.0.1:5175';
const directory = await mkdtemp(join(tmpdir(), 'gnomeward-ready-browser-'));
const app = await startServer(readConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: directory,
  MAX_ROOMS: '1', ALLOWED_ORIGINS: new URL(baseURL).origin }));
const serverURL = `http://127.0.0.1:${app.port}`;
let browser, peer, page, snapshot, stage = 'loading the garden';
const errors = [], commandErrors = [];
const progress = setInterval(() => console.log('Co-op readiness check:', stage), 15000);
progress.unref();
async function until(check, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function sharedAuto(enabled) {
  await until(() => snapshot?.autoStart === enabled, 'teammate auto state');
  await page.waitForFunction(value => gnomeward.state.multiplayer.autoStart === value, enabled);
  assert.equal(await page.locator('#auto-button').getAttribute('aria-pressed'), String(enabled));
}
async function finishRound(room) {
  assert.equal(room.match.board().status, 'wave');
  // Only this trusted server fixture shortens combat. Ordinary Match.step/Game
  // completion awards the round and creates the shared five-second countdown.
  const game = room.match.board();
  game._queue = []; game.enemies = [];
  room.match.step(.05);
  assert.equal(game.status, 'planning');
  assert.equal(room.match.autoCountdown, 5);
  room.sendSnapshot();
  await page.waitForFunction(() => gnomeward.game.status === 'planning' && gnomeward.state.multiplayer.autoCountdown > 0);
}
async function phoneFits() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  for (const selector of ['#start-button', '#auto-button', '#pause-button']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845, `${selector} fits the phone screen`);
  }
}
try {
  await mkdir('playtest-results', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  // Test-only connection configuration, equivalent to VITE_MULTIPLAYER_URL.
  // No gameplay state, resources, readiness, or snapshots are edited here.
  await page.evaluate(url => { gnomeward.multiplayer.url = url; }, serverURL);
  await page.locator('#coop-button').click();
  await page.locator('#coop-name').fill('Ready gardener');
  await page.locator('#coop-map').selectOption('meadow');
  await page.locator('[data-coop-create]').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer?.roomId);
  const roomId = await page.evaluate(() => gnomeward.state.multiplayer.roomId);
  const room = [...app.rooms].find(room => room.roomId === roomId);
  assert.ok(room);
  if (await page.locator('#game-dialog').isVisible()) await page.locator('#game-dialog [data-close]').first().click();
  peer = await new Client(serverURL).joinById(roomId, { protocol: 1, name: 'Ready teammate' });
  peer.onMessage('snapshot', value => { snapshot = value; });
  peer.onMessage('command-error', value => commandErrors.push(value.message));
  peer.send('snapshot');
  await page.waitForFunction(() => gnomeward.state.multiplayer.players.length === 2);

  stage = 'shared auto option still requires both players for round one';
  assert.equal(await page.locator('#auto-button').isVisible(), true);
  await page.locator('#auto-button').click(); await sharedAuto(true);
  await delay(400);
  assert.equal(room.match.board().wave, 0);
  assert.equal(room.match.autoCountdown, null);

  stage = 'ready is visible and can be withdrawn';
  await page.locator('#start-button').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer.ready);
  assert.equal(await page.locator('#coop-readiness .readiness-player').first().evaluate(node => node.classList.contains('is-ready')), true);
  assert.equal(await page.locator('#start-button').isEnabled(), true);
  assert.match(await page.locator('#start-button').innerText(), /ready|waiting/i);
  await page.screenshot({ path: 'playtest-results/coop-ready-desktop.png' });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => !gnomeward.state.multiplayer.ready);
  assert.equal(await page.locator('#coop-readiness .readiness-player').first().evaluate(node => node.classList.contains('is-ready')), false);
  peer.send('command', { action: 'ready' });
  await page.waitForFunction(() => gnomeward.state.multiplayer.players.find(p => p.id !== gnomeward.state.multiplayer.sessionId)?.ready);
  assert.match(await page.locator('#coop-status').innerText(), /ready/i);
  assert.equal(await page.locator('#start-button').evaluate(node => node.classList.contains('teammate-ready')), true);
  assert.match(await page.locator('#coop-readiness .is-your-turn').innerText(), /your turn/i);
  assert.equal(room.match.board().wave, 0, 'the teammate alone cannot start');
  await page.setViewportSize({ width: 390, height: 844 });
  await phoneFits();
  await page.screenshot({ path: 'playtest-results/coop-ready-phone.png' });
  peer.send('command', { action: 'ready', ready: false });
  await page.waitForFunction(() => !gnomeward.state.multiplayer.players.find(p => p.id !== gnomeward.state.multiplayer.sessionId)?.ready);
  assert.match(await page.locator('#coop-status').innerText(), /building/i);
  assert.equal(await page.locator('#start-button').evaluate(node => node.classList.contains('teammate-ready')), false);
  assert.equal(await page.locator('#coop-readiness .is-your-turn').count(), 0);
  await page.setViewportSize({ width: 960, height: 720 });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer.ready);
  peer.send('command', { action: 'ready' });
  await page.waitForFunction(() => gnomeward.game.wave === 1 && gnomeward.game.status === 'wave');
  assert.equal(await page.locator('#coop-readiness .readiness-player').first().evaluate(node => node.classList.contains('is-ready')), false);

  await page.locator('#speed-button').click();
  await page.waitForFunction(() => gnomeward.state.speed === 2);
  await page.locator('#speed-button').click();
  await page.waitForFunction(() => gnomeward.state.speed === 3);

  stage = 'round completion starts a shared countdown and pause freezes it';
  await finishRound(room);
  await page.locator('#pause-button').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer.manualPause);
  const frozen = room.match.autoCountdown;
  assert.ok(frozen > 0 && frozen <= 5);
  await delay(800);
  assert.equal(room.match.autoCountdown, frozen);
  await page.waitForFunction(value => gnomeward.state.multiplayer.autoCountdown === value, frozen);
  assert.equal(snapshot.autoCountdown, frozen);
  await page.setViewportSize({ width: 390, height: 844 });
  await phoneFits();
  assert.match(await page.locator('#auto-button').innerText(), /Held.*\d/i);
  assert.equal(await page.locator('#auto-progress').isVisible(), true);
  await page.screenshot({ path: 'playtest-results/coop-auto-paused-phone.png' });

  stage = 'either gardener can cancel or enable the shared timer';
  peer.send('command', { action: 'auto', enabled: false }); await sharedAuto(false);
  assert.equal(room.match.autoCountdown, null);
  await page.locator('#auto-button').click(); await sharedAuto(true);
  assert.equal(room.match.autoCountdown, 5);
  await delay(400);
  assert.equal(room.match.autoCountdown, 5, 'enabling auto while paused cannot consume build time');
  await page.setViewportSize({ width: 960, height: 720 });

  stage = 'resuming gives both players a real five-second build window';
  await page.locator('#pause-button').click();
  await until(() => !room.match.manualPause, 'unpause');
  const resumedAt = Date.now();
  await until(() => room.match.board().wave === 2, 'automatic round two', 9000);
  const elapsed = (Date.now() - resumedAt) / 1000;
  assert.ok(elapsed > 4.3 && elapsed < 7, `countdown uses real seconds, elapsed ${elapsed}`);
  await page.waitForFunction(() => gnomeward.game.wave === 2 && gnomeward.state.multiplayer.autoCountdown === null);
  await until(() => snapshot?.boards[0].state.wave === 2, 'teammate sees round two');

  stage = 'turning auto off cancels the next round for both players';
  await finishRound(room);
  await page.locator('#auto-button').click(); await sharedAuto(false);
  assert.equal(room.match.autoCountdown, null);
  await delay(5300);
  assert.equal(room.match.board().wave, 2);
  assert.equal(room.match.board().status, 'planning');
  assert.equal(snapshot.autoCountdown, null);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer.ready);
  peer.send('command', { action: 'ready' });
  await page.waitForFunction(() => gnomeward.game.wave === 3 && gnomeward.game.status === 'wave');
  assert.deepEqual(commandErrors, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['ready highlight', 'withdraw readiness', 'teammate readiness', 'shared auto', 'manual first round', 'five real seconds at 3× game speed', 'pause freezes countdown', 'either player toggles auto', 'cancel prevents next round', 'manual ready after cancellation', 'phone controls fit'], countdownSeconds: elapsed, errors }, null, 2));
} catch (error) {
  console.error(`Co-op readiness failed at: ${stage}`);
  if (page) {
    await page.screenshot({ path: 'playtest-results/coop-ready-failure.png' }).catch(() => {});
    console.error(await page.evaluate(() => ({ multiplayer: window.gnomeward?.state.multiplayer, start: document.getElementById('start-button')?.outerHTML, auto: document.getElementById('auto-button')?.outerHTML })).catch(() => null));
  }
  throw error;
} finally {
  clearInterval(progress);
  if (peer) { peer.reconnection.enabled = false; await peer.leave().catch(() => {}); }
  await page?.evaluate(async () => {
    const room = window.gnomeward?.multiplayer.activeRoom;
    if (room) { room.reconnection.enabled = false; await room.leave(); }
  }).catch(() => {});
  await browser?.close();
  await app.stop();
  await rm(directory, { recursive: true, force: true });
}
