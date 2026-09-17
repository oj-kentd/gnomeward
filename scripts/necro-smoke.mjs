import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { MAPS, SECRETS, cottagePosition, cottageDoorPosition } from '../src/data.js';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let page, stage = 'loading the garden';
async function ready() {
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 4);
}
async function point(x, y, z) {
  return page.evaluate(({ x, y, z }) => {
    const world = gnomeward.renderer;
    const p = world.camera.position.clone().set(x, y, z).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  }, { x, y, z });
}
async function clickWorld(x, y, z) {
  const p = await point(x, y, z);
  await page.mouse.click(p.x, p.y);
}
async function map(id) {
  await page.locator('#map-button').click();
  await page.locator(`[data-map="${id}"]`).click();
  await page.waitForFunction((id) => gnomeward.game.map.id === id, id);
}
async function pumpkin(id) {
  console.log('Clicking pumpkin:', id);
  const spot = SECRETS.hollow.spots.find((spot) => spot.id === id);
  await clickWorld(spot.x, .38, spot.z);
}
async function progress(count) {
  await page.waitForFunction((count) => gnomeward.game.secretDiscoveries.length === count, count, { timeout: 45000 });
  console.log('Puzzle progress:', count);
}
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(45000);
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', (message) => { if (message.type() === 'error') { errors.push(message.text()); console.error('Browser console:', message.text()); } });
  await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173');
  await ready();
  assert.equal(await page.locator('[data-tower="necro"]').isDisabled(), true);
  assert.match(await page.locator('[data-tower="necro"]').innerText(), /\?\?\?/);
  assert.match(await page.locator('[data-tower="necro"]').getAttribute('title'), /A quiet secret in Pumpkin Hollow/);
  assert.doesNotMatch(await page.locator('#roster').innerText(), /undefined/);

  stage = 'reading the cottage clue and discovering the ordered pumpkin puzzle';
  await map('hollow');
  const cottage = cottagePosition(MAPS.find((map) => map.id === 'hollow'));
  await clickWorld(cottage.x, 1.5, cottage.z);
  await page.getByRole('heading', { name: 'The cottage rhyme' }).waitFor();
  assert.match(await page.locator('dialog').innerText(), /The moon rises, a star wakes, a leaf falls, and a flame guides you home/);
  await page.screenshot({ path: 'playtest-results/necro-clue.png' });
  await page.getByRole('button', { name: 'Close cottage clue' }).click();
  await pumpkin('hollow-moon'); await progress(1);
  await pumpkin('hollow-moon'); await progress(1);
  await pumpkin('hollow-leaf'); await progress(0);
  for (const [index, id] of SECRETS.hollow.order.entries()) {
    await pumpkin(id); await progress(index + 1);
  }
  await page.waitForFunction(() => gnomeward.game.isUnlocked('necro'));
  const unlock = await page.evaluate(() => ({ gold: gnomeward.game.gold, towers: gnomeward.game.towers.length, saved: JSON.parse(localStorage.getItem('gnomeward-profile')).unlocks.includes('necro') }));
  assert.deepEqual(unlock, { gold: 650, towers: 0, saved: true }, 'Puzzle unlocks Morrow without a free summon');
  await page.screenshot({ path: 'playtest-results/necro-pumpkins.png' });

  stage = 'purchasing Morrow and choosing two of three paths';
  await map('meadow');
  await page.locator('[data-tower="necro"]').click();
  await clickWorld(8, 0, -1);
  await page.waitForFunction(() => gnomeward.game.towers.some((tower) => tower.type === 'necro'));
  await page.evaluate(() => { gnomeward.game.points = 250; });
  await page.waitForFunction(() => !document.querySelector('[data-upgrade="0"]').disabled);
  assert.equal(await page.locator('[data-upgrade]').count(), 3);
  assert.match(await page.locator('.upgrade-path').first().innerText(), /New helper HP 50 → 90/);
  assert.match(await page.locator('.upgrade-path').nth(1).innerText(), /Dispatch 2.4s → 1.8s/);
  await page.locator('[data-targeting]').click();
  assert.equal(await page.evaluate(() => gnomeward.game.towers[0].targeting), 'last');
  await page.locator('[data-upgrade="0"]').click();
  await page.locator('[data-upgrade="1"]').click();
  assert.equal(await page.locator('[data-upgrade="2"]').isDisabled(), true);
  assert.match(await page.locator('#selection-panel').innerText(), /Choose 2 of 3 paths/);
  assert.match(await page.locator('.necro-ability').innerText(), /apply to new summons/);
  const stats = await page.evaluate(() => gnomeward.game.getStats(gnomeward.game.towers[0]));
  assert.equal(stats.allyHp, 90); assert.equal(stats.allyDamage, 14);
  assert.equal(stats.allyLimit, 5); assert.equal(stats.summonInterval, 1.8);
  await page.screenshot({ path: 'playtest-results/necro-upgrades.png' });
  await page.locator('#pause-button').click();
  assert.equal(await page.evaluate(() => gnomeward.state.paused), true);

  stage = 'checking real spell kills and a rendered cottage departure';
  const departure = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer, tower = game.towers[0];
    const stats = game.getStats(tower), end = game.routeLength(0);
    game.startWave(); game._queue = []; game._spawnTimer = 999;
    game.enemies = []; game.effects = []; game.projectiles = []; tower.cooldown = 999;
    function enemy(progress, hp) {
      const actor = game._spawn('bone');
      Object.assign(actor, game.pointAt(progress, 0), { progress, routeIndex: 0, speed: 0, hp, maxHp: hp });
      return actor;
    }
    const victims = [enemy(end - 4.4, 1), enemy(end - 4.4, 1)];
    const melee = enemy(end - .3, stats.allyDamage * 3);
    enemy(1, 1000); // Keep the round alive after the nearby enemies are defeated.
    for (const victim of victims) game._launch(tower, victim, stats);
    for (let i = 0; i < 200 && !game.allies.length; i++) game.update(.01);
    const ally = game.allies[0];
    if (!ally) throw Error('Spell kills did not dispatch a reborn gnome');
    const born = { x: ally.x, z: ally.z, phase: ally.phase, hp: ally.hp, damage: ally.damage, sourceId: ally.sourceId };
    world.render(game, gnomeward.state, game.time);
    const model = world.allies.get(ally.id);
    if (!model) throw Error('The reborn helper model was not rendered');
    const initialPosition = model.position.clone();
    game.update(.1); world.render(game, gnomeward.state, game.time);
    window.__necroSmoke = { firstId: ally.id, meleeId: melee.id, startingHp: melee.hp };
    return { born, towerId: tower.id, spellKills: tower.kills, active: game.allies.length, waiting: tower.soulQueue.length, modelMoved: model.position.distanceTo(initialPosition) > .01 };
  });
  const door = cottageDoorPosition(MAPS.find((map) => map.id === 'meadow'));
  assert.ok(Math.abs(departure.born.x - door.x) < 1e-8 && Math.abs(departure.born.z - door.z) < 1e-8, 'New helpers must begin at the cottage door');
  assert.equal(departure.born.phase, 'joining');
  assert.equal(departure.born.hp, 90); assert.equal(departure.born.damage, 14);
  assert.equal(departure.born.sourceId, departure.towerId);
  assert.equal(departure.spellKills, 2); assert.equal(departure.active, 1); assert.equal(departure.waiting, 1);
  assert.equal(departure.modelMoved, true);
  await page.waitForFunction(() => document.querySelector('[data-helper-active]')?.textContent === '1' && document.querySelector('[data-helper-waiting]')?.textContent === '1');
  await page.screenshot({ path: 'playtest-results/necro-departure.png' });

  stage = 'checking reborn melee without recursive summons';
  const combat = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer, fixture = window.__necroSmoke;
    const target = game.enemies.find((enemy) => enemy.id === fixture.meleeId);
    for (let i = 0; i < 100 && target.hp === fixture.startingHp; i++) game.update(.05);
    const ally = game.allies.find((ally) => ally.id === fixture.firstId);
    world.render(game, gnomeward.state, game.time);
    return { phase: ally?.phase, targetId: ally?.targetId, enemyId: target.id, damage: fixture.startingHp - target.hp, rendered: world.allies.has(ally?.id), effect: game.effects.some((effect) => effect.type === 'reborn-hit') };
  });
  assert.equal(combat.phase, 'fighting'); assert.equal(combat.targetId, combat.enemyId);
  assert.equal(combat.damage, 14); assert.equal(combat.rendered, true); assert.equal(combat.effect, true);
  await page.screenshot({ path: 'playtest-results/necro-melee.png' });
  const finalCrew = await page.evaluate(() => {
    const game = gnomeward.game;
    game.enemies.find((enemy) => enemy.id === window.__necroSmoke.meleeId).hp = .1;
    for (let i = 0; i < 80; i++) game.update(.05);
    return { active: game.allies.length, waiting: game.towers[0].soulQueue.length, kills: game.towers[0].kills, enemyDead: !game.enemies.some((enemy) => enemy.id === window.__necroSmoke.meleeId) };
  });
  assert.deepEqual(finalCrew, { active: 2, waiting: 0, kills: 3, enemyDead: true }, 'Only spell kills earn new helpers');

  stage = 'checking saved unlock and the phone puzzle with the shop visible';
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => gnomeward.game.isUnlocked('necro')), true);
  await page.evaluate(() => localStorage.removeItem('gnomeward-profile'));
  await page.reload(); await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Math.abs(document.querySelector('canvas').getBoundingClientRect().width - 390) < 1);
  await map('hollow');
  await page.getByRole('button', { name: 'Dismiss welcome tip' }).click();
  const mobileVisibility = [];
  for (const [index, id] of SECRETS.hollow.order.entries()) {
    const spot = SECRETS.hollow.spots.find((spot) => spot.id === id);
    const p = await point(spot.x, .38, spot.z);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, p);
    mobileVisibility.push({ id, hit });
    assert.equal(hit, 'CANVAS', `${id} must be clickable with the phone shop visible`);
    await pumpkin(id); await progress(index + 1);
  }
  assert.equal(await page.evaluate(() => gnomeward.game.isUnlocked('necro')), true);
  await page.screenshot({ path: 'playtest-results/necro-mobile.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ unlock, departure, combat, finalCrew, mobileVisibility, errors }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: 'playtest-results/necro-failure.png', timeout: 10000 }).catch(() => {});
  console.error(JSON.stringify({ stage, errors, discoveries: page ? await page.evaluate(() => window.gnomeward?.game.secretDiscoveries).catch(() => null) : null }, null, 2));
  throw new Error(`Necromancer smoke failed while ${stage}: ${error.message}`, { cause: error });
} finally {
  await browser.close();
}
