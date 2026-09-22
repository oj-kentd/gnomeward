import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { enterGarden } from './browser-helpers.mjs';

// Wallets and placed defenders are explicit fixtures. Purchases, saves, upgrade
// previews and incoming server snapshots go through the real application UI.
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], checks = [], selections = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'opening a fresh collection';
const progress = setInterval(() => console.log('Turbo Tumble browser:', stage), 15000); progress.unref();
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} versus ${expected}`);
const precise = value => Number(value).toFixed(1).replace(/\.0$/, '');
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
async function sentLoadout() {
  await page.evaluate(() => {
    delete window.__tumbleConnection;
    gnomeward.multiplayer.browse = async () => [];
    gnomeward.multiplayer.connect = async options => { window.__tumbleConnection = options; };
  });
  await page.locator('#coop-button').click();
  await page.locator('#coop-name').fill('Turbo tester');
  await page.locator('[data-coop-create]').click();
  await page.waitForFunction(() => !!window.__tumbleConnection);
  const loadout = await page.evaluate(() => window.__tumbleConnection.loadout);
  await page.locator('[aria-label="Close co-op lobbies"]').click();
  return loadout;
}
async function selected(towerId, boosted, owned = true) {
  await page.evaluate(id => { gnomeward.state.selectedTowerId = id; }, towerId);
  await settled();
  await page.waitForFunction(() => document.querySelector('#selection-panel .selected-heading h3')?.textContent === 'Tumble');
  const stats = await page.evaluate(id => {
    const game = gnomeward.game, tower = game.towers.find(tower => tower.id === id);
    return { current: game.getStats(tower), next: game.getStats({ ...tower, levels: [tower.levels[0] + 1] }), level: tower.levels[0] };
  }, towerId);
  const speed = page.locator('#selection-panel .unit-summary span').filter({ hasText: 'attacks/s' }).locator('b');
  assert.equal(await speed.innerText(), precise(stats.current.attackSpeed), 'selection shows actual attack rate');
  const preview = await page.locator('#selection-panel .upgrade-copy small').innerText();
  assert.ok(preview.includes(`Attacks/s ${precise(stats.current.attackSpeed)} → ${precise(stats.next.attackSpeed)}`), 'preview uses the same permanent multiplier as combat');
  assert.ok(preview.includes(`Damage ${precise(stats.current.damage)} → ${precise(stats.next.damage)}`));
  assert.ok(preview.includes(`Targets ${precise(stats.current.shots)} → ${precise(stats.next.shots)}`));
  assert.equal(await page.locator('#selection-panel .tumble-speed-note').count(), boosted ? 1 : 0);
  if (boosted) assert.match(await page.locator('.tumble-speed-note').innerText(), /3\s*[×x].*attack speed/i);
  assert.equal(await page.locator('#selection-panel [data-upgrade="0"]').isDisabled(), !owned);
  selections.push({ towerId, boosted, owned, ...stats, preview });
  return stats;
}
async function deliver(snapshot) {
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), snapshot);
  await settled();
}

try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enter();
  assert.equal(Object.hasOwn(await sentLoadout(), 'tumbleSpeed'), false, 'unowned perk is absent from outgoing loadout');
  await page.evaluate(() => { gnomeward.game.profile.roundCoins = 49; });
  await openShop();
  const purchase = page.locator('[data-shop-buy="tumble-speed"]');
  assert.equal(await purchase.isDisabled(), true);
  await purchase.dispatchEvent('click');
  assert.equal(await page.evaluate(() => gnomeward.game.profile.tumbleSpeedUnlocked), false);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 49);
  await closeShop();

  stage = '50-coin purchase updates existing defenders once';
  const before = await page.evaluate(() => {
    const game = gnomeward.game;
    game.profile.roundCoins = 50; game.points = 500;
    const tower = game._makeTower('multi', -2, 0, 0);
    tower.levels = [1]; tower.cooldown = .9;
    const control = game._makeTower('sprout', 2, 0, 0); control.cooldown = .9;
    return { id: tower.id, stats: game.getStats(tower), cooldown: tower.cooldown, control: control.id, controlStats: game.getStats(control), unlocks: [...game.profile.unlocks] };
  });
  await openShop();
  assert.equal(await purchase.isEnabled(), true);
  await page.evaluate(() => { const button = document.querySelector('[data-shop-buy="tumble-speed"]'); button.click(); button.click(); });
  await page.waitForFunction(() => gnomeward.game.profile.tumbleSpeedUnlocked && gnomeward.game.profile.roundCoins === 0);
  assert.match(await page.locator('#round-coin-shop').innerText(), /3\s*[×x]\s*attack speed/i);
  const after = await page.evaluate(({ id, control }) => {
    const game = gnomeward.game, tower = game.towers.find(t => t.id === id), sprout = game.towers.find(t => t.id === control);
    return { stats: game.getStats(tower), cooldown: tower.cooldown, controlStats: game.getStats(sprout), controlCooldown: sprout.cooldown,
      unlocks: game.profile.unlocks, unlocked: game.isUnlocked('multi') };
  }, before);
  near(after.stats.interval, before.stats.interval / 3, 'existing Tumble reload becomes one third');
  near(after.cooldown, .3, 'existing wait is shortened once');
  assert.equal(after.stats.damage, before.stats.damage); assert.equal(after.stats.shots, before.stats.shots);
  assert.deepEqual(after.controlStats, before.controlStats); near(after.controlCooldown, .9, 'other defender wait remains unchanged');
  assert.deepEqual(after.unlocks, before.unlocks); assert.equal(after.unlocked, false, 'perk does not unlock Tumble early');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').tumbleSpeedUnlocked === true);
  await page.screenshot({ path: 'playtest-results/tumble-shop-owned.png' });
  await closeShop();
  await selected(before.id, true);
  await page.locator('[data-close-upgrades]').click();
  assert.equal((await sentLoadout()).tumbleSpeed, true);
  checks.push('49 coins cannot buy; 50 buys once, speeds existing Tumble immediately, leaves damage/targets/other units and unlocks unchanged');

  stage = 'reload, new defender and garden persistence';
  await page.reload(); await enter();
  assert.equal(await page.evaluate(() => gnomeward.game.profile.tumbleSpeedUnlocked), true);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 0);
  assert.equal(await page.evaluate(() => gnomeward.game.isUnlocked('multi')), false);
  const newlyPlaced = await page.evaluate(() => {
    const game = gnomeward.game;
    game.profile.unlocks.push('multi'); game.points = 500;
    const tower = game._makeTower('multi', 0, 0, 0);
    return { id: tower.id, stats: game.getStats(tower) };
  });
  near(newlyPlaced.stats.interval, 1.3 / 3, 'new Tumble inherits perk');
  assert.equal(newlyPlaced.stats.damage, 8); assert.equal(newlyPlaced.stats.shots, 3);
  await selected(newlyPlaced.id, true);
  await page.locator('[data-upgrade="0"]').click();
  await page.waitForFunction(id => gnomeward.game.towers.find(t => t.id === id)?.levels[0] === 1, newlyPlaced.id);
  const upgraded = await selected(newlyPlaced.id, true);
  near(upgraded.current.interval, 1.3 * .72 / 3, 'upgrade keeps multiplicative attack speed');
  await page.locator('[data-close-upgrades]').click();
  await page.locator('#map-button').click(); await page.locator('[data-map="quarry"]').click();
  await page.waitForFunction(() => gnomeward.game.map.id === 'quarry');
  await page.evaluate(() => { gnomeward.state.paused = true; });
  assert.equal(await page.evaluate(() => gnomeward.game.profile.tumbleSpeedUnlocked), true);
  assert.equal(await page.evaluate(() => gnomeward.game.tumbleSpeedOwners), null);
  checks.push('Owned perk survives reload and garden change; new and upgraded Tumbles show accurate rate and upgrade preview');

  stage = 'co-op owner-specific stats and shop lock';
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'Turbo gardener', { tumbleSpeed: true }); match.addPlayer('two', 'Original gardener');
  match.manualPause = true;
  const board = match.board(); board.profile.unlocks.push('multi');
  const own = board._makeTower('multi', -2, 0, 0), teammate = board._makeTower('multi', 2, 0, 0);
  own.ownerId = 'one'; teammate.ownerId = 'two'; own.levels = [1]; teammate.levels = [1];
  for (const player of match.players.values()) player.points = 500;
  match._syncLoadouts(); match._syncWallets();
  const snapshot = match.snapshot('tumble-browser-room');
  await deliver(snapshot);
  assert.deepEqual(await page.evaluate(() => gnomeward.game.tumbleSpeedOwners), ['one']);
  const mine = await selected(own.id, true), theirs = await selected(teammate.id, false, false);
  near(mine.current.interval * 3, theirs.current.interval, 'only the eligible owner gets Turbo Tumble');
  assert.equal(mine.current.damage, theirs.current.damage); assert.equal(mine.current.shots, theirs.current.shots);
  await page.locator('[data-close-upgrades]').click();
  await openShop();
  assert.match(await page.locator('.shop-coop-note').innerText(), /current loadout stays fixed/i);
  for (const button of await page.locator('[data-shop-buy]').all()) assert.equal(await button.isDisabled(), true);
  await closeShop();

  stage = 'older servers display original speed without changing the saved perk';
  const legacy = structuredClone(snapshot);
  delete legacy.tumbleSpeedVersion;
  for (const player of legacy.players) delete player.loadout.tumbleSpeed;
  // Leave a stale owners field in this fixture: the capability gate must ignore it.
  await deliver(legacy);
  assert.deepEqual(await page.evaluate(() => gnomeward.game.tumbleSpeedOwners), []);
  const original = await selected(own.id, false);
  near(original.current.interval, theirs.current.interval, 'legacy room uses base speed');
  await page.locator('[data-close-upgrades]').click();
  await openShop();
  assert.match(await page.locator('.shop-tumble-note').innerText(), /update.*server/i);
  assert.equal(await page.evaluate(() => gnomeward.state.shopProfile.tumbleSpeedUnlocked), true);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('gnomeward-profile'))).tumbleSpeedUnlocked, true);
  await page.screenshot({ path: 'playtest-results/tumble-shop-legacy.png' });
  await page.evaluate(() => gnomeward.multiplayer.leave());
  assert.equal(await page.evaluate(() => gnomeward.game.profile.tumbleSpeedUnlocked), true);
  assert.equal(await page.evaluate(() => gnomeward.game.tumbleSpeedOwners), null);
  checks.push('Co-op speed applies only to the purchasing owner; shop locks and old-server fallback preserve the saved purchase');
  assert.deepEqual(errors, []);
  const summary = { ok: true, checks, before, after, newlyPlaced, selections, errors };
  await writeFile('playtest-results/tumble-shop-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('Turbo Tumble browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/tumble-shop-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
