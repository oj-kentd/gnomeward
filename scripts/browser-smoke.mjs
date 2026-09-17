import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url)});
await page.goto(process.env.PLAYTEST_URL || 'http://localhost:5173');await page.waitForFunction(()=>window.gnomeward&&document.getElementById('loading-card').hidden);await page.waitForFunction(()=>gnomeward.renderer.renderer.info.render.frame>4);await page.screenshot({path:'playtest-results/initial.png'});
async function place(type,x,z){await page.locator(`[data-tower="${type}"]`).click();const p=await page.evaluate(({x,z})=>{const w=gnomeward.renderer,p=w.camera.position.clone().set(x,0,z).project(w.camera),r=w.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}},{x,z});await page.mouse.click(p.x,p.y);}
await place('sprout',-5,2);await place('spore',-5,-2);await place('boom',-3,1);await place('sprout',1,1);
await page.locator('#start-button').click();await page.waitForTimeout(1800);await page.screenshot({path:'playtest-results/playing.png'});
const first=await page.evaluate(()=>({towers:gnomeward.game.towers.length,gold:gnomeward.game.gold,status:gnomeward.game.status,enemies:gnomeward.game.enemies.length}));
await page.locator('#pause-button').click();const t=await page.evaluate(()=>gnomeward.game.time);await page.waitForTimeout(300);if(await page.evaluate(()=>gnomeward.game.time)!==t)throw Error('pause failed');
await page.evaluate(()=>{const g=gnomeward.game;for(let w=0;w<3;w++){if(g.status==='planning')g.startWave();for(let i=0;i<6000&&g.status==='wave';i++)g.update(.05)}});await page.waitForTimeout(250);
// Select a placed Sprout through the actual battlefield and buy two paths.
const point=await page.evaluate(()=>{const w=gnomeward.renderer,p=w.camera.position.clone().set(-5,0,2).project(w.camera),r=w.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2}});await page.mouse.click(point.x,point.y);await page.locator('[data-upgrade="0"]').click();await page.locator('[data-upgrade="1"]').click();if(!await page.locator('[data-upgrade="2"]').isDisabled())throw Error('third path not locked');
await page.screenshot({path:'playtest-results/upgrades.png'});
const combat=await page.evaluate(()=>({wave:gnomeward.game.wave,lives:gnomeward.game.lives,points:gnomeward.game.points,kills:gnomeward.game.kills,levels:gnomeward.game.towers[0].levels}));
for(const id of ['orchard','creek','quarry','hollow','meadow']){await page.locator('#map-button').click();await page.locator(`[data-map="${id}"]`).click();if(await page.evaluate(()=>gnomeward.game.map.id)!==id)throw Error('map failed '+id)}
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'playtest-results/mobile.png',fullPage:true});const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()}));
console.log(JSON.stringify({first,combat,mobile,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
