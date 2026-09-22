import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { FUSIONS } from '../src/fusions.js';
import { TOWERS } from '../src/data.js';
import { BOOK_ENTRIES } from '../src/merging-book.js';
import { enterGarden } from './browser-helpers.mjs';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'loading expanded cast';
const progress = setInterval(() => console.log('Fusion expansion browser:', stage), 15000); progress.unref();
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function point(id) {
  await frames();
  return page.evaluate(id => {
    const tower = gnomeward.game.getFusionRoot(id), world = gnomeward.renderer;
    const point = world.camera.position.clone().set(tower.x, .7, tower.z).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
  }, id);
}
async function select(id) { const p = await point(id); await page.mouse.click(p.x, p.y); await page.waitForFunction(id => document.querySelector('#selection-panel')?.dataset.towerId === String(id) && !document.querySelector('#selection-panel').hidden, id); }
async function choose(type) { await page.keyboard.press('Escape'); await page.locator(`[data-tower="${type}"]`).click(); await page.waitForFunction(type => gnomeward.state.placingType === type, type); }
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  const mushroom = await page.evaluate(types => {
    const { game, state } = gnomeward; state.paused = true; state.autoStart = false;
    game.gold = 20000; game.points = 1000; game.profile.unlocks = types;
    return game._makeTower('spore', -3, 0, 160).id;
  }, Object.keys(TOWERS));
  stage = 'new public fusion with automatic anchor';
  await choose('boom'); const mushroomPoint = await point(mushroom); await page.mouse.click(mushroomPoint.x, mushroomPoint.y);
  await page.waitForFunction(id => gnomeward.game.getFusionRoot(id)?.fusionKey === 'boom-spore', mushroom);
  assert.match(await page.locator('.selected-heading h3').innerText(), /Sporeburst/);
  const bomber = await page.evaluate(id => gnomeward.game.getFusionMembers(id).find(t => t.type === 'boom').id, mushroom);
  await page.locator(`[data-fusion-member="${bomber}"]`).click();
  await page.locator('[data-upgrade="0"]').click();
  assert.equal(await page.evaluate(id => gnomeward.game.towers.find(t => t.id === id).levels[0], bomber), 1);
  await page.locator('[data-targeting]').click();
  assert.ok(await page.evaluate(id => gnomeward.game.getFusionMembers(id).every(t => t.targeting === 'last'), mushroom));
  await page.locator(`[data-fusion-member="${mushroom}"]`).click();
  assert.equal(await page.locator('[data-targeting]').count(), 0);
  await page.locator('[data-upgrade="0"]').click();
  assert.equal(await page.evaluate(id => gnomeward.game.towers.find(t => t.id === id).levels[0], mushroom), 1);
  checks.push('New public pair purchased by direct placement; automatic Morel anchor keeps both upgrade panels and permits Bramble targeting.');

  stage = 'secret pairs stay out of suggestions and hover names';
  await page.keyboard.press('Escape');
  const secret = await page.evaluate(() => {
    const game = gnomeward.game; game.towers = [];
    const necro = game._makeTower('necro', 2, 0, 320), spore = game._makeTower('spore', -3, 0, 160);
    return { necro: necro.id, spore: spore.id };
  });
  await select(secret.necro); await page.locator('[data-merge-open]').click();
  assert.equal(await page.locator(`[data-merge-partner="${secret.spore}"]`).count(), 0);
  assert.equal((await page.locator('#selection-panel').innerText()).includes(FUSIONS['necro-spore'].name), false);
  await choose('spore'); const secretPoint = await point(secret.necro); await page.mouse.move(secretPoint.x, secretPoint.y);
  await page.waitForFunction(() => gnomeward.state.placementMergeName === 'a mystery form');
  assert.equal((await page.locator('#placement-banner').innerText()).includes(FUSIONS['necro-spore'].name), false);
  await page.mouse.click(secretPoint.x, secretPoint.y);
  await page.waitForFunction(id => gnomeward.game.getFusionRoot(id)?.fusionKey === 'necro-spore', secret.necro);
  assert.match(await page.locator('.selected-heading h3').innerText(), /Gravecap/);
  await page.keyboard.press('Escape');
  const secretDrag = await page.evaluate(() => {
    const game = gnomeward.game; game.towers = [];
    const a = game._makeTower('boom', -4, 0, 210), b = game._makeTower('strawberry', 3, 0, 300);
    return { a: a.id, b: b.id };
  });
  const a = await point(secretDrag.a), b = await point(secretDrag.b);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(id => gnomeward.game.getFusionRoot(id)?.fusionKey === 'boom-strawberry', secretDrag.b);
  checks.push('Unadvertised recipes do not appear in partner suggestions or hover names; secret forms work through both shop placement and physical drag.');

  stage = 'all eleven Blender forms render as one actor each';
  await page.keyboard.press('Escape');
  const cast = await page.evaluate(recipes => {
    const game = gnomeward.game; game.towers = []; game.effects = []; game.projectiles = [];
    return recipes.map(([key, recipe], index) => {
      const x = -7.5 + (index % 4) * 5, z = -4 + Math.floor(index / 4) * 4;
      const members = recipe.types.map(type => game._makeTower(type, x, z, 0));
      for (const member of members.slice(1)) if (!game.mergeTowers(members[0].id, member.id)) throw new Error(`Cannot merge ${key}`);
      return { id: members[0].id, key, modelName: recipe.modelName };
    });
  }, Object.entries(FUSIONS));
  await page.waitForFunction(cast => cast.every(({ id, modelName }) => gnomeward.renderer.entities.get('t' + id)?.userData.modelName === modelName), cast);
  assert.equal(await page.evaluate(() => [...gnomeward.renderer.entities.keys()].filter(key => key.startsWith('t')).length), Object.keys(FUSIONS).length);
  await page.screenshot({ path: 'playtest-results/fusion-expanded-cast.png' });
  checks.push('Every one of the eleven Blender fusion models loads and renders exactly once; hidden combat members create no duplicate actors.');

  stage = 'extra secrets never appear in the Book, even after discovery';
  await page.evaluate(() => { gnomeward.game.profile.mergingBookFound = true; });
  await page.locator('#help-button').click(); await page.locator('[data-merging-book]').click();
  assert.equal(await page.locator('[data-book-entry]').count(), BOOK_ENTRIES.length);
  assert.equal(BOOK_ENTRIES.filter(entry => entry.kind === 'fusion').length, 8);
  const html = await page.locator('#merging-book').innerHTML();
  for (const [key, recipe] of Object.entries(FUSIONS).filter(([, recipe]) => recipe.secret)) {
    assert.equal(html.includes(recipe.name), false, `book must never mention ${recipe.name}`);
    assert.equal(html.includes(recipe.portrait), false, `book must never show ${key} portrait`);
  }
  checks.push('Book catalogs eight public merged forms and three combos; the three extra secrets remain absent after creating every form.');
  stage = 'new catalog capability in co-op';
  await page.locator('[aria-label="Close Book of Merging"]').click();
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'New gardener'); match.addPlayer('two', 'Partner'); match.manualPause = true;
  const board = match.board(), target = board._makeTower('spore', -3, 0, 160); target.ownerId = 'one';
  for (const player of match.players.values()) player.gold = 2000;
  match._syncWallets();
  const legacy = match.snapshot('fusion-catalog-browser-room'); legacy.fusionCatalogVersion = 1;
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), legacy); await frames();
  await page.evaluate(() => { window.__catalogCommands = []; gnomeward.multiplayer.command = command => { window.__catalogCommands.push(command); return true; }; });
  await select(target.id); assert.equal(await page.locator('[data-merge-open]').isDisabled(), true);
  await choose('boom'); const legacyPoint = await point(target.id); await page.mouse.click(legacyPoint.x, legacyPoint.y);
  assert.deepEqual(await page.evaluate(() => window.__catalogCommands), []);
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), match.snapshot('fusion-catalog-browser-room')); await frames();
  await choose('boom'); const currentPoint = await point(target.id); await page.mouse.click(currentPoint.x, currentPoint.y);
  const command = await page.evaluate(() => window.__catalogCommands.at(-1));
  assert.deepEqual(command, { action: 'placeMerge', type: 'boom', towerId: target.id });
  match.command('one', command);
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), match.snapshot('fusion-catalog-browser-room'));
  assert.equal(await page.evaluate(id => gnomeward.game.getFusionRoot(id).fusionKey, target.id), 'boom-spore');
  checks.push('Older fusion catalogs disable new recipes; catalog2 enables actual authoritative placement and Sporeburst snapshot rendering.');
  assert.deepEqual(errors, []);
  await writeFile('playtest-results/fusion-expansion-browser.json', JSON.stringify({ checks, errors, cast }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.error('Fusion expansion browser failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/fusion-expansion-failure.png' }).catch(() => {}); throw error;
} finally { clearInterval(progress); await browser.close(); }
