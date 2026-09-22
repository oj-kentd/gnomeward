import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { enterGarden } from './browser-helpers.mjs';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
page.setDefaultTimeout(45000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
let stage = 'entering garden';
const progress = setInterval(() => console.log('Placement merge browser:', stage), 15000); progress.unref();
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function point(id) {
  await frames();
  return page.evaluate(id => {
    const tower = gnomeward.game.getFusionRoot(id), world = gnomeward.renderer;
    const projected = world.camera.position.clone().set(tower.x, .7, tower.z).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2 };
  }, id);
}
async function choose(type) {
  await page.keyboard.press('Escape');
  await page.locator(`[data-tower="${type}"]`).click();
  await page.waitForFunction(type => gnomeward.state.placingType === type, type);
}
async function clickTower(id, touch = false) {
  const p = await point(id);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function shopMerge(type, targetId, key, touch = false) {
  await choose(type); await clickTower(targetId, touch);
  await page.waitForFunction(({ targetId, key }) => gnomeward.game.getFusionRoot(targetId)?.fusionKey === key, { targetId, key });
}
async function drag(source, target) {
  await page.keyboard.press('Escape');
  const a = await point(source), b = await point(target);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  assert.equal(await page.evaluate(() => gnomeward.state.selectedTowerId), null, 'pointerdown does not shift table before dragging');
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  const targets = await page.evaluate(() => {
    const { game, state } = gnomeward; state.paused = true; state.autoStart = false;
    game.gold = 5000; game.profile.unlocks.push('multi', 'necro');
    const fresh = game._makeTower('sprout', -4, 0, 100), upgraded = game._makeTower('necro', 3, 1, 320);
    upgraded.levels[0] = 3; upgraded.levels[1] = 2;
    return { fresh: fresh.id, upgraded: upgraded.id };
  });
  stage = 'shop placement merges at zero upgrades and preserves upgraded targets';
  const initialGold = await page.evaluate(() => gnomeward.game.gold);
  await shopMerge('multi', targets.fresh, 'multi-sprout');
  assert.equal(await page.evaluate(() => gnomeward.game.gold), initialGold - 290);
  assert.ok(await page.evaluate(id => gnomeward.game.getFusionMembers(id).every(t => t.levels.every(level => level === 0)), targets.fresh));
  await shopMerge('sprout', targets.upgraded, 'necro-sprout');
  assert.deepEqual(await page.evaluate(id => gnomeward.game.towers.find(t => t.id === id).levels.slice(0, 2), targets.upgraded), [3, 2]);
  await shopMerge('necro', targets.fresh, 'multi-necro-sprout');
  assert.equal(await page.evaluate(id => gnomeward.game.getFusionMembers(id).length, targets.fresh), 3);
  checks.push('Shop gnome can be placed on a level-zero or upgraded defender, pays its usual gold cost, retains upgrades, and completes a triple form.');

  stage = 'duplicate and insufficient-gold placement is rejected';
  const beforeDuplicate = await page.evaluate(() => ({ count: gnomeward.game.towers.length, gold: gnomeward.game.gold }));
  await choose('sprout'); await clickTower(targets.upgraded);
  assert.deepEqual(await page.evaluate(() => ({ count: gnomeward.game.towers.length, gold: gnomeward.game.gold })), beforeDuplicate);
  await choose('multi'); await page.evaluate(() => { gnomeward.game.gold = 0; }); await clickTower(targets.upgraded);
  assert.equal(await page.evaluate(() => gnomeward.game.towers.length), beforeDuplicate.count);
  assert.equal(await page.evaluate(() => gnomeward.game.gold), 0);
  checks.push('Duplicate components and unaffordable merges leave defenders and wallet unchanged.');

  stage = 'dragging existing defenders and cancellation';
  await page.keyboard.press('Escape');
  const dragIds = await page.evaluate(() => {
    const game = gnomeward.game; game.towers = []; game.gold = 1000;
    const a = game._makeTower('sprout', -4, 0, 100), b = game._makeTower('necro', 2, 0, 320);
    return { a: a.id, b: b.id };
  });
  const start = await point(dragIds.a), end = await point(dragIds.b);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  assert.equal(await page.evaluate(id => gnomeward.game.towers.find(t => t.id === id).x, dragIds.a), -4, 'drag preview never changes real tower coordinates');
  assert.ok(await page.evaluate(() => gnomeward.renderer.mergeDragGhost?.visible), 'translucent drag preview follows the pointer');
  await page.evaluate(() => {
    const renderer = gnomeward.renderer;
    renderer.renderer.domElement.dispatchEvent(new PointerEvent('pointercancel', { pointerId: renderer.pointerGesture.pointerId }));
  });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => gnomeward.game.towers.some(t => t.fusionKey)), false, 'cancel does not merge');
  assert.equal(await page.evaluate(() => gnomeward.renderer.pointerGesture), null);
  assert.equal(await page.evaluate(() => gnomeward.renderer.mergeDragGhost), null);
  await drag(dragIds.a, dragIds.b);
  await page.waitForFunction(id => gnomeward.game.getFusionRoot(id)?.fusionKey === 'necro-sprout', dragIds.b);
  assert.equal(await page.evaluate(id => gnomeward.game.getFusionRoot(id).x, dragIds.b), 2, 'drop target keeps its location');
  await page.screenshot({ path: 'playtest-results/placement-merge-desktop.png' });
  checks.push('Existing defenders merge on drag-and-drop, preserve target position, do not move before release, and cancel cleanly without changing selection.');

  stage = 'touch tap selection and direct placement on narrow screens';
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 });
  const touchTarget = await page.evaluate(() => {
    const game = gnomeward.game; game.towers = []; return game._makeTower('sprout', 0, 0, 100).id;
  });
  await clickTower(touchTarget, true);
  await page.waitForFunction(id => gnomeward.state.selectedTowerId === id, touchTarget);
  await shopMerge('multi', touchTarget, 'multi-sprout', true);
  assert.equal(await page.evaluate(() => gnomeward.renderer.pointerGesture), null);
  await page.screenshot({ path: 'playtest-results/placement-merge-touch.png' });
  checks.push('Touch tap still selects a defender; a shop gnome merges onto it on a390px viewport.');

  stage = 'co-op server capabilities and teammate protections';
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1280, height: 800 });
  const match = new Match({ mode: 'coop', mapId: 'meadow' }); match.addPlayer('one', 'Merger'); match.addPlayer('two', 'Teammate'); match.manualPause = true;
  const board = match.board(); board.profile.unlocks.push('multi', 'necro');
  const own = board._makeTower('sprout', -4, 0, 100), theirs = board._makeTower('sprout', 2, 0, 100);
  own.ownerId = 'one'; theirs.ownerId = 'two';
  for (const player of match.players.values()) player.gold = 2000;
  match._syncWallets();
  async function deliver(snapshot) { await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), snapshot); await frames(); }
  const legacy = match.snapshot('placement-merge-browser-room'); delete legacy.placementFusionVersion;
  await deliver(legacy);
  await page.evaluate(() => { window.__placementCommands = []; gnomeward.multiplayer.command = command => { window.__placementCommands.push(command); return true; }; });
  await choose('multi'); await clickTower(own.id);
  assert.deepEqual(await page.evaluate(() => window.__placementCommands), [], 'older server cannot receive unsupported direct placement merge');
  await deliver(match.snapshot('placement-merge-browser-room'));
  await choose('multi'); await clickTower(theirs.id);
  assert.deepEqual(await page.evaluate(() => window.__placementCommands), [], 'cannot buy a merge for teammate defender');
  await choose('multi'); await clickTower(own.id);
  const command = await page.evaluate(() => window.__placementCommands.at(-1));
  assert.deepEqual(command, { action: 'placeMerge', type: 'multi', towerId: own.id });
  match.command('one', command); await deliver(match.snapshot('placement-merge-browser-room'));
  assert.equal(await page.evaluate(id => gnomeward.game.getFusionRoot(id).fusionKey, own.id), 'multi-sprout');
  await page.evaluate(() => { window.__placementCommands = []; });
  await drag(own.id, theirs.id);
  assert.deepEqual(await page.evaluate(() => window.__placementCommands), [], 'drag cannot merge with teammate');
  checks.push('Old co-op servers gate the new action; current server applies real placeMerge command; shop and drag both reject teammate targets.');
  assert.deepEqual(errors, []);
  await writeFile('playtest-results/placement-merge-browser.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.error('Placement merge browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/placement-merge-failure.png' }).catch(() => {}); throw error;
} finally { clearInterval(progress); await browser.close(); }
