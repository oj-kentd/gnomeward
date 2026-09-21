import { enterGarden } from './browser-helpers.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.PLAYTEST_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const contexts = [], errors = [];
const desktopViewport = { width: 1080, height: 720 };
let stage = 'loading gardens';
const progress = setInterval(() => console.log(`Co-op browser check: ${stage}`), 15000);
progress.unref();
const profile = { unlocks: ['gravity'], bestRounds: { meadow: 23, quarry: 7 } };

async function device() {
  const context = await browser.newContext({ viewport: desktopViewport, deviceScaleFactor: 1 });
  contexts.push(context);
  await context.addInitScript(value => {
    if (!localStorage.getItem('gnomeward-profile')) localStorage.setItem('gnomeward-profile', JSON.stringify(value));
  }, profile);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 0);
  return { context, page, profile: await page.evaluate(() => structuredClone(gnomeward.game.profile)) };
}
async function point(page, x, z, y = 0) {
  return page.evaluate(({ x, z, y }) => {
    const world = gnomeward.renderer, p = world.camera.position.clone().set(x, y, z).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  }, { x, z, y });
}
async function closeDialog(page) {
  if (await page.locator('#game-dialog').isVisible()) await page.locator('#game-dialog [data-close]').first().click();
}
async function place(page, type, x, z) {
  await closeDialog(page);
  await page.locator(`[data-tower="${type}"]`).click();
  const target = await point(page, x, z);
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(({ type, x, z }) => gnomeward.game.towers.some(t => t.type === type && Math.hypot(t.x - x, t.z - z) < .15), { type, x, z });
  if (await page.locator('[data-close-upgrades]').isVisible()) await page.locator('[data-close-upgrades]').click();
}
async function select(page, x, z) {
  const target = await point(page, x, z, 1.2);
  await page.mouse.click(target.x, target.y);
  await page.locator('#selection-panel').waitFor({ state: 'visible' });
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
}

