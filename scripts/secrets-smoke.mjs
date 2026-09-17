import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('playtest-results',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function point(x,y,z){return page.evaluate(({x,y,z})=>{const w=gnomeward.renderer,p=w.camera.position.clone().set(x,y,z).project(w.camera),r=w.renderer.domElement.getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};},{x,y,z});}
async function clickSpot(x,y,z){const p=await point(x,y,z);await page.mouse.click(p.x,p.y);}
async function map(id){await page.locator('#map-button').click();await page.locator(`[data-map="${id}"]`).click();}
try{
 await page.goto(process.env.PLAYTEST_URL||'http://localhost:5173');await page.waitForFunction(()=>window.gnomeward&&document.getElementById('loading-card').hidden&&gnomeward.renderer.renderer.info.render.frame>3);
 if(!await page.evaluate(()=>['gnome-gravity','gnome-crystal','black-hole','crystal-barrier','secret-rune','secret-crystal'].every(name=>gnomeward.renderer.models[name])))throw Error('Missing secret Blender assets');
 if(!await page.locator('[data-tower="gravity"]').isDisabled()||!await page.locator('[data-tower="crystal"]').isDisabled())throw Error('Secrets must begin locked');
 if((await page.locator('#roster').textContent()).includes('undefined'))throw Error('Unknown secret milestone label');
 for(const [x,z]of[[-4,-1],[2,-1],[8,1]]){await clickSpot(x,.19,z);await page.waitForTimeout(120);}
 await page.waitForFunction(()=>gnomeward.game.isUnlocked('gravity'));
 await clickSpot(8,.19,1);
 if(await page.evaluate(()=>gnomeward.game.secretDiscoveries.length)!==3)throw Error('Repeated discovery counted twice');
 await page.locator('[data-tower="gravity"]').click();await clickSpot(-10,0,1.5);
 await page.waitForFunction(()=>gnomeward.game.towers.some(t=>t.type==='gravity'));
 if(await page.locator('[data-targeting]').count())throw Error('Gravity should use automatic terrain targeting');
 await page.evaluate(()=>{gnomeward.game.points=1000;});
 await page.waitForFunction(()=>!document.querySelector('[data-upgrade="0"]').disabled);
 await page.locator('[data-upgrade="0"]').click();await page.locator('[data-upgrade="0"]').click();
 if(!(await page.locator('.upgrade-path').first().textContent()).includes('Captures enemies'))throw Error('Capture tier preview missing');
 await page.locator('[data-upgrade="0"]').click();
 await page.locator('[data-close-upgrades]').click();await page.locator('#pause-button').click();
 const gravity=await page.evaluate(()=>{const g=gnomeward.game;g.startWave();g._queue=[];const e=g._spawn('gold');e.progress=4;Object.assign(e,g.pointAt(4));for(let i=0;i<20;i++)g.update(.05);return{progress:e.progress,hp:e.hp,captured:e.capturedBy,holes:g.holes.length,stats:g.getStats(g.towers[0])};});
 if(gravity.progress>=4||!gravity.captured||gravity.hp>=205||gravity.holes!==1||gravity.stats.interval<gravity.stats.holeDuration+5)throw Error('Gravity capture/DOT/recovery failed');
 await page.waitForFunction(()=>gnomeward.renderer.holes.size===1);
 await page.screenshot({path:'playtest-results/gravity-hole.png'});
 await map('quarry');
 for(const [x,z]of[[-2,-1],[4,-5],[5,0]]){await clickSpot(x,.65,z);await page.waitForTimeout(120);}
 await page.waitForFunction(()=>gnomeward.game.isUnlocked('crystal')&&gnomeward.game.towers.some(t=>t.summoned));
 const summon=await page.evaluate(()=>({gold:gnomeward.game.gold,tower:gnomeward.game.towers.find(t=>t.summoned),profile:JSON.parse(localStorage.getItem('gnomeward-profile'))}));
 if(summon.gold!==650||summon.tower.purchaseCost!==0||!summon.profile.unlocks.includes('gravity')||!summon.profile.unlocks.includes('crystal'))throw Error('Free summon/persisted unlock failed '+JSON.stringify(summon));
 await page.waitForFunction(()=>document.getElementById('selection-panel').textContent.includes('Summoned guardian'));
 if(!(await page.locator('[data-sell]').textContent()).includes('0'))throw Error('Free Prism must sell for zero');
 await page.screenshot({path:'playtest-results/crystal-summon.png'});
 await page.locator('[data-sell]').click();
 if(await page.evaluate(()=>gnomeward.game.gold)!==650)throw Error('Summon sale farmed gold');
 await page.locator('[data-tower="crystal"]').click();await clickSpot(-10,0,-1.5);
 await page.evaluate(()=>{gnomeward.game.points=1000;});await page.waitForFunction(()=>!document.querySelector('[data-upgrade="1"]').disabled);
 await page.locator('[data-upgrade="1"]').click();await page.locator('[data-close-upgrades]').click();await page.locator('#pause-button').click();
 const barrier=await page.evaluate(()=>{const g=gnomeward.game;g.startWave();g._queue=[];const e=g._spawn('gold');e.progress=2;Object.assign(e,g.pointAt(2));g.update(.05);for(let i=0;i<18;i++)g.update(.05);return{count:g.barriers.length,hp:g.barriers[0]?.hp,maxHp:g.barriers[0]?.maxHp,enemy:e.progress,wall:g.barriers[0]?.progress};});
 if(barrier.count!==1||barrier.hp>=barrier.maxHp||barrier.enemy>barrier.wall)throw Error('Crystal did not block and take enemy damage');
 await page.waitForFunction(()=>gnomeward.renderer.barriers.size===1);
 await page.screenshot({path:'playtest-results/crystal-barrier.png'});
 const blast=await page.evaluate(()=>{const g=gnomeward.game;g.barriers[0].hp=.1;const e=g.enemies[0],before=e.hp;g.update(.05);return{damage:before-e.hp,barriers:g.barriers.length,effects:g.effects.filter(e=>e.type==='explosion').length};});
 if(blast.damage!==28||blast.barriers!==0||blast.effects!==1)throw Error('Enemy destruction should trigger one credited crystal blast');
 await page.reload();await page.waitForFunction(()=>window.gnomeward&&document.getElementById('loading-card').hidden&&gnomeward.renderer.renderer.info.render.frame>3);
 if(!await page.evaluate(()=>gnomeward.game.isUnlocked('gravity')&&gnomeward.game.isUnlocked('crystal')))throw Error('Secret unlocks lost after reload');
 await map('quarry');for(const[x,z]of[[-2,-1],[4,-5],[5,0]])await clickSpot(x,.65,z);
 if(await page.evaluate(()=>gnomeward.game.towers.length)!==0)throw Error('Repeat quest summoned a second free Prism');
 // Fresh phone profile, real crystal mesh clicks, and one-time summon.
 await page.evaluate(()=>localStorage.removeItem('gnomeward-profile'));await page.reload();await page.waitForFunction(()=>window.gnomeward&&document.getElementById('loading-card').hidden&&gnomeward.renderer.renderer.info.render.frame>3);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>Math.abs(document.querySelector('canvas').getBoundingClientRect().width-390)<1);await map('quarry');
 for(const[x,z]of[[-2,-1],[4,-5],[5,0]]){await clickSpot(x,.65,z);await page.waitForTimeout(120);}
 await page.waitForFunction(()=>gnomeward.game.towers.some(t=>t.summoned));
 await page.screenshot({path:'playtest-results/secrets-mobile.png'});
 console.log(JSON.stringify({gravity,summon,barrier,blast,mobileSummon:true,errors},null,2));if(errors.length)process.exitCode=1;
}catch(error){console.error('Browser errors:',errors);await page.screenshot({path:'playtest-results/secrets-failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
