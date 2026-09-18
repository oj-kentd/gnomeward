import { enterGarden } from './browser-helpers.mjs';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward && document.getElementById('loading-card').hidden && gnomeward.renderer.renderer.info.render.frame > 3);
  await page.locator('#dismiss-tip').click();
  await page.locator('#map-button').click();
  const ids = await page.locator('[data-map]').evaluateAll(nodes => nodes.map(n => n.dataset.map));
  if (ids.length !== 6) throw Error('Expected six garden choices');
  await page.screenshot({ path: 'playtest-results/map-choices.png' });
  await page.keyboard.press('Escape');
  const maps = [];
  for (const id of ids) {
    await page.locator('#map-button').click();
    await page.locator(`[data-map="${id}"]`).click();
    const result = await page.evaluate(() => {
      const g = gnomeward.game, w = gnomeward.renderer;
      gnomeward.state.paused = true;
      const arrows = w.world.children.filter(o => o.userData.entrance);
      if (arrows.length !== g.routes.length) throw Error('Every entrance needs an arrow');
      if (g.routes.length > 1 && !document.getElementById('map-button').title.includes('2 entrances')) throw Error('Missing dual-entrance help');
      g.startWave(); g._queue = [];
      const enemies = Array.from({ length: g.routes.length * 2 }, () => g._spawn('gold'));
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.routeIndex !== i % g.routes.length) throw Error('Entrances did not alternate');
        const initial = g.pointAt(0, enemy.routeIndex);
        if (Math.hypot(enemy.x - initial.x, enemy.z - initial.z) > .001) throw Error('Wrong spawn coordinates');
        enemy.progress = 1 + Math.floor(i / g.routes.length) * 1.6;
        Object.assign(enemy, g.pointAt(enemy.progress, enemy.routeIndex));
      }
      g.update(.1);
      w.render(g, gnomeward.state, g.time);
      for (const enemy of enemies) {
        const actor = w.entities.get('e' + enemy.id);
        if (!actor || Math.hypot(actor.position.x - enemy.x, actor.position.z - enemy.z) > .001) throw Error('Enemy renderer lost route');
      }
      for (let route = 0; route < g.routes.length; route++) {
        const p = g.pointAt(2, route);
        if (g.canPlace('sprout', p.x, p.z)) throw Error('Placement allowed on a route');
      }
      return { id: g.map.id, topology: g.map.topology, arrows: arrows.length, lengths: g.routes.map(r => r.length), enemyRoutes: enemies.map(e => e.routeIndex) };
    });
    await page.waitForTimeout(180);
    await page.screenshot({ path: `playtest-results/map-${id}.png` });
    maps.push(result);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Math.abs(document.querySelector('canvas').getBoundingClientRect().width - 390) < 1);
  await page.screenshot({ path: 'playtest-results/map-dual-mobile.png' });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Phone page overflows');
  console.log(JSON.stringify({ maps, mobile: true, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (error) { console.error('Browser errors:', errors); await page.screenshot({path:'playtest-results/maps-failure.png'}).catch(()=>{}); throw error; } finally { await browser.close(); }