try {
  await mkdir('playtest-results', { recursive: true });
  const host = await device(), guest = await device();
  const a = host.page, b = guest.page;
  stage = 'creating a public co-op lobby inside the game';
  await a.locator('#coop-button').click();
  await a.locator('#coop-name').fill('Parent gardener');
  await a.locator('#coop-map').selectOption('meadow');
  await a.locator('[data-coop-create]').click();
  await a.waitForFunction(() => gnomeward.state.multiplayer?.roomId);
  const roomId = await a.evaluate(() => gnomeward.state.multiplayer.roomId);
  await closeDialog(a);
  assert.equal(await a.locator('#start-button').isDisabled(), true, 'host cannot start without a teammate');
  assert.equal(await a.evaluate(() => gnomeward.game.gold), 325);
  assert.equal(await a.evaluate(() => gnomeward.game.isUnlocked('gravity')), false, 'solo unlocks are not imported into co-op');

  stage = 'joining a visible lobby inside the game';
  await b.locator('#coop-button').click();
  await b.locator('#coop-name').fill('Child gardener');
  await b.locator(`[data-coop-join="${roomId}"]`).waitFor({ state: 'visible' });
  assert.match(await b.locator('#coop-lobbies').textContent(), /Parent gardener/);
  await b.setViewportSize({ width: 390, height: 844 });
  await noOverflow(b);
  await b.screenshot({ path: 'playtest-results/coop-game-lobby-phone.png', fullPage: true });
  await b.locator(`[data-coop-join="${roomId}"]`).click();
  await b.waitForFunction(() => gnomeward.state.multiplayer?.players.length === 2);
  await a.waitForFunction(() => gnomeward.state.multiplayer?.players.length === 2);
  await closeDialog(b);
  await b.setViewportSize(desktopViewport);
  assert.equal(await b.evaluate(() => gnomeward.game.gold), 325);
  assert.equal(await a.locator('#map-button').isDisabled(), true);
  assert.equal(await b.locator('#speed-button').isDisabled(), true);
  assert.equal(await a.locator('#auto-button').isVisible(), true, 'shared automatic rounds are available in co-op');
  assert.equal(await a.locator('#auto-button').getAttribute('aria-pressed'), 'false');

  stage = 'placing authoritative shared defenses with separate wallets';
  await place(a, 'sprout', -5, 2);
  await b.waitForFunction(() => gnomeward.game.towers.length === 1);
  assert.equal(await a.evaluate(() => gnomeward.game.gold), 225);
  assert.equal(await b.evaluate(() => gnomeward.game.gold), 325);
  await place(b, 'spore', -5, -2);
  await a.waitForFunction(() => gnomeward.game.towers.length === 2);
  assert.equal(await b.evaluate(() => gnomeward.game.gold), 165);
  assert.equal(await a.evaluate(() => gnomeward.game.gold), 225);
  for (const page of [a, b]) {
    await page.waitForFunction(() => [...gnomeward.renderer.entities.keys()].filter(key => key.startsWith('t')).length === 2);
  }
  const towers = await a.evaluate(() => gnomeward.game.towers.map(t => ({ id: t.id, ownerId: t.ownerId, type: t.type })));
  assert.deepEqual(await b.evaluate(() => gnomeward.game.towers.map(t => ({ id: t.id, ownerId: t.ownerId, type: t.type }))), towers);
  assert.notEqual(towers[0].ownerId, towers[1].ownerId);

  stage = 'teammate ownership protects upgrades, targeting and selling';
  await select(b, -5, 2);
  assert.equal(await b.locator('[data-sell]').isDisabled(), true);
  assert.equal(await b.locator('[data-targeting]').isDisabled(), true);
  assert.equal(await b.locator('[data-upgrade]:enabled').count(), 0);
  assert.match(await b.locator('.tower-owner-note').textContent(), /Parent gardener/);
  const ownershipError = await b.evaluate(towerId => new Promise((resolve, reject) => {
    const room = gnomeward.multiplayer.activeRoom;
    const timeout = setTimeout(() => { unlisten(); reject(new Error('The server did not reject the teammate sell command')); }, 5000);
    const unlisten = room.onMessage('command-error', error => { clearTimeout(timeout); unlisten(); resolve(error.message); });
    room.send('command', { action: 'sell', towerId });
  }), towers[0].id);
  assert.match(ownershipError, /own gnomes/);
  assert.equal(await b.evaluate(() => gnomeward.game.towers.length), 2);
  await b.locator('[data-close-upgrades]').click();
  await select(a, -5, 2);
  assert.equal(await a.locator('[data-targeting]').isEnabled(), true);
  await a.locator('[data-targeting]').click();
  await b.waitForFunction(towerId => gnomeward.game.towers.find(t => t.id === towerId)?.targeting === 'last', towers[0].id);
  await a.locator('[data-close-upgrades]').click();

  stage = 'both players must ready before the shared round starts';
  await a.locator('#start-button').click();
  await a.waitForFunction(() => gnomeward.state.multiplayer.players.find(p => p.id === gnomeward.state.multiplayer.sessionId)?.ready);
  assert.equal(await b.evaluate(() => gnomeward.game.wave), 0);
  assert.equal(await a.locator('#start-button').isEnabled(), true, 'ready can be withdrawn until the teammate starts');
  await b.waitForFunction(() => document.getElementById('start-button').classList.contains('teammate-ready'));
  assert.equal(await b.locator('#start-button').evaluate(node => node.classList.contains('teammate-ready')), true);
  await b.setViewportSize({ width: 390, height: 844 });
  await noOverflow(b);
  const readyToastOverlap = await b.evaluate(() => {
    const toast = document.querySelector('#toast-stack .toast:last-child');
    if (!toast) return false;
    const notice = toast.getBoundingClientRect(), readiness = document.getElementById('coop-readiness').getBoundingClientRect();
    return notice.bottom > readiness.top && notice.top < readiness.bottom;
  });
  assert.equal(readyToastOverlap, false, 'phone readiness remains clear of teammate notifications');
  await b.screenshot({ path: 'playtest-results/coop-game-ready-phone.png', fullPage: true });
  await b.setViewportSize(desktopViewport);
  await b.locator('#start-button').click();
  for (const page of [a, b]) {
    await page.waitForFunction(() => gnomeward.game.wave === 1 && gnomeward.game.status === 'wave' && gnomeward.game.enemies.length > 0);
    await page.waitForFunction(() => [...gnomeward.renderer.entities.keys()].some(key => key.startsWith('e')));
  }
  stage = 'host speed and teammate pause affect both gardens';
  await a.locator('#speed-button').click();
  await b.waitForFunction(() => gnomeward.state.speed === 2);
  await b.locator('#pause-button').click();
  await a.waitForFunction(() => gnomeward.state.multiplayer.manualPause);
  const pausedTime = await a.evaluate(() => gnomeward.game.time);
  await a.waitForTimeout(500);
  assert.equal(await a.evaluate(() => gnomeward.game.time), pausedTime);
  await a.locator('#pause-button').click();
  await b.waitForFunction(() => !gnomeward.state.multiplayer.manualPause);

  stage = 'opening a menu does not stop the remote game';
  await a.locator('#help-button').click();
  const beforeMenu = await b.evaluate(() => gnomeward.game.time);
  await b.waitForFunction(time => gnomeward.game.time > time + .4, beforeMenu);
  assert.equal(await a.locator('#game-dialog').isVisible(), true);
  await closeDialog(a);
  await a.screenshot({ path: 'playtest-results/coop-game-desktop.png', fullPage: true });
  await b.setViewportSize({ width: 390, height: 844 });
  await noOverflow(b);
  await b.screenshot({ path: 'playtest-results/coop-game-phone.png', fullPage: true });

  stage = 'browser reload resumes the same room and owned defenses';
  const reloadSession = await b.evaluate(() => gnomeward.state.multiplayer.sessionId);
  await b.reload();
  assert.equal(await enterGarden(b), false, 'an active co-op session resumes without pressing Play again');
  await b.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.state.multiplayer?.connected);
  assert.equal(await b.evaluate(() => gnomeward.state.multiplayer.sessionId), reloadSession);
  assert.equal(await b.evaluate(() => gnomeward.state.multiplayer.roomId), roomId);
  assert.deepEqual(await b.evaluate(() => gnomeward.game.towers.map(t => ({ id: t.id, ownerId: t.ownerId, type: t.type }))), towers);

  stage = 'connection drop pauses both and restores the same player';
  const guestSession = await b.evaluate(() => gnomeward.state.multiplayer.sessionId);
  await guest.context.setOffline(true);
  await b.evaluate(() => window.dispatchEvent(new Event('offline')));
  await b.waitForFunction(() => gnomeward.state.multiplayer.reconnecting);
  await a.waitForFunction(() => gnomeward.state.multiplayer.players.some(p => !p.connected));
  const disconnectedTime = await a.evaluate(() => gnomeward.game.time);
  await a.waitForTimeout(400);
  assert.equal(await a.evaluate(() => gnomeward.game.time), disconnectedTime);
  await guest.context.setOffline(false);
  await b.waitForFunction(() => gnomeward.state.multiplayer.connected && !gnomeward.state.multiplayer.reconnecting);
  await a.waitForFunction(() => gnomeward.state.multiplayer.players.every(p => p.connected));
  assert.equal(await b.evaluate(() => gnomeward.state.multiplayer.sessionId), guestSession);
  assert.equal(await b.evaluate(() => gnomeward.state.multiplayer.roomId), roomId);
  assert.deepEqual(await b.evaluate(() => gnomeward.game.towers.map(t => ({ id: t.id, ownerId: t.ownerId, type: t.type }))), towers);

  stage = 'earning upgrade points through real shared combat';
  if (await a.evaluate(() => gnomeward.state.speed !== 3)) await a.locator('#speed-button').click();
  await b.waitForFunction(() => gnomeward.state.speed === 3);
  for (let round = 0; round < 4 && await a.evaluate(() => gnomeward.game.points < 10); round++) {
    await a.waitForFunction(() => gnomeward.game.points >= 10 || gnomeward.game.status === 'planning', null, { timeout: 90000 });
    if (await a.evaluate(() => gnomeward.game.points >= 10)) break;
    await a.locator('#start-button').click();
    await b.locator('#start-button').click();
    await a.waitForFunction(() => gnomeward.game.status === 'wave');
  }
  await a.waitForFunction(() => gnomeward.game.points >= 10, null, { timeout: 90000 });
  stage = 'buying an upgrade replicates levels and charges only its owner';
  await a.locator('#pause-button').click();
  await b.waitForFunction(() => gnomeward.state.multiplayer.manualPause);
  const beforeUpgrade = await a.evaluate(() => gnomeward.game.points);
  const guestPoints = await b.evaluate(() => gnomeward.game.points);
  await select(a, -5, 2);
  await a.locator('[data-upgrade="0"]').click();
  for (const page of [a, b]) await page.waitForFunction(towerId => gnomeward.game.towers.find(t => t.id === towerId)?.levels[0] === 1, towers[0].id);
  assert.equal(await a.evaluate(() => gnomeward.game.points), beforeUpgrade - 10);
  assert.equal(await b.evaluate(() => gnomeward.game.points), guestPoints);
  await a.screenshot({ path: 'playtest-results/coop-game-upgraded.png', fullPage: true });
  await a.locator('[data-close-upgrades]').click();

  stage = 'completed co-op rounds credit each permanent wallet exactly once';
  const receipts = [];
  const completedWaves = await a.evaluate(() => gnomeward.game.completedWaves);
  assert.ok(Number.isSafeInteger(completedWaves) && completedWaves >= 1, 'real combat completed at least one round');
  for (const device of [host, guest]) {
    const reward = await device.page.evaluate(() => {
      const { game, state } = gnomeward, multiplayer = state.multiplayer;
      const player = multiplayer.players.find(player => player.id === multiplayer.sessionId);
      return { completedWaves: game.completedWaves, supported: multiplayer.shopSupported,
        earned: multiplayer.roundCoinsEarned, receiptKey: multiplayer.receiptKey,
        playerEarned: player.roundCoinsEarned, playerReceipt: player.receiptKey };
    });
    assert.equal(reward.supported, true, 'the released server supports permanent shop rewards');
    assert.equal(reward.completedWaves, completedWaves, 'both browsers received the completed round');
    assert.equal(reward.earned, completedWaves, 'one permanent coin per actual completed round, including after reconnect');
    assert.equal(reward.playerEarned, completedWaves, 'the player receipt agrees with the server board');
    assert.match(reward.receiptKey, /^[a-zA-Z0-9_.:-]{1,160}$/);
    assert.equal(reward.receiptKey, reward.playerReceipt, 'the adapter uses this player’s server receipt');
    assert.equal(Object.hasOwn(device.profile.coopRoundReceipts, reward.receiptKey), false, 'a new room gets a new receipt');
    receipts.push(reward.receiptKey);
    // Compare every profile field, allowing exactly the earned coins and this
    // room's cumulative receipt. Solo unlocks, records and purchases must match.
    device.expectedProfile = { ...device.profile,
      roundCoins: device.profile.roundCoins + completedWaves,
      coopRoundReceipts: { ...device.profile.coopRoundReceipts, [reward.receiptKey]: completedWaves } };
    assert.deepEqual(await device.page.evaluate(() => gnomeward.state.shopProfile), device.expectedProfile);
    assert.deepEqual(await device.page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile'))), device.expectedProfile,
      'earned coins and the anti-duplicate receipt are persisted before leaving');
  }
  assert.notEqual(receipts[0], receipts[1], 'each player has a distinct reward receipt');

  stage = 'leaving restores all solo progression plus earned permanent coins';
  for (const device of [guest, host]) {
    if (device === host) {
      // A teammate leaving ends the match and opens the host's result dialog.
      await device.page.waitForFunction(() => gnomeward.state.multiplayer?.result);
    } else await device.page.locator('#coop-button').click();
    await device.page.locator('[data-coop-leave]').click();
    await device.page.waitForFunction(() => !gnomeward.state.multiplayer?.roomId);
    assert.deepEqual(await device.page.evaluate(() => gnomeward.game.profile), device.expectedProfile);
    assert.equal(await device.page.evaluate(() => gnomeward.game.isUnlocked('gravity')), true);
    assert.equal(await device.page.locator('#map-button').isEnabled(), true);
    const stored = await device.page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile')));
    assert.deepEqual(stored, device.expectedProfile, 'leaving neither loses nor duplicates permanent round rewards');
    assert.deepEqual(stored.unlocks, profile.unlocks);
    assert.equal(stored.bestRounds.meadow, 23);
    assert.equal(stored.bestRounds.quarry, 7);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, baseURL, checks: ['in-game public co-op lobby', 'two real players', 'shared rendered defenses', 'separate wallets', 'server-enforced tower ownership', 'both-player readiness', 'shared enemies', 'host speed', 'shared pause', 'menus keep remote game running', 'reload resumes same seat', 'same-seat reconnect', 'earned-point upgrade replication', 'one saved permanent coin per completed round', 'distinct reconnect-safe player receipts', 'all other solo progression preserved', 'phone lobby and game layout'], errors }, null, 2));
} catch (error) {
  console.error(`Co-op browser check failed at: ${stage}`);
  console.error(error);
  for (const [index, context] of contexts.entries()) {
    const page = context.pages()[0];
    if (page) {
      await page.screenshot({ path: `playtest-results/coop-game-failure-${index}.png`, fullPage: true }).catch(() => {});
      console.error(await page.evaluate(() => ({ multiplayer: window.gnomeward?.state.multiplayer, game: window.gnomeward ? { wave: gnomeward.game.wave, gold: gnomeward.game.gold, points: gnomeward.game.points, status: gnomeward.game.status, towers: gnomeward.game.towers.map(t => ({ id: t.id, ownerId: t.ownerId, type: t.type, levels: t.levels })) } : null, notice: document.getElementById('toast-stack')?.textContent })).catch(() => null));
    }
  }
  throw error;
} finally {
  clearInterval(progress);
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
