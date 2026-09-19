import { enterGarden } from './browser-helpers.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
let page, stage = 'loading';
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5175'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 2);

  if (await page.locator('#welcome-tip').isVisible()) await page.locator('#dismiss-tip').click();
  stage = 'opening Strawberry Fields through the map picker';
  await page.locator('#map-button').click();
  assert.match(await page.locator('[data-map="strawberry"]').innerText(), /Two entrances/);
  await page.locator('[data-map="strawberry"]').click();
  await page.waitForFunction(() => gnomeward.game.map.id === 'strawberry' && gnomeward.renderer.entities.size > 0);
  const initial = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer;
    const tower = game.towers.find(tower => tower.type === 'strawberry');
    const model = world.entities.get('t' + tower?.id);
    const entranceModels = world.world.children.filter(object => object.userData.entrance);
    return { gold: game.gold, towers: game.towers.length, freeTower: tower && { type: tower.type, x: tower.x, z: tower.z, levels: tower.levels }, model: !!model?.getObjectByName('gnome-strawberry'), entrances: entranceModels.length, routeEntrances: game.map.paths.map(route => route[0]), unlocked: game.isUnlocked('strawberry') };
  });
  assert.equal(initial.gold, 650);
  assert.equal(initial.towers, 1);
  assert.deepEqual(initial.freeTower, { type: 'strawberry', x: 0, z: 0, levels: [0, 0, 0] });
  assert.equal(initial.model, true, 'The free tower uses the Strawberry Blender character');
  assert.equal(initial.entrances, 2);
  assert.notDeepEqual(initial.routeEntrances[0], initial.routeEntrances[1]);
  assert.equal(initial.unlocked, false);
  const shop = page.locator('[data-tower="strawberry"]');
  assert.equal(await shop.isDisabled(), true);
  assert.match(await shop.innerText(), /Clear Strawberry Fields/);
  assert.match(await shop.getAttribute('title'), /Clear all 20 rounds of Strawberry Fields/);
  await shop.evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'end' }));
  await page.screenshot({ path: 'playtest-results/strawberry-desktop.png' });

  stage = 'selecting and inspecting the free Strawberry Gnome';
  const point = await page.evaluate(() => {
    const world = gnomeward.renderer, projected = world.camera.position.clone().set(0, .8, 0).project(world.camera);
    const rect = world.renderer.domElement.getBoundingClientRect();
    return { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => gnomeward.state.selectedTowerId === gnomeward.game.towers[0].id);
  assert.equal(await page.locator('[data-upgrade]').count(), 3);
  assert.match(await page.locator('#selection-panel').innerText(), /Juicy Payload/);
  assert.match(await page.locator('#selection-panel').innerText(), /Seed Storm/);
  assert.match(await page.locator('#selection-panel').innerText(), /Quick Harvest/);
  await page.getByRole('button', { name: 'Close upgrades' }).click();

  stage = 'rendering an actual mortar projectile at the top of its arc';
  const flight = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer, tower = game.towers[0];
    gnomeward.state.paused = true;
    game.startWave(); game._queue = []; game._spawnTimer = 999;
    game.enemies = []; game.effects = []; game.projectiles = []; tower.cooldown = 999;
    const target = game._spawn('bone', 0);
    Object.assign(target, game.pointAt(15, 0), { progress: 15, hp: 10, maxHp: 10, speed: 0 });
    const keeper = game._spawn('bone', 1); keeper.speed = 0;
    const stats = game.getStats(tower);
    game._launch(tower, target, stats);
    const shot = game.projectiles.find(shot => shot.type === 'strawberry-mortar');
    const launch = { x: shot.x, z: shot.z, tx: shot.tx, tz: shot.tz };
    for (let i = 0; i < 15; i++) game.update(.05);
    world.render(game, gnomeward.state, game.time);
    const object = world.fx.get(shot.id), materials = new Set();
    object.traverse(child => { if (child.isMesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material.name); });
    window.__strawberrySmoke = { targetId: target.id, shotId: shot.id, towerId: tower.id };
    return { type: shot.type, launch, position: object.position.toArray(), materials: [...materials], remaining: shot.ttl, targetHp: target.hp, modeled: !!object.getObjectByName('strawberry-fruit') };
  });
  assert.equal(flight.type, 'strawberry-mortar');
  assert.equal(flight.modeled, true);
  assert.ok(flight.position[1] > 3, 'Mortar fruit visibly rises above the garden');
  assert.ok(Math.abs(flight.position[0] - (flight.launch.x + flight.launch.tx) / 2) < .05);
  assert.ok(Math.abs(flight.position[2] - (flight.launch.z + flight.launch.tz) / 2) < .05);
  assert.equal(flight.targetHp, 10, 'Damage waits for the landing');
  assert.ok(flight.materials.includes('berry-red') && flight.materials.includes('berry-seed') && flight.materials.includes('berry-leaf-light'));
  await page.screenshot({ path: 'playtest-results/strawberry-mortar.png' });

  stage = 'rendering eight black seed rays without an explosion blob';
  const burst = await page.evaluate(() => {
    const game = gnomeward.game, world = gnomeward.renderer;
    for (let i = 0; i < 60 && game.projectiles.some(shot => shot.type === 'strawberry-mortar'); i++) game.update(.025);
    const countAtImpact = game.projectiles.filter(shot => shot.type === 'strawberry-seed').length;
    game.update(.20);
    world.render(game, gnomeward.state, game.time);
    const seeds = game.projectiles.filter(shot => shot.type === 'strawberry-seed');
    return {
      countAtImpact, count: seeds.length, targetDead: !game.enemies.some(enemy => enemy.id === window.__strawberrySmoke.targetId && enemy.hp > 0),
      explosion: game.effects.some(effect => effect.type === 'explosion' && world.fx.has(effect.id)),
      allModeled: seeds.every(seed => !!world.fx.get(seed.id)?.getObjectByName('strawberry-seed')),
      allBlack: seeds.every(seed => {
        let black = true;
        world.fx.get(seed.id)?.traverse(child => {
          if (!child.isMesh) return;
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            if (Math.max(material.color.r, material.color.g, material.color.b) > .02) black = false;
          }
        });
        return black;
      }),
      radii: seeds.map(seed => Math.hypot(world.fx.get(seed.id).position.x - seed.x, world.fx.get(seed.id).position.z - seed.z)),
      directions: seeds.map(seed => Math.atan2(seed.tz - seed.z, seed.tx - seed.x)),
    };
  });
  assert.equal(burst.countAtImpact, 8);
  assert.equal(burst.count, 8);
  assert.equal(burst.targetDead, true);
  assert.equal(burst.explosion, false);
  assert.equal(burst.allModeled, true);
  assert.equal(burst.allBlack, true);
  assert.ok(burst.radii.every(radius => radius > 1 && radius < 2), 'Eight seeds visibly travel outward from the landing');
  assert.equal(new Set(burst.directions.map(angle => angle.toFixed(3))).size, 8);
  await page.screenshot({ path: 'playtest-results/strawberry-seed-burst.png' });

  stage = 'checking the Strawberry Fields phone layout';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#map-button').click();
  await page.locator('[data-map="strawberry"]').click();
  await page.waitForFunction(() => {
    const scene = document.querySelector('#scene').getBoundingClientRect();
    const canvas = gnomeward.renderer.renderer.domElement.getBoundingClientRect();
    return gnomeward.game.wave === 0 && gnomeward.game.towers.length === 1
      && gnomeward.renderer.entities.has('t' + gnomeward.game.towers[0].id)
      && scene.width > 300 && Math.abs(canvas.width - scene.width) < 1
      && Math.abs(canvas.height - scene.height) < 1;
  });
  await page.locator('[data-tower="strawberry"]').evaluate(element => element.scrollIntoView({ block: 'nearest', inline: 'end' }));
  const phone = await page.evaluate(() => ({
    noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth,
    noVerticalScroll: document.documentElement.scrollHeight <= innerHeight + 1,
    map: gnomeward.game.map.id,
    entrances: gnomeward.renderer.world.children.filter(object => object.userData.entrance).length,
    freeGnomeRendered: !!gnomeward.renderer.entities.get('t' + gnomeward.game.towers[0].id),
    mapAboveShop: document.querySelector('#scene').getBoundingClientRect().bottom < document.querySelector('.guardian-dock').getBoundingClientRect().top,
  }));
  assert.equal(phone.noHorizontalScroll, true);
  assert.equal(phone.noVerticalScroll, true);
  assert.equal(phone.entrances, 2);
  assert.equal(phone.freeGnomeRendered, true);
  assert.equal(phone.mapAboveShop, true);
  await page.screenshot({ path: 'playtest-results/strawberry-phone.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ initial, flight, burst, phone, errors }, null, 2));
} catch (error) {
  console.error(`Strawberry browser smoke failed while ${stage}:`, error);
  if (page) await page.screenshot({ path: 'playtest-results/strawberry-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
