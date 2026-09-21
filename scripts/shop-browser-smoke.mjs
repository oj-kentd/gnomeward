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
const errors = [], checks = [], layouts = [], hudLayouts = [];
const purchaseItems = ['necro-skeletor', 'boom-orange-knight', 'sprout-skeleton', 'boss-damage'];
const newCostumes = [
  { type: 'boom', item: 'boom-orange-knight', skin: 'orange-knight', profileKey: 'equippedBoomSkin' },
  { type: 'sprout', item: 'sprout-skeleton', skin: 'skeleton', profileKey: 'equippedSproutSkin' },
];
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
  for (const item of purchaseItems) {
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

async function checkLargeWalletHud(width, height) {
  await page.setViewportSize({ width, height });
  // Six-digit earned gold exposed the original fourth-stat regression. Also
  // exercise long compact decimals and the maximum persistent coin balance.
  for (const values of [{ gold: 130624, points: 9375, coins: 99999 },
    { gold: 999999999, points: 123456789, coins: 1000000000 }]) {
    await page.evaluate(values => {
      Object.assign(gnomeward.game, { gold: values.gold, points: values.points });
      gnomeward.game.profile.roundCoins = values.coins;
    }, values);
    await page.waitForFunction(values => {
      const gold = document.getElementById('hud-gold');
      const points = document.getElementById('hud-points');
      const coins = document.getElementById('hud-round-coins');
      const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 });
      return gold.textContent === compact.format(values.gold) &&
        Number(points.title.replace(/[^0-9.]/g, '')) === values.points &&
        coins.textContent === compact.format(values.coins);
    }, values);
    await settled();
    const layout = await page.evaluate(() => {
      const rectangle = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
      const stats = [...document.querySelectorAll('.hud > .hud-stat')].map(stat => {
        const icon = stat.querySelector('svg'), value = stat.querySelector('strong');
        const texts = [...stat.querySelectorAll('strong, small')].flatMap(node => {
          if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return [];
          const range = document.createRange(); range.selectNodeContents(node);
          return [{ text: node.textContent, rect: rectangle(range.getBoundingClientRect()) }];
        });
        return { id: value.id, text: value.textContent, bounds: rectangle(stat.getBoundingClientRect()),
          icon: rectangle(icon.getBoundingClientRect()), texts };
      });
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, stats };
    });
    assert.equal(layout.stats.length, 4, 'all four HUD resources remain present');
    assert.ok(layout.scrollWidth <= width, 'large HUD values do not widen the page');
    for (const [index, stat] of layout.stats.entries()) {
      assert.ok(stat.bounds.left >= -1 && stat.bounds.right <= width + 1, `${stat.id} remains on screen`);
      assert.ok(stat.icon.width > 0 && stat.icon.height > 0 && stat.texts.length > 0, `${stat.id} has a visible icon and value`);
      for (const content of [stat.icon, ...stat.texts.map(text => text.rect)]) {
        assert.ok(content.width > 0 && content.height > 0, `${stat.id} text/icon is visible`);
        assert.ok(content.left >= stat.bounds.left - 1 && content.right <= stat.bounds.right + 1 &&
          content.top >= stat.bounds.top - 1 && content.bottom <= stat.bounds.bottom + 1,
        `${stat.id} text/icon fits its own stat at ${width}px: ${JSON.stringify({ stat, content, values })}`);
      }
      const valueText = stat.texts[0].rect;
      assert.ok(stat.icon.right <= valueText.left + 1 || stat.icon.bottom <= valueText.top + 1 ||
        valueText.right <= stat.icon.left + 1 || valueText.bottom <= stat.icon.top + 1,
        `${stat.id} icon does not cover its value at ${width}px: ${JSON.stringify(stat)}`);
      if (index > 0) {
        const previous = layout.stats[index - 1];
        assert.ok(previous.bounds.right <= stat.bounds.left + 1 || previous.bounds.bottom <= stat.bounds.top + 1,
          `${previous.id} and ${stat.id} do not overlap at ${width}px`);
      }
    }
    hudLayouts.push({ ...layout, values });
  }
}

