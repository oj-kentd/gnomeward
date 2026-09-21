import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { enterGarden } from './browser-helpers.mjs';

// Deterministic server snapshots exercise the real MAIN incoming callback,
// profile persistence, renderer and shop controls. Socket auth/reconnect is
// covered separately by tests/shop-coop.test.js with actual WebSocket clients.
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1320, height: 850 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'opening seeded permanent collection';
const progress = setInterval(() => console.log('Shop co-op browser:', stage), 15000); progress.unref();
const url = process.env.PLAYTEST_URL || 'http://127.0.0.1:5190';
const costumes = [
  { type: 'necro', skin: 'skeletor', item: 'necro-skeletor' },
  { type: 'boom', skin: 'orange-knight', item: 'boom-orange-knight' },
  { type: 'sprout', skin: 'skeleton', item: 'sprout-skeleton' },
];
const loadout = { bossDamage: true, necroSkin: 'skeletor', boomSkin: 'orange-knight', sproutSkin: 'skeleton' };
const profile = { unlocks: ['necro'], roundCoins: 150, cosmetics: costumes.map(costume => costume.item),
  equippedNecroSkin: 'skeletor', equippedBoomSkin: 'orange-knight', equippedSproutSkin: 'skeleton', bossDamageUnlocked: true };
