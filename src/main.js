import './style.css';
import { Game } from './game.js';
import { MAPS, TOWERS } from './data.js';
import { UI } from './ui.js';
import { GardenRenderer } from './renderer.js';

let profile={unlocks:[]};
try { const saved=JSON.parse(localStorage.getItem('gnomeward-profile')||'null');if(saved&&Array.isArray(saved.unlocks))profile={...saved,unlocks:saved.unlocks.filter(id=>Object.hasOwn(TOWERS,id))}; }catch{}
let game=new Game(MAPS[0].id,profile),world,ready=false;
const state={selectedTowerId:null,placingType:null,paused:false,speed:1,sound:false,autoStart:false,autoCountdown:null};
function refreshUI() {
  const tower = game.towers.find(t => t.id === state.selectedTowerId);
  if (world && tower) {
    const p = world.camera.position.clone().set(tower.x, .8, tower.z).project(world.camera);
    state.selectionAnchor = { x: (p.x + 1) * world.container.clientWidth / 2, y: (1 - p.y) * world.container.clientHeight / 2 };
  } else state.selectionAnchor = null;
  ui.update(game, state);
}
let audio;
function beep(pitch=440,duration=.08){if(!state.sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(pitch,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(pitch*.6,audio.currentTime+duration);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
function save(){try{localStorage.setItem('gnomeward-profile',JSON.stringify(game.profile));}catch{}}
function cancel(){state.placingType=null;state.selectedTowerId=null;world?.setGhost(null);refreshUI();}
function choose(type){if(!ready)return;if(!game.isUnlocked(type)){ui.toast('This gnome joins your team after its milestone.');return;}state.placingType=state.placingType===type?null:type;state.selectedTowerId=null;refreshUI();beep(600);}
function cycleSpeed(){state.speed=state.speed===1?2:state.speed===2?3:1;}
function start(){
  if(!ready)return;
  if(game.status==='planning'){
    if(game.startWave()!==false){state.paused=false;state.autoCountdown=null;beep(700,.16);}
  }else if(game.status==='wave'){
    if(state.paused)state.paused=false;else cycleSpeed();
  }
  refreshUI();
}
function targetNext(){
  const tower=game.towers.find(t=>t.id===state.selectedTowerId);
  if(!tower)return;
  const modes=['first','last','strong','close'];
  game.setTargeting(tower.id,modes[(modes.indexOf(tower.targeting)+1)%modes.length]);
  refreshUI();
}
function newGarden(mapId){if(!ready)return;save();profile=game.profile;game=new Game(mapId,profile);Object.assign(state,{selectedTowerId:null,placingType:null,paused:false,autoCountdown:null});world?.setMap(game.map,MAPS.findIndex(m=>m.id===mapId));refreshUI();}
const ui=new UI({
  onChooseTower:choose,onStartWave:start,
  onPause:()=>{state.paused=!state.paused;refreshUI()},
  onSpeed:()=>{cycleSpeed();refreshUI()},
  onAuto:()=>{state.autoStart=!state.autoStart;state.autoCountdown=null;refreshUI()},
  onTargeting:targetNext,
  onMap:id=>newGarden(id),onUpgrade:pathIndex=>{if(game.upgradeTower(state.selectedTowerId,pathIndex)){beep(880,.16);}else ui.toast('Earn more points, or choose one of your two available paths.');refreshUI()},
  onSell:()=>{game.sellTower(state.selectedTowerId);cancel();beep(400)},onCancel:cancel,
  onSound:()=>{state.sound=!state.sound;beep(600);refreshUI()},onRestart:()=>newGarden(game.map.id)
});
refreshUI();ui.setLoading?.('Growing your garden…');
try {
  world=new GardenRenderer(document.getElementById('scene'),{
    onHover:(x,z)=>{if(!ready||!state.placingType)return;const type=state.placingType;world.setGhost(type,x,z,game.canPlace(type,x,z),game.getStats({type,levels:TOWERS[type].paths.map(()=>0)}).range);},
    onClick:(x,z,hitTowerId)=>{
      if(!ready||['won','lost'].includes(game.status))return;
      if(state.placingType){const t=game.placeTower(state.placingType,x,z);if(t){state.placingType=null;state.selectedTowerId=t.id;beep(520,.12);}else ui.toast(game.gold<TOWERS[state.placingType].cost?'You need more gold for this gnome.':'Place your gnome on the grass, away from the path and other gnomes.');}
      else {const nearest=game.towers.find(t=>t.id===hitTowerId)||game.towers.find(t=>Math.hypot(t.x-x,t.z-z)<.85);state.selectedTowerId=nearest?.id??null;}
      refreshUI();
    },onCancel:cancel
  });
  await world.load(progress=>ui.setLoading?.('Growing your garden… '+Math.round(progress*100)+'%'));
  world.setMap(game.map,0);ready=true;ui.setLoading?.(null);
}catch(error){console.error(error);ui.setLoading?.('The garden could not load. Please reload in a browser with WebGL 2 enabled.');}
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.code==='Escape')cancel();else if(e.code==='Space'){e.preventDefault();start();}else if(e.code==='KeyP'){state.paused=!state.paused;refreshUI();}else if(/^Digit[1-6]$/.test(e.code))choose(Object.keys(TOWERS)[Number(e.code.slice(-1))-1]);});
let last=performance.now(),uiElapsed=0;
// Returning to the tab must not count time spent away toward an automatic round.
document.addEventListener('visibilitychange',()=>{last=performance.now();});
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=(now-last)/1000,dt=Math.min(elapsed,.08);last=now;
  if(!ready)return;
  const active=!state.paused&&!document.hidden&&!document.querySelector('dialog[open]');
  if(!state.autoStart||game.status!=='planning'||game.wave===0||game.wave>=20){
    state.autoCountdown=null;
  }else{
    state.autoCountdown??=3;
    if(active){state.autoCountdown=Math.max(0,state.autoCountdown-elapsed);if(state.autoCountdown===0)start();}
  }
  if(active){
    let remaining=dt*state.speed;
    while(remaining>0){const step=Math.min(remaining,1/30);game.update(step);remaining-=step;}
  }
  const events=game.events.splice(0);
  const announcement=events.findLast(event=>event.type==='unlock')||events.findLast(event=>['wave-start','wave-complete'].includes(event.type));
  if(announcement)ui.announce?.(announcement.message,announcement.type);
  for(const event of events){
    if(event.message&&!['leak','placed','wave-start','wave-complete','unlock'].includes(event.type))ui.toast(event.message);
    if(['unlock','wave-complete','victory'].includes(event.type)){save();beep(920,.2);}
    else if(event.type==='defeat')beep(140,.4);
  }
  world.render(game,state,now/1000);
  uiElapsed+=dt;if(uiElapsed>.15){refreshUI();uiElapsed=0;}
}
requestAnimationFrame(frame);
// Intentionally available for family playtesting and reproducible bug reports.
window.gnomeward={get game(){return game},get state(){return state},get renderer(){return world},version:'0.1.3'};
