import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { enterGarden } from './browser-helpers.mjs';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400 && r.url().includes('/assets/')) errors.push(r.url());});
try {
 await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enterGarden(page);
 await page.waitForFunction(()=>window.gnomeward?.ready);
 if(await page.locator('#dismiss-tip').isVisible())await page.locator('#dismiss-tip').click();
 await page.locator('[data-tower="ricochet"]').click();
 assert.equal(await page.evaluate(()=>gnomeward.state.placingType),'ricochet');
 await page.keyboard.press('Escape');
 const id=await page.evaluate(()=>{
  const {game,state}=gnomeward;state.paused=true;game.gold=10000;game.points=1000;
  const tower=game._makeTower('ricochet',0,0,240);state.selectedTowerId=tower.id;return tower.id;
 });
 await page.waitForFunction(()=>document.querySelector('#selection-panel')?.innerText.includes('Skip'));
 assert.equal(await page.locator('[data-upgrade]').count(),2);
 await page.locator('[data-upgrade="1"]').click();
 await page.locator('[data-upgrade="0"]').click();
 const volley=await page.evaluate(id=>{
  const {game}=gnomeward,t=game.towers.find(t=>t.id===id);
  const enemy=game._spawn('bone');enemy.x=4;enemy.z=0;
  game._launch(t,enemy,game.getStats(t));game.enemies=[];game._advanceProjectiles(.1);
  return {count:game.projectiles.length,ids:game.projectiles.map(p=>p.id),angles:game.projectiles.map(p=>Math.atan2(p.vz,p.vx)),ttl:game.projectiles[0].maxTtl};
 },id);
 assert.equal(volley.count,2);assert.equal(new Set(volley.angles).size,2);assert.equal(volley.ttl,6);
 await page.waitForFunction(ids=>ids.every(id=>{const o=gnomeward.renderer.fx.get(id);return o&&Number.isFinite(o.position.x)&&o.scale.x>0;}),volley.ids);
 await page.evaluate(()=>{const g=gnomeward.game;g.profile.unlocks.push('multi','necro');const a=g._makeTower('multi',4,0,290),b=g._makeTower('necro',5,0,320),c=g.towers.find(t=>t.type==='ricochet');if(!g.mergeTowers(a.id,b.id)||!g.mergeTowers(a.id,c.id))throw Error('fusion failed');});
 await page.waitForFunction(()=>[...gnomeward.renderer.entities.values()].some(o=>o.userData.modelName==='gnome-fusion-multi-necro-ricochet'));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('[data-tower="ricochet"]').count(),1);
 assert.deepEqual(errors,[]);
 console.log('Skip shop, upgrades, blue projectile rendering, Soulbounce model and phone roster passed.');
} finally {await browser.close();}
