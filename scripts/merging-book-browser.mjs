import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { BOOK_ENTRIES, BOOK_LOCATION } from '../src/merging-book.js';
import { enterGarden } from './browser-helpers.mjs';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [], checks = [];
page.setDefaultTimeout(45000);
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'opening meadow';
const progress = setInterval(() => console.log('Merging book browser:', stage), 15000); progress.unref();
async function enter() {
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  await page.evaluate(() => { gnomeward.state.paused = true; gnomeward.state.autoStart = false; });
}
async function clickBook() {
  const point = await page.evaluate(({ x, z }) => {
    const world = gnomeward.renderer, point = world.camera.position.clone().set(x, .45, z).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
  }, BOOK_LOCATION);
  await page.mouse.click(point.x, point.y);
  await page.locator('#merging-book').waitFor();
}
async function closeBook() { await page.locator('[aria-label="Close Book of Merging"]').click(); }
async function openFromMenu() { await page.locator('#help-button').click(); await page.locator('[data-merging-book]').click(); await page.locator('#merging-book').waitFor(); }
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enter();
  await page.locator('#help-button').click();
  assert.equal(await page.locator('[data-merging-book]').count(), 0);
  assert.match(await page.locator('.book-rumor').innerText(), /Moonlit Creek/);
  await page.locator('[aria-label="Close field guide"]').click();
  assert.equal(await page.evaluate(() => gnomeward.renderer.mergingBook), null, 'book is no longer in Meadow');
  await page.locator('#map-button').click();
  await page.locator(`[data-map="${BOOK_LOCATION.mapId}"]`).click();
  await page.waitForFunction(() => gnomeward.game.map.id === 'creek' && !!gnomeward.renderer.mergingBook);
  await page.screenshot({ path: 'playtest-results/merging-book-creek.png' });
  const merged = await page.evaluate(() => {
    const game = gnomeward.game;
    const a = game._makeTower('sprout', -3, 0, 100), b = game._makeTower('multi', 0, 0, 290);
    return game.mergeTowers(a.id, b.id);
  });
  assert.equal(merged, true);
  await page.waitForFunction(() => gnomeward.game.profile.fusionDiscoveries.includes('multi-sprout'));
  assert.equal(await page.evaluate(() => gnomeward.game.profile.mergingBookFound), false);
  stage = 'physical scenery click opens book and preserves earlier discoveries';
  await clickBook();
  assert.match(await page.locator('.book-progress').innerText(), /1 \/ 7/);
  assert.equal(await page.locator('[data-book-entry]').count(), 7);
  assert.equal(await page.locator('.book-discovered').count(), 1);
  for (let index = 0; index < BOOK_ENTRIES.length; index++) {
    const entry = BOOK_ENTRIES[index], card = page.locator(`[data-book-entry="${index}"]`);
    const html = await card.innerHTML();
    if (entry.id === 'multi-sprout') { assert.ok(html.includes(entry.name)); assert.match(await card.innerText(), /Merge Tumble \+ Sprout/); }
    else {
      assert.equal(html.includes(entry.name), false, `${entry.name} stays hidden`);
      assert.equal(html.includes(entry.recipe), false, 'locked recipe absent from DOM');
      assert.equal(await card.locator('.book-recipe').count(), 0);
      assert.ok((await card.locator('.book-hint').innerText()).length > 20);
    }
  }
  await page.locator('[data-book-tab="combos"]').click();
  assert.equal(await page.locator('#book-combos .book-unknown').count(), 3);
  assert.match(await page.locator('#book-combos .portrait').first().evaluate(image => getComputedStyle(image).filter), /brightness\(0\)/);
  checks.push('Physical book found by raycast; all seven entries exist, earlier merge recorded, and unknown names/recipes omitted from cards and accessibility markup.');
  await closeBook();

  stage = 'actual upgraded Tumble and Prism activate a discoverable combo';
  const activation = await page.evaluate(() => {
    const game = gnomeward.game, point = game.pointAt(3);
    game.towers = []; game.enemies = []; game.projectiles = [];
    const tumble = game._makeTower('multi', point.x, point.z + 1, 0), prism = game._makeTower('crystal', point.x + 1, point.z + 1, 0);
    tumble.levels = [3]; prism.levels[1] = 3;
    game.status = 'wave'; game.wave = 1;
    const enemy = game._spawn('bone'); enemy.progress = 3; enemy.hp = enemy.maxHp = 10000; Object.assign(enemy, game.pointAt(3));
    game.update(.05);
    const result = { discovered: [...game.comboDiscoveries], shards: game.projectiles.filter(shot => shot.type === 'prism-shard').length };
    game.status = 'planning'; return result;
  });
  assert.ok(activation.discovered.includes('prismstorm')); assert.ok(activation.shards > 0);
  await page.waitForFunction(() => gnomeward.game.profile.comboDiscoveries.includes('prismstorm'));
  await openFromMenu(); await page.locator('[data-book-tab="combos"]').click();
  const prismIndex = BOOK_ENTRIES.findIndex(entry => entry.id === 'prismstorm');
  assert.match(await page.locator(`[data-book-entry="${prismIndex}"]`).innerText(), /Prismstorm/);
  assert.match(await page.locator(`[data-book-entry="${prismIndex}"] .book-recipe`).innerText(), /Tumble: .* 3.*Prism: .* 3/);
  assert.match(await page.locator('.book-progress').innerText(), /2 \/ 7/);
  await page.screenshot({ path: 'playtest-results/merging-book-desktop.png' });
  await closeBook(); await page.reload(); await enter(); await openFromMenu();
  assert.match(await page.locator('.book-progress').innerText(), /2 \/ 7/);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.locator('[data-book-tab="combos"]').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator('[data-book-tab="fusions"]').click();
  await page.screenshot({ path: 'playtest-results/merging-book-mobile.png' });
  await closeBook();
  checks.push('Actual Prismstorm combat trigger reveals its exact recipe; discovery and book ownership survive reload; both chapters remain reachable at320px.');

  stage = 'book pickup and discoveries remain browser-local in co-op';
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    const profile = gnomeward.game.profile;
    profile.mergingBookFound = false; profile.fusionDiscoveries = []; profile.comboDiscoveries = [];
    localStorage.setItem('gnomeward-profile', JSON.stringify(profile));
  });
  const match = new Match({ mode: 'coop', mapId: BOOK_LOCATION.mapId });
  match.addPlayer('one', 'Reader'); match.addPlayer('two', 'Teammate'); match.manualPause = true;
  const board = match.board(), a = board._makeTower('multi', -3, 0, 290), b = board._makeTower('necro', 0, 0, 320);
  a.ownerId = b.ownerId = 'two'; assert.equal(board.mergeTowers(a.id, b.id), true);
  const snapshot = match.snapshot('book-browser-room');
  snapshot.boards[0].state.events.push({ type: 'combo', combo: 'sporefire', eventId: 100 });
  const following = structuredClone(snapshot); following.boards[0].state.events = [];
  await page.evaluate(({ snapshot, following }) => {
    gnomeward.multiplayer.onSnapshot(snapshot, 'one');
    gnomeward.multiplayer.onSnapshot(following, 'one');
  }, { snapshot, following });
  await page.waitForFunction(() => gnomeward.state.shopProfile?.fusionDiscoveries.includes('multi-necro'));
  const serverBefore = await page.evaluate(() => gnomeward.game.profile.mergingBookFound);
  await clickBook();
  assert.match(await page.locator('.book-progress').innerText(), /2 \/ 7/);
  assert.equal(await page.evaluate(() => gnomeward.game.profile.mergingBookFound), serverBefore, 'local book pickup never changes server profile');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile')));
  assert.equal(saved.mergingBookFound, true); assert.deepEqual(saved.fusionDiscoveries, ['multi-necro']); assert.deepEqual(saved.comboDiscoveries, ['sporefire']);
  await closeBook(); await page.evaluate(() => gnomeward.multiplayer.leave());
  await page.waitForFunction(() => !gnomeward.state.multiplayer);
  await openFromMenu(); assert.match(await page.locator('.book-progress').innerText(), /2 \/ 7/);
  checks.push('Co-op records consecutive snapshot discoveries without losing the first event, teammate discoveries, and physical pickup to local collection only; the book remains available after leaving the room.');
  assert.deepEqual(errors, []);
  await writeFile('playtest-results/merging-book-browser.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.error('Book browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/merging-book-failure.png' }).catch(() => {}); throw error;
} finally { clearInterval(progress); await browser.close(); }