await page.addInitScript(profile => {
  if (!localStorage.getItem('gnomeward-profile')) localStorage.setItem('gnomeward-profile', JSON.stringify(profile));
}, profile);
async function enter() {
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
}
async function wallet(expected) {
  await page.waitForFunction(expected => gnomeward.state.shopProfile.roundCoins === expected &&
    JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').roundCoins === expected, expected);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile')));
  assert.equal(saved.bossDamageUnlocked, true);
  assert.equal(saved.equippedNecroSkin, 'skeletor');
  assert.equal(saved.equippedBoomSkin, 'orange-knight');
  assert.equal(saved.equippedSproutSkin, 'skeleton');
  assert.deepEqual(saved.cosmetics, costumes.map(costume => costume.item));
  assert.equal(await page.locator('#hud-round-coins').innerText(), String(expected));
}
async function deliver(snapshot) {
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), snapshot);
}
async function openShop() { await page.locator('#coin-shop-button').click(); await page.locator('#round-coin-shop').waitFor(); }
async function closeShop() { await page.locator('[aria-label="Close Round Coin shop"]').click(); }
try {
  await page.goto(url); await enter();
  // Exercise connectCoop's main/UI hand-off without opening a real room.
  await page.evaluate(() => {
    gnomeward.multiplayer.browse = async () => [];
    gnomeward.multiplayer.connect = async options => { window.__shopConnectOptions = options; };
  });
  await page.locator('#coop-button').click();
  await page.locator('#coop-name').fill('Shop gardener');
  await page.locator('[data-coop-create]').click();
  await page.waitForFunction(() => !!window.__shopConnectOptions);
  const connection = await page.evaluate(() => window.__shopConnectOptions);
  assert.deepEqual(connection.loadout, loadout);
  await page.locator('[aria-label="Close co-op lobbies"]').click();

  stage = 'owner-specific server loadout and rendered costumes';
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'First', loadout);
  match.addPlayer('two', 'Second');
  match.board().profile.unlocks.push('necro');
  // Placement funding is a visual fixture; round receipts below still come
  // from actual server round-completion transitions.
  for (const player of match.players.values()) player.gold = 1500;
  match._syncWallets();
  const towers = [];
  for (const costume of costumes) for (const owner of ['one', 'two']) {
    const candidates = [-4, 2, -3, 3, -5, 1].flatMap(x => [-2, 0, 2, -3, 3].map(z => ({ x, z })));
    const spot = candidates.find(spot => match.board().canPlace(costume.type, spot.x, spot.z));
    assert.ok(spot, 'fixture has a clear tower position');
    match.command(owner, { action: 'place', type: costume.type, ...spot });
    const tower = match.board().towers.at(-1), skin = owner === 'one' ? costume.skin : null;
    assert.equal(tower.skin, skin);
    towers.push({ id: tower.id, type: costume.type, owner, skin, model: 'gnome-' + costume.type + (skin ? '-' + skin : ''),
      portrait: costume.type + (skin ? '-' + skin : '') });
  }
  assert.deepEqual(match.board().bossDamageOwners, ['one']);
  const initial = match.snapshot('shop-browser-room');
  await deliver(initial);
  await wallet(150);
  async function inspectCostumes(expected) {
    await page.waitForFunction(expected => expected.every(tower =>
      gnomeward.renderer.entities.get('t' + tower.id)?.userData.modelName === tower.model), expected);
    for (const costume of costumes) {
      const own = expected.find(tower => tower.type === costume.type && tower.owner === 'one');
      assert.ok((await page.locator(`[data-tower="${costume.type}"] .portrait`).getAttribute('src')).endsWith(`/assets/${own.portrait}.png`),
        `${costume.type} roster reflects the room loadout`);
    }
    for (const tower of expected) {
      await page.evaluate(id => { gnomeward.state.selectedTowerId = id; }, tower.id);
      await page.waitForFunction(portrait => document.querySelector('#selection-panel .selected-heading .portrait')?.getAttribute('src').endsWith(`/assets/${portrait}.png`), tower.portrait);
      const selected = page.locator('#selection-panel .selected-heading .portrait');
      assert.ok((await selected.getAttribute('src')).endsWith(`/assets/${tower.portrait}.png`),
        `${tower.owner}'s ${tower.type} selection shows its own costume`);
    }
    await page.locator('[data-close-upgrades]').click();
  }
  await inspectCostumes(towers);
  assert.deepEqual(await page.evaluate(() => gnomeward.state.multiplayer.players.map(player => player.loadout.bossDamage)), [true, false]);
  await openShop();
  assert.match(await page.locator('.shop-coop-note').innerText(), /current loadout stays fixed/i);
  assert.equal(await page.locator('[data-shop-skin]:disabled').count(), 6);
  for (const costume of costumes) await page.locator(`[data-shop-tower="${costume.type}"][data-shop-skin="default"]`).dispatchEvent('click');
  await wallet(150);
  assert.equal(await page.locator('#shop-wallet-value').innerText(), '150');
  await page.screenshot({ path: 'playtest-results/shop-coop-locked.png' });

  stage = 'live cumulative rewards, duplicate and out-of-order snapshots';
  const snapshots = [];
  for (let round = 1; round <= 3; round++) {
    match.command('one', { action: 'ready' }); match.command('two', { action: 'ready' });
    match.board()._queue = []; match.board().enemies = []; match.step();
    snapshots.push(match.snapshot('shop-browser-room'));
  }
  await deliver(snapshots[0]); await wallet(151);
  assert.equal(await page.locator('#shop-wallet-value').innerText(), '151', 'open shop wallet updates during co-op');
  await deliver(snapshots[2]); await wallet(153);
  await deliver(snapshots[2]); await wallet(153);
  await deliver(snapshots[0]); await wallet(153);
  await closeShop();

  stage = 'reload, same receipt reentry and solo restoration';
  await page.reload(); await enter();
  await wallet(153);
  await deliver(snapshots[2]); await wallet(153);
  await deliver(snapshots[1]); await wallet(153);
  await page.evaluate(() => gnomeward.multiplayer.leave());
  await wallet(153);
  assert.equal(await page.evaluate(() => gnomeward.state.multiplayer), null);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.roundCoins), 153);
  await openShop();
  assert.equal(await page.locator('[data-shop-skin]:disabled').count(), 0, 'solo return re-enables costume controls');
  for (const costume of costumes) assert.equal(await page.locator(`[data-shop-tower="${costume.type}"][data-shop-skin="${costume.skin}"]`).getAttribute('aria-pressed'), 'true');
  await closeShop();

  stage = 'older shop server retains Morrow and boss perks but uses original new-costume towers';
  const oldCostumes = structuredClone(snapshots[2]);
  delete oldCostumes.costumeVersion;
  for (const player of oldCostumes.players) { delete player.loadout.boomSkin; delete player.loadout.sproutSkin; }
  for (const tower of oldCostumes.boards[0].state.towers) if (tower.type !== 'necro') tower.skin = null;
  const oldLooks = towers.map(tower => tower.type === 'necro' ? tower : { ...tower, skin: null, model: 'gnome-' + tower.type, portrait: tower.type });
  await deliver(oldCostumes); await wallet(153);
  assert.deepEqual(await page.evaluate(() => ({ shop: gnomeward.state.multiplayer.shopSupported,
    costumes: gnomeward.state.multiplayer.costumesSupported, loadout: gnomeward.state.multiplayer.loadout })),
    { shop: true, costumes: false, loadout: { bossDamage: true, necroSkin: 'skeletor' } });
  await inspectCostumes(oldLooks);
  await openShop();
  assert.match(await page.locator('.shop-costume-note').innerText(), /Update the co-op server.*Orange Knight Bramble.*Skeleton Sprout/i);
  assert.equal(await page.locator('[data-shop-skin]:disabled').count(), 6);
  await page.screenshot({ path: 'playtest-results/shop-coop-legacy-costumes.png' });
  await page.evaluate(() => gnomeward.multiplayer.leave()); await wallet(153);

  stage = 'old server clearly advertises unavailable rewards';
  const legacy = structuredClone(oldCostumes);
  for (const player of legacy.players) delete player.loadout;
  for (const tower of legacy.boards[0].state.towers) tower.skin = null;
  delete legacy.shopVersion;
  legacy.players.find(p => p.id === 'one').roundCoinsEarned = 999;
  await deliver(legacy); await wallet(153);
  assert.equal(await page.evaluate(() => gnomeward.state.multiplayer.shopSupported), false);
  await openShop();
  assert.match(await page.locator('.shop-coop-note').innerText(), /server needs an update.*Round Coin/i);
  assert.equal(await page.locator('[data-shop-skin]:disabled').count(), 6);
  await page.screenshot({ path: 'playtest-results/shop-coop-legacy.png' });
  await page.evaluate(() => gnomeward.multiplayer.leave());
  await wallet(153);

  stage = 'unowned purchases are locked in an active room';
  // A separate browser profile proves purchase locks, while the original keeps
  // its earned coins and permanent collection intact for the persistence checks.
  const guest = await browser.newPage({ viewport: { width: 1320, height: 850 } });
  guest.setDefaultTimeout(45000);
  guest.on('pageerror', error => errors.push(error.message));
  await guest.addInitScript(() => localStorage.setItem('gnomeward-profile', JSON.stringify({ unlocks: [], roundCoins: 150 })));
  await guest.goto(url); await enterGarden(guest);
  await guest.waitForFunction(() => window.gnomeward?.ready);
  if (await guest.locator('#dismiss-tip').isVisible()) await guest.locator('#dismiss-tip').click();
  await guest.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'two'), initial);
  await guest.locator('#coin-shop-button').click();
  assert.equal(await guest.locator('[data-shop-buy]:disabled').count(), 4);
  await guest.locator('[data-shop-buy="boss-damage"]').dispatchEvent('click');
  for (const costume of costumes) await guest.locator(`[data-shop-buy="${costume.item}"]`).dispatchEvent('click');
  const untouched = await guest.evaluate(() => ({ coins: gnomeward.state.shopProfile.roundCoins, boss: gnomeward.state.shopProfile.bossDamageUnlocked, skins: gnomeward.state.shopProfile.cosmetics }));
  assert.deepEqual(untouched, { coins: 150, boss: false, skins: [] });
  await guest.close();
  assert.deepEqual(errors, []);
  const summary = { ok: true, initialCoins: 150, finalCoins: 153, earnedClears: 3, duplicateReceiptsIgnored: true,
    outOfOrderReceiptsIgnored: true, reloadAndSoloPersistence: true, models: towers, rosterAndSelectionPortraits: true,
    oldServerKeepsMorrowAndBossPerk: true, oldServerNewCostumesUseOriginalLooks: true, loadoutSent: connection.loadout, purchasesAndEquipLocked: true, legacyRewardBlocked: true, errors };
  await writeFile('playtest-results/shop-coop-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('Shop co-op browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/shop-coop-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
