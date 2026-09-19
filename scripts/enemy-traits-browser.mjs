import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';
import { Match } from '../server/match.js';
import { ENEMY_TRAITS } from '../src/enemy-traits.js';

// Deliberate encounter fixtures call the real spawning/discovery code at each
// milestone. They test presentation/persistence, not earned game progression.
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], encounters = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'opening a fresh garden';
const progress = setInterval(() => console.log('Enemy traits browser check:', stage), 15000); progress.unref();
async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(220);
}
async function enter() {
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
}
async function guide(expected) {
  // Capture the node synchronously with the real open handler, before the
  // next HUD refresh can hide an unintended replacement from the assertion.
  await page.evaluate(() => {
    document.getElementById('help-button').click();
    window.__traitsGuideRoot = document.getElementById('enemy-traits-guide');
  });
  await settled();
  assert.equal(await page.evaluate(() => window.__traitsGuideRoot?.isConnected && window.__traitsGuideRoot === document.getElementById('enemy-traits-guide')), true, 'opening a guide must preserve its node across HUD refreshes');
  const panel = page.locator('#enemy-traits-guide');
  await panel.waitFor();
  const ids = await panel.locator('[data-enemy-trait]').evaluateAll(elements => elements.map(element => element.dataset.enemyTrait).sort());
  assert.deepEqual(ids, [...expected].sort());
  const text = await panel.innerText();
  for (const trait of Object.values(ENEMY_TRAITS)) {
    if (!expected.includes(trait.id)) assert.doesNotMatch(text, new RegExp(trait.name, 'i'), 'unseen traits stay undisclosed');
    else {
      const row = panel.locator(`[data-enemy-trait="${trait.id}"]`);
      const entry = await row.innerText();
      assert.match(entry, new RegExp(trait.name, 'i'));
      assert.match(entry, new RegExp(trait.weak, 'i'));
      assert.match(entry, new RegExp(trait.resist, 'i'));
      assert.match(entry, /2\s*[x×]|[x×]\s*2|double/i);
      assert.match(entry, /0?\.5\s*[x×]|[x×]\s*0?\.5|half/i);
    }
  }
  assert.doesNotMatch(await page.locator('#game-dialog').innerText(), /sporefire|prismstorm|berry.?singularity/i);
  return panel;
}
async function closeGuide() { await page.locator('[aria-label="Close field guide"]').click(); }
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await enter();
  assert.deepEqual(await page.evaluate(() => gnomeward.game.profile.enemyTraits), []);
  await guide([]); await closeGuide();
  const seen = [];
  for (const trait of Object.values(ENEMY_TRAITS)) {
    stage = `first ${trait.id} encounter at round ${trait.startWave}`;
    await guide(seen);
    const fixture = await page.evaluate(({ wave, trait }) => {
      const { game, state } = gnomeward;
      Object.assign(state, { paused: true, autoStart: false, multiplayer: null, selectedTowerId: null, placingType: null });
      Object.assign(game, { endless: true, wave: wave - 1, status: 'planning', enemies: [], projectiles: [], effects: [] });
      if (!game.startWave()) throw new Error('Fixture round did not start');
      const variant = game._spawn('gold');
      const plain = game._spawn('gold');
      const boss = game._spawn('boss');
      for (const [enemy, progress] of [[variant, 10], [plain, 12], [boss, 16]]) Object.assign(enemy, game.pointAt(progress), { progress, speed: 0 });
      if (variant.trait !== trait) throw new Error('Milestone introduced the wrong trait');
      return { trait, variant: variant.id, plain: plain.id, boss: boss.id, hp: variant.hp, plainHp: plain.hp, color: variant.color, plainColor: plain.color };
    }, { wave: trait.startWave, trait: trait.id });
    seen.push(trait.id);
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').enemyTraits?.includes(id), trait.id);
    await page.waitForFunction(id => !!document.querySelector(`#enemy-traits-guide [data-enemy-trait="${id}"]`), trait.id);
    assert.equal(await page.evaluate(() => window.__traitsGuideRoot?.isConnected && window.__traitsGuideRoot === document.getElementById('enemy-traits-guide')), true, 'a discovery updates an open guide without detaching its scrolled section');
    await closeGuide();
    await settled();
    const visual = await page.evaluate(({ variant, plain, boss, trait }) => {
      const renderer = gnomeward.renderer;
      const object = renderer.entities.get('e' + variant), ordinary = renderer.entities.get('e' + plain), bossModel = renderer.entities.get('e' + boss);
      const accessory = object?.getObjectByName('enemy-trait-accessory');
      const sourceMaterials = new Set(), accessoryMeshes = [];
      renderer.models['trait-' + trait]?.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) sourceMaterials.add(material); });
      accessory?.traverse(child => { if (child.isMesh) accessoryMeshes.push({ shadows: child.castShadow || child.receiveShadow,
        vertexColors: (Array.isArray(child.material) ? child.material : [child.material]).every(material => material.vertexColors),
        pooled: (Array.isArray(child.material) ? child.material : [child.material]).every(material => sourceMaterials.has(material)) }); });
      const baseColors = model => {
        const skip = new Set();
        model.getObjectByName('enemy-trait-accessory')?.traverse(child => skip.add(child));
        const colors = [];
        model.traverse(child => { if (child.isMesh && !skip.has(child)) for (const material of Array.isArray(child.material) ? child.material : [child.material]) colors.push(material.color.getHexString()); });
        return colors.sort();
      };
      return { loaded: !!renderer.models['trait-' + trait], attached: accessory?.userData.trait, accessoryMeshes,
        ordinaryAccessory: !!ordinary?.getObjectByName('enemy-trait-accessory'), bossAccessory: !!bossModel?.getObjectByName('enemy-trait-accessory'),
        colors: baseColors(object), plainColors: baseColors(ordinary) };
    }, fixture);
    assert.equal(fixture.hp, fixture.plainHp); assert.equal(fixture.color, fixture.plainColor);
    assert.equal(visual.loaded, true); assert.equal(visual.attached, trait.id);
    assert.ok(visual.accessoryMeshes.length > 0 && visual.accessoryMeshes.every(mesh => mesh.vertexColors && mesh.pooled && !mesh.shadows));
    assert.equal(visual.ordinaryAccessory, false); assert.equal(visual.bossAccessory, false);
    assert.deepEqual(visual.colors, visual.plainColors, 'accessories preserve the underlying skeleton palette');
    encounters.push({ ...fixture, ...visual });
    await page.screenshot({ path: `playtest-results/enemy-trait-${trait.id}.png` });
    const detail = await page.evaluate(id => {
      const { game, renderer } = gnomeward, enemy = game.enemies.find(unit => unit.id === id);
      const projected = renderer.camera.position.clone().set(enemy.x, .9, enemy.z).project(renderer.camera);
      const rect = renderer.renderer.domElement.getBoundingClientRect();
      return { x: Math.max(0, Math.min(innerWidth - 220, rect.x + (projected.x + 1) * rect.width / 2 - 110)),
        y: Math.max(0, Math.min(innerHeight - 220, rect.y + (1 - projected.y) * rect.height / 2 - 110)), width: 220, height: 220 };
    }, fixture.variant);
    await page.screenshot({ path: `playtest-results/enemy-trait-${trait.id}-detail.png`, clip: detail });
    await guide(seen); await closeGuide();
  }

  stage = 'attack-kind labels and phone field guide';
  for (const [type, kind] of [['sprout', 'physical'], ['stun', 'magic'], ['spore', 'poison']]) {
    await page.evaluate(type => {
      const tower = gnomeward.game._makeTower(type, 0, 0, 0);
      gnomeward.state.selectedTowerId = tower.id;
    }, type);
    await page.waitForFunction(kind => document.querySelector('#selection-panel .damage-kind')?.textContent.toLowerCase().includes(kind), kind);
    assert.doesNotMatch(await page.locator('#selection-panel').innerText(), /sporefire|prismstorm|berry.?singularity/i);
    await page.locator('[data-close-upgrades]').click();
  }
  await page.setViewportSize({ width: 390, height: 844 }); await settled();
  const phoneGuide = await guide(seen);
  await phoneGuide.scrollIntoViewIfNeeded(); await settled();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const row of await phoneGuide.locator('[data-enemy-trait]').all()) {
    const bounds = await row.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'trait entry fits the phone viewport');
  }
  await page.screenshot({ path: 'playtest-results/enemy-traits-phone-guide.png' });
  await closeGuide();

  stage = 'solo discoveries survive reload';
  await page.reload(); await enter();
  assert.deepEqual((await page.evaluate(() => gnomeward.game.profile.enemyTraits)).sort(), [...seen].sort());
  await guide(seen); await closeGuide();
  assert.equal(await page.evaluate(() => gnomeward.game.wave), 0, 'only discovery knowledge persists, not the injected combat fixture');

  stage = 'co-op server snapshot discovers traits in a fresh local collection';
  await page.evaluate(() => localStorage.removeItem('gnomeward-profile'));
  await page.reload(); await enter();
  assert.deepEqual(await page.evaluate(() => gnomeward.game.profile.enemyTraits), []);
  await page.setViewportSize({ width: 1280, height: 800 });
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'First'); match.addPlayer('two', 'Second');
  match.started = true; match.manualPause = true;
  const board = match.board();
  Object.assign(board, { endless: true, wave: 34 });
  assert.equal(board.startWave(), true);
  for (let ordinal = 0; ordinal < 9; ordinal++) {
    const enemy = board._spawn('gold');
    const position = 8 + ordinal;
    Object.assign(enemy, board.pointAt(position), { progress: position, speed: 0 });
  }
  // Invoke the normal incoming-snapshot callback: Match.snapshot → client
  // adapter → main profile merge → renderer. This deliberately omits transport.
  await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), match.snapshot('trait-fixture'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('gnomeward-profile') || '{}').enemyTraits?.length === 3);
  await settled();
  const coop = await page.evaluate(() => {
    const { game, renderer, state } = gnomeward;
    const tagged = game.enemies.filter(enemy => enemy.trait);
    return { known: game.profile.enemyTraits, room: state.multiplayer.roomId, tagged: tagged.map(enemy => ({ trait: enemy.trait,
      rendered: renderer.entities.get('e' + enemy.id)?.getObjectByName('enemy-trait-accessory')?.userData.trait })),
      motionFrames: renderer.motion.frames.length };
  });
  assert.deepEqual([...coop.known].sort(), [...seen].sort());
  assert.equal(coop.room, 'trait-fixture'); assert.ok(coop.motionFrames > 0);
  assert.equal(coop.tagged.length, 3);
  assert.ok(coop.tagged.every(enemy => enemy.rendered === enemy.trait));
  await page.screenshot({ path: 'playtest-results/enemy-traits-coop.png' });
  await guide(seen); await closeGuide();
  await page.reload(); await enter();
  assert.deepEqual((await page.evaluate(() => gnomeward.game.profile.enemyTraits)).sort(), [...seen].sort(), 'co-op discoveries carry back to solo');
  assert.deepEqual(errors, []);
  const summary = { ok: true, encounters, coop, errors };
  await writeFile('playtest-results/enemy-traits-browser.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: true, traits: seen, coop, errors }, null, 2));
} catch (error) {
  console.error('Enemy traits browser check failed at:', stage, error);
  await page.screenshot({ path: 'playtest-results/enemy-traits-browser-failure.png' }).catch(() => {});
  throw error;
} finally { clearInterval(progress); await browser.close(); }