try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await page.locator('#splash-shop').click();
  await page.waitForFunction(() => window.gnomeward?.ready);
  await page.locator('#round-coin-shop').waitFor();
  await page.evaluate(() => Object.assign(gnomeward.state, { paused: true, autoStart: false }));
  await wallet(0);
  checks.push('Splash shop button enters the shop directly');
  for (const item of purchaseItems) assert.equal(await page.locator(`[data-shop-buy="${item}"]`).isDisabled(), true);
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

  stage = 'buying and independently equipping Bramble and Sprout costumes';
  const costumeTowers = await page.evaluate(() => {
    const game = gnomeward.game;
    game.profile.roundCoins = 200;
    return { boom: game._makeTower('boom', -4, 0, 0).id, sprout: game._makeTower('sprout', 4, 0, 0).id };
  });
  await settled(); await openShop(); await wallet(200);
  assert.equal(await page.locator('[data-costume-card="sprout-skeleton"] .shop-product-copy p').textContent(), 'skeleton vs skeletons who wins ???');
  for (const [index, costume] of newCostumes.entries()) {
    await doublePurchase(costume.item); await wallet(100 - index * 100);
    await page.locator(`[data-shop-tower="${costume.type}"][data-shop-skin="${costume.skin}"]`).click();
    await model(costumeTowers[costume.type], 'gnome-' + costume.item);
    await page.waitForFunction(({ type, item, profileKey, skin }) =>
      gnomeward.game.profile[profileKey] === skin &&
      document.querySelector(`[data-tower="${type}"] img`)?.getAttribute('src').endsWith(`/assets/${item}.png`), costume);
  }
  assert.deepEqual(await page.evaluate(() => gnomeward.game.profile.cosmetics), ['necro-skeletor', 'boom-orange-knight', 'sprout-skeleton']);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.bossDamageUnlocked), true);
  await closeShop();
  for (const costume of newCostumes) {
    await page.evaluate(id => { gnomeward.state.selectedTowerId = id; }, costumeTowers[costume.type]);
    await page.waitForFunction(item => document.querySelector('.selected-heading img')?.getAttribute('src').endsWith(`/assets/${item}.png`), costume.item);
  }
  await page.screenshot({ path: 'playtest-results/shop-costumes-equipped.png' });
  checks.push('Both new 100-coin costumes buy exactly once, swap existing models, and update roster and selected-unit portraits; Sprout description matches exactly');

  stage = 'new costume persistence, placement ghosts, and new placements';
  await page.reload(); await enter();
  assert.deepEqual(await page.evaluate(() => ({
    coins: gnomeward.game.profile.roundCoins, boom: gnomeward.game.profile.equippedBoomSkin,
    sprout: gnomeward.game.profile.equippedSproutSkin, necro: gnomeward.game.profile.equippedNecroSkin,
    perk: gnomeward.game.profile.bossDamageUnlocked,
  })), { coins: 0, boom: 'orange-knight', sprout: 'skeleton', necro: null, perk: true });
  const placedCostumes = {};
  for (const costume of newCostumes) {
    await page.locator(`[data-tower="${costume.type}"]`).click();
    await settled();
    const placement = await page.evaluate(type => {
      const { game, renderer } = gnomeward;
      const rect = renderer.renderer.domElement.getBoundingClientRect();
      for (let z = -5; z <= 5; z += 2) for (let x = -8; x <= 8; x += 2) {
        if (!game.canPlace(type, x, z)) continue;
        const p = renderer.camera.position.clone().set(x, 0, z).project(renderer.camera);
        const clientX = rect.left + (p.x + 1) * rect.width / 2;
        const clientY = rect.top + (1 - p.y) * rect.height / 2;
        if (document.elementFromPoint(clientX, clientY) !== renderer.renderer.domElement) continue;
        return { x, z, clientX, clientY };
      }
      throw new Error('No visible valid placement for ' + type);
    }, costume.type);
    await page.mouse.move(placement.clientX, placement.clientY);
    await page.waitForFunction(item => gnomeward.renderer.ghost?.visible && gnomeward.renderer.ghostType === 'gnome-' + item, costume.item);
    await page.mouse.click(placement.clientX, placement.clientY);
    await page.waitForFunction(({ type, skin }) => gnomeward.game.towers.some(tower => tower.type === type && tower.skin === skin), costume);
    placedCostumes[costume.type] = await page.evaluate(type => gnomeward.game.towers.find(tower => tower.type === type).id, costume.type);
    await model(placedCostumes[costume.type], 'gnome-' + costume.item);
    await page.waitForFunction(item => document.querySelector('.selected-heading img')?.getAttribute('src').endsWith(`/assets/${item}.png`), costume.item);
  }
  checks.push('Both new equipped costumes persist on reload and appear on production placement ghosts and newly placed gnomes');

  stage = 'restoring Bramble without unequipping Sprout';
  await openShop(); await wallet(0);
  await page.locator('[data-shop-tower="boom"][data-shop-skin="default"]').click();
  await model(placedCostumes.boom, 'gnome-boom');
  await model(placedCostumes.sprout, 'gnome-sprout-skeleton');
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('gnomeward-profile') || '{}');
    return saved.equippedBoomSkin === null && saved.equippedSproutSkin === 'skeleton' && saved.roundCoins === 0 && saved.bossDamageUnlocked;
  });
  assert.equal(await page.locator('[data-shop-tower="sprout"][data-shop-skin="skeleton"]').getAttribute('aria-pressed'), 'true');
  checks.push('Restoring Bramble costs nothing, persists, and leaves Skeleton Sprout and the permanent boss perk equipped');
  await closeShop();

  stage = 'small-screen shop controls';
  await page.evaluate(() => localStorage.removeItem('gnomeward-profile'));
  await page.reload(); await enter(); await openShop();
  await checkPhone(390); await checkPhone(320);
  for (const item of purchaseItems) assert.equal(await page.locator(`[data-shop-buy="${item}"]`).isDisabled(), true);
  checks.push('390px and 320px shops have no horizontal overflow and all four purchase controls remain reachable and disabled with an empty wallet');
  await closeShop();
  stage = 'large persistent and run wallets across four HUD sizes';
  for (const [width, height] of [[1280, 800], [844, 390], [390, 844], [320, 568]]) await checkLargeWalletHud(width, height);
  checks.push('Large gold, points and Round Coin values fit all four HUD stats without icon/text or adjacent overlap at 1280, 844, 390 and 320px');
  assert.deepEqual(errors, []);
  const summary = { ok: true, checks, round, restored, layouts, hudLayouts, errors };
  await writeFile('playtest-results/shop-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('Round Coin shop browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/shop-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
