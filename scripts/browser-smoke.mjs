import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}});
page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url)});
await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173');await page.waitForFunction(()=>window.gnomeward&&document.getElementById('loading-card').hidden);await page.waitForFunction(()=>gnomeward.renderer.renderer.info.render.frame>4);await page.screenshot({path:'playtest-results/initial.png'});
const immersiveLayout = await page.evaluate(() => {
  const canvas = document.querySelector('canvas').getBoundingClientRect();
  const world = gnomeward.renderer;
  const corners = [[-12.7,-8.7],[-12.7,8.7],[12.7,-8.7],[12.7,8.7]].map(([x,z]) => world.camera.position.clone().set(x,0,z).project(world.camera));
  return {
    canvasFillsScreen: canvas.width >= innerWidth * .98 && canvas.height >= innerHeight * .98,
    gardenWidth: (Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x))) / 2,
    gardenHeight: (Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))) / 2,
    noPageScroll: document.documentElement.scrollHeight <= innerHeight + 1,
  };
});
if (!immersiveLayout.canvasFillsScreen || !immersiveLayout.noPageScroll || immersiveLayout.gardenWidth < .9 || immersiveLayout.gardenHeight < .75) throw Error('The actual garden must nearly fill the screen');
async function place(type,x,z){await page.locator(`[data-tower="${type}"]`).click();await page.locator('canvas').scrollIntoViewIfNeeded();const p=await page.evaluate(({x,z})=>{const w=gnomeward.renderer,p=w.camera.position.clone().set(x,0,z).project(w.camera),r=w.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}},{x,z});await page.mouse.click(p.x,p.y);}
await place('sprout',-5,2);await place('spore',-5,-2);await place('boom',-3,1);await place('sprout',1,1);
await page.locator('#start-button').click();await page.waitForTimeout(1800);await page.screenshot({path:'playtest-results/playing.png'});
const first=await page.evaluate(()=>({towers:gnomeward.game.towers.length,gold:gnomeward.game.gold,status:gnomeward.game.status,enemies:gnomeward.game.enemies.length}));
const speedBefore=await page.evaluate(()=>gnomeward.state.speed);
const waveBefore=await page.evaluate(()=>gnomeward.game.wave);
await page.locator('#start-button').click();
if(await page.evaluate(()=>gnomeward.state.speed)===speedBefore||await page.evaluate(()=>gnomeward.game.wave)!==waveBefore)throw Error('Active play button must change speed without starting another wave');
await page.locator('#pause-button').click();const t=await page.evaluate(()=>gnomeward.game.time);await page.waitForTimeout(300);if(await page.evaluate(()=>gnomeward.game.time)!==t)throw Error('pause failed');
const projectileCheck = await page.evaluate(() => {
  const g = gnomeward.game, world = gnomeward.renderer;
  for (let i = 0; i < 500 && !g.projectiles.length; i++) g.update(.05);
  const shot = g.projectiles[0];
  if (!shot) throw Error('No projectile was launched');
  world.render(g, gnomeward.state, g.time);
  const object = world.fx.get(shot.id), before = object.position.clone();
  const round = Math.max(...object.scale.toArray()) - Math.min(...object.scale.toArray()) < .001;
  g.update(Math.min(.05, shot.ttl / 2));
  world.render(g, gnomeward.state, g.time);
  return { round, moved: object.position.distanceTo(before) > .01 };
});
if (!projectileCheck.round || !projectileCheck.moved) throw Error('Projectile must be a moving pellet');
await page.screenshot({path:'playtest-results/projectiles.png'});
await page.evaluate(()=>{const g=gnomeward.game;for(let w=0;w<3;w++){if(g.status==='planning')g.startWave();for(let i=0;i<6000&&g.status==='wave';i++)g.update(.05)}});await page.waitForTimeout(250);
// Select a placed Sprout through the actual battlefield and buy two paths.
const point=await page.evaluate(()=>{const w=gnomeward.renderer,p=w.camera.position.clone().set(-5,1.2,2).project(w.camera),r=w.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}});await page.mouse.click(point.x,point.y);
const upgradesVisible = await page.evaluate(() => {
  const panel = document.getElementById('selection-panel').getBoundingClientRect();
  const board = document.querySelector('.board-wrap').getBoundingClientRect();
  return panel.top >= board.top && panel.bottom <= board.bottom + 1 && panel.left >= board.left && panel.right <= board.right + 1 && document.getElementById('selection-panel').parentElement.classList.contains('board-wrap');
});
if (!upgradesVisible) throw Error('Selected upgrades must be visible without scrolling');
await page.locator('[data-targeting]').click();
if(await page.evaluate(()=>gnomeward.game.towers[0].targeting)!=='last')throw Error('Targeting must cycle from First to Last');
await page.locator('[data-upgrade="0"]').click();await page.locator('[data-upgrade="1"]').click();if(!await page.locator('[data-upgrade="2"]').isDisabled())throw Error('third path not locked');
await page.screenshot({path:'playtest-results/upgrades.png'});
const combat=await page.evaluate(()=>({wave:gnomeward.game.wave,lives:gnomeward.game.lives,points:gnomeward.game.points,kills:gnomeward.game.kills,levels:gnomeward.game.towers[0].levels}));
// Auto rounds waits through pauses and menus, can be cancelled, and starts after the visible countdown.
await page.locator('#auto-button').click();
await page.waitForFunction(()=>gnomeward.state.autoCountdown!==null);
const countdown=await page.evaluate(()=>gnomeward.state.autoCountdown);
await page.waitForTimeout(350);
if(await page.evaluate(()=>gnomeward.state.autoCountdown)!==countdown)throw Error('Paused auto countdown must freeze');
// Open the menu while paused so slow software-rendered clicks cannot outrun
// the three-second countdown. Then test the menu's own pause independently.
await page.locator('#map-button').click();
await page.evaluate(()=>{gnomeward.state.paused=false;});
const menuCountdown=await page.evaluate(()=>gnomeward.state.autoCountdown);
await page.waitForTimeout(350);
if(await page.evaluate(()=>gnomeward.state.autoCountdown)!==menuCountdown)throw Error('Open menus must freeze auto countdown');
await page.evaluate(()=>{gnomeward.state.paused=true;});
await page.keyboard.press('Escape');
await page.locator('#auto-button').click();
if(await page.evaluate(()=>gnomeward.state.autoCountdown)!==null)throw Error('Disabling auto must cancel countdown');
await page.locator('#pause-button').click();
const autoWave=await page.evaluate(()=>{if(gnomeward.game.status!=='planning')throw Error('Auto-round fixture must still be planning');return gnomeward.game.wave;});
await page.waitForTimeout(500);
if(await page.evaluate(()=>gnomeward.game.wave)!==autoWave)throw Error('Disabled auto must not start a round');
await page.locator('#auto-button').click();
// Software WebGL in headless CI can spend several seconds producing a frame.
await page.waitForFunction(w=>gnomeward.game.wave===w+1,autoWave,{timeout:30000}).catch(async error=>{console.error('Auto-round state:',await page.evaluate(()=>({wave:gnomeward.game.wave,status:gnomeward.game.status,paused:gnomeward.state.paused,autoStart:gnomeward.state.autoStart,countdown:gnomeward.state.autoCountdown,dialog:!!document.querySelector('dialog[open]')})));throw error;});
await page.locator('#auto-button').click();
const autoRounds=true;
for(const id of ['orchard','creek','quarry','hollow','crossroads','meadow']){await page.locator('#map-button').click();await page.locator(`[data-map="${id}"]`).click();if(await page.evaluate(()=>gnomeward.game.map.id)!==id)throw Error('map failed '+id)}
await page.locator('#auto-button').click();
await page.waitForTimeout(400);
if(await page.evaluate(()=>gnomeward.state.autoCountdown)!==null||await page.evaluate(()=>gnomeward.game.wave)!==0)throw Error('Auto rounds must wait for first manual start in a new garden');
await page.locator('#auto-button').click();
await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1});await place('sprout',-5,2);await page.screenshot({path:'playtest-results/mobile.png',fullPage:true});const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),popup:document.getElementById('selection-panel').getBoundingClientRect().toJSON()}));
if (mobile.scroll > mobile.width || mobile.popup.top < mobile.canvas.top || mobile.popup.bottom > mobile.canvas.bottom + 1 || mobile.popup.left < mobile.canvas.left || mobile.popup.right > mobile.canvas.right + 1) throw Error('Mobile popup should stay within the battlefield');
const rosterLayout = await page.evaluate(() => {
  const roster = document.getElementById('roster');
  const box = roster.getBoundingClientRect(), canvas = document.querySelector('canvas').getBoundingClientRect();
  return { overMap: box.top >= canvas.top && box.bottom <= canvas.bottom && box.left >= canvas.left && box.right <= canvas.right, scrollable: roster.scrollWidth > roster.clientWidth, noSidebar: !document.querySelector('.sidebar'), fullScreen: canvas.height >= innerHeight * .98 && canvas.width >= innerWidth * .98, noPageScroll: document.documentElement.scrollHeight <= innerHeight + 1 };
});
if (!rosterLayout.overMap || !rosterLayout.scrollable || !rosterLayout.noSidebar || !rosterLayout.fullScreen || !rosterLayout.noPageScroll) throw Error('Roster must float over the full-screen map');
await page.getByRole('button', {name:'Next gnomes'}).click();
await page.waitForFunction(()=>document.getElementById('roster').scrollLeft > 0);
await page.getByRole('button', {name:'Close upgrades'}).click();
if (await page.evaluate(()=>gnomeward.state.selectedTowerId)!==null) throw Error('Upgrade popup must close');
console.log(JSON.stringify({first,combat,autoRounds,projectileCheck,upgradesVisible,immersiveLayout,rosterLayout,mobile,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
