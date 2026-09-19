import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1320, height: 850 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
let stage = 'opening garden';
const progress = setInterval(() => console.log('Layout browser:', stage), 15000); progress.unref();
async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(220);
}
async function groundPoint(x, z) {
  return page.evaluate(({ x, z }) => {
    const renderer = gnomeward.renderer, rect = renderer.renderer.domElement.getBoundingClientRect();
    const point = renderer.camera.position.clone().set(x, 0, z).project(renderer.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }, { x, z });
}
async function selectTower(id) {
  const tower = await page.evaluate(id => { const tower = gnomeward.game.towers.find(t => t.id === id); return { x: tower.x, z: tower.z }; }, id);
  const point = await groundPoint(tower.x, tower.z);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(id => gnomeward.state.selectedTowerId === id && document.querySelector('.game-shell.has-selection') && !document.getElementById('selection-panel').hidden, id);
  await settled();
}
async function inspect(label, selected) {
  const data = await page.evaluate(() => {
    const rect = selector => { const node = document.querySelector(selector); if (node.hidden) return null; const r = node.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    const { renderer } = gnomeward;
    renderer.world.updateMatrixWorld(true);
    let maxX = 0, maxY = 0, vertices = 0;
    renderer.world.traverse(node => {
      if (!node.isMesh || !node.visible) return;
      node.geometry.computeBoundingBox(); const box = node.geometry.boundingBox;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const projected = renderer.camera.position.clone().set(x,y,z).applyMatrix4(node.matrixWorld).project(renderer.camera);
        maxX = Math.max(maxX, Math.abs(projected.x)); maxY = Math.max(maxY, Math.abs(projected.y)); vertices++;
      }
    });
    return { scene:rect('#scene'), panel:rect('#selection-panel'), shop:rect('.guardian-dock'), controls:rect('.battle-controls'), header:rect('.topbar'),
      viewport:{width:innerWidth,height:innerHeight}, canvas:{width:renderer.renderer.domElement.clientWidth,height:renderer.renderer.domElement.clientHeight},
      world:{maxX,maxY,vertices}, overflow:document.documentElement.scrollWidth > innerWidth };
  });
  const { scene, panel, shop, controls, header, viewport, canvas, world } = data;
  assert.equal(data.overflow, false, `${label}: no horizontal document overflow`);
  assert.ok(scene.width >= 220 && scene.height >= 100, `${label}: usable map viewport ${JSON.stringify(scene)}`);
  assert.ok(scene.left >= 0 && scene.top >= header.bottom + 3 && scene.right <= viewport.width && scene.bottom <= viewport.height, `${label}: map stays below the HUD and within the screen`);
  assert.ok(scene.bottom <= Math.min(shop.top, controls.top) - 3, `${label}: shop and controls do not cover the map`);
  assert.ok(Math.abs(canvas.width - scene.width) <= 1 && Math.abs(canvas.height - scene.height) <= 1, `${label}: WebGL canvas follows reserved viewport`);
  assert.ok(world.vertices > 0 && world.maxX <= 1.005 && world.maxY <= 1.005, `${label}: complete static garden fits camera ${JSON.stringify(world)}`);
  if (selected) {
    assert.ok(panel && panel.bottom <= Math.min(shop.top, controls.top) - 3, `${label}: upgrades stay above bottom controls`);
    if (viewport.width > 700) assert.ok(panel.left >= scene.right + 3, `${label}: upgrades dock to the right of the map`);
    else assert.ok(panel.top >= scene.bottom + 3 && panel.height >= 110, `${label}: phone upgrades dock below the map`);
  } else assert.equal(panel, null, `${label}: closed upgrade panel is hidden`);
  layouts.push({ label, ...data });
  return data;
}
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5180');
  await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.world.children.length > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  await page.evaluate(() => { gnomeward.state.paused = true; });
  await settled();
  await page.locator('[data-tower="sprout"]').click(); await settled();
  const first = await groundPoint(-4.25,-2.25); await page.mouse.click(first.x,first.y);
  await page.waitForFunction(() => gnomeward.game.towers.length === 1 && gnomeward.state.selectedTowerId != null);
  const id = await page.evaluate(() => gnomeward.game.towers[0].id);
  for (const viewport of [{width:1320,height:850},{width:1080,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
    stage = `${viewport.width}×${viewport.height} selected/closed map fit and picking`;
    await page.setViewportSize(viewport); await settled();
    const selected = await inspect(`${viewport.width} selected`, true);
    if (viewport.width === 1320 || viewport.width === 390 || viewport.width === 320) await page.screenshot({path:`playtest-results/layout-${viewport.width}-selected.png`});
    await page.locator('[data-close-upgrades]').click(); await settled();
    const closed = await inspect(`${viewport.width} closed`, false);
    if (viewport.width > 700) assert.ok(closed.scene.width > selected.scene.width + 200);
    else assert.ok(closed.scene.height > selected.scene.height + 100);
    await selectTower(id);
    // Choosing another defender should restore the full map before placement.
    await page.locator('[data-tower="sprout"]').click(); await settled();
    await inspect(`${viewport.width} choosing`, false);
    assert.equal(await page.evaluate(() => gnomeward.state.placingType), 'sprout');
    await page.keyboard.press('Escape'); await settled();
    await selectTower(id);
  }
  stage = 'phone placement, collapsed shop, and taller co-op HUD';
  await page.setViewportSize({width:390,height:844}); await settled();
  await page.locator('[data-tower="sprout"]').click(); await settled();
  const second = await groundPoint(1.75,.75); await page.mouse.click(second.x,second.y);
  await page.waitForFunction(() => gnomeward.game.towers.length === 2);
  await settled(); await inspect('phone new placement', true);
  await page.locator('#shop-toggle').click(); await settled(); await inspect('phone collapsed shop', true);
  await page.locator('#shop-toggle').click(); await settled();
  await page.evaluate(() => {
    const {game,state}=gnomeward;
    for(const tower of game.towers) tower.ownerId='one';
    state.multiplayer={roomId:'layout-fixture',sessionId:'one',hostId:'one',connected:true,reconnecting:false,paused:true,manualPause:true,started:true,
      autoSupported:true,autoStart:false,players:[{id:'one',name:'You',connected:true,ready:false},{id:'two',name:'A very tall teammate HUD',connected:false,ready:false}]};
  }); await settled();
  await inspect('phone taller co-op HUD',true);
  await page.screenshot({path:'playtest-results/layout-phone-coop-selected.png'});
  await page.evaluate(()=>{gnomeward.state.multiplayer=null;gnomeward.state.paused=true;}); await settled();
  await page.locator('[data-close-upgrades]').click(); await settled(); await inspect('phone co-op exit restored',false);
  assert.deepEqual(errors,[]);
  await writeFile('playtest-results/layout-browser.json',JSON.stringify({ok:true,layouts,errors},null,2));
  console.log(JSON.stringify({ok:true,checkedLayouts:layouts.length,errors}));
} catch(error) {
  console.error('Layout browser failed at:',stage,error);
  await page.screenshot({path:'playtest-results/layout-browser-failure.png'}).catch(()=>{});
  throw error;
} finally {clearInterval(progress);await browser.close();}
