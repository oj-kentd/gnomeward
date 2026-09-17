import './style.css';
import { Game } from './game.js';
import { MAPS, TOWERS } from './data.js';
import { UI } from './ui.js';
import { GardenRenderer } from './renderer.js';

let profile={unlocks:[]};
try { const saved=JSON.parse(localStorage.getItem('gnomeward-profile')||'null');if(saved&&Array.isArray(saved.unlocks))profile={...saved,unlocks:saved.unlocks.filter(id=>Object.hasOwn(TOWERS,id))}; }catch{}
let game=new Game(MAPS[0].id,profile),world,ready=false;
const state={selectedTowerId:null,placingType:null,paused:false,speed:1,sound:false};
let audio;
function beep(pitch=440,duration=.08){if(!state.sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(pitch,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(pitch*.6,audio.currentTime+duration);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
function save(){try{localStorage.setItem('gnomeward-profile',JSON.stringify(game.profile));}catch{}}
function cancel(){state.placingType=null;state.selectedTowerId=null;world?.setGhost(null);ui.update(game,state);}
function choose(type){if(!ready)return;if(!game.isUnlocked(type)){ui.toast('This gnome joins your team after its milestone.');return;}state.placingType=state.placingType===type?null:type;state.selectedTowerId=null;ui.update(game,state);beep(600);}
function start(){if(!ready)return;if(game.status==='planning'){const started=game.startWave();if(started!==false){state.paused=false;beep(700,.16);}}ui.update(game,state);}
function newGarden(mapId){if(!ready)return;save();profile=game.profile;game=new Game(mapId,profile);Object.assign(state,{selectedTowerId:null,placingType:null,paused:false});world?.setMap(game.map,MAPS.findIndex(m=>m.id===mapId));ui.update(game,state);}
const ui=new UI({
  onChooseTower:choose,onStartWave:start,
  onPause:()=>{state.paused=!state.paused;ui.update(game,state)},
  onSpeed:()=>{state.speed=state.speed===1?2:state.speed===2?3:1;ui.update(game,state)},
  onMap:id=>newGarden(id),onUpgrade:pathIndex=>{if(game.upgradeTower(state.selectedTowerId,pathIndex)){beep(880,.16);}else ui.toast('Earn more points, or choose one of your two available paths.');ui.update(game,state)},
  onSell:()=>{game.sellTower(state.selectedTowerId);cancel();beep(400)},onCancel:cancel,
  onSound:()=>{state.sound=!state.sound;beep(600);ui.update(game,state)},onRestart:()=>newGarden(game.map.id)
});
ui.update(game,state);ui.setLoading?.('Growing your garden…');
try {
  world=new GardenRenderer(document.getElementById('scene'),{
    onHover:(x,z)=>{if(!ready||!state.placingType)return;const type=state.placingType;world.setGhost(type,x,z,game.canPlace(type,x,z),game.getStats({type,levels:TOWERS[type].paths.map(()=>0)}).range);},
    onClick:(x,z)=>{
      if(!ready||['won','lost'].includes(game.status))return;
      if(state.placingType){const t=game.placeTower(state.placingType,x,z);if(t){state.placingType=null;state.selectedTowerId=t.id;beep(520,.12);}else ui.toast(game.gold<TOWERS[state.placingType].cost?'You need more gold for this gnome.':'Place your gnome on the grass, away from the path and other gnomes.');}
      else {const nearest=game.towers.find(t=>Math.hypot(t.x-x,t.z-z)<.85);state.selectedTowerId=nearest?.id??null;}
      ui.update(game,state);
    },onCancel:cancel
  });
  await world.load(progress=>ui.setLoading?.('Growing your garden… '+Math.round(progress*100)+'%'));
  world.setMap(game.map,0);ready=true;ui.setLoading?.(null);
}catch(error){console.error(error);ui.setLoading?.('The garden could not load. Please reload in a browser with WebGL 2 enabled.');}
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.code==='Escape')cancel();else if(e.code==='Space'){e.preventDefault();start();}else if(e.code==='KeyP'){state.paused=!state.paused;ui.update(game,state);}else if(/^Digit[1-6]$/.test(e.code))choose(Object.keys(TOWERS)[Number(e.code.slice(-1))-1]);});
let last=performance.now(),uiElapsed=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.08);last=now;if(!ready)return;if(!state.paused&&!document.hidden&&!document.querySelector('dialog[open]')){let remaining=dt*state.speed;while(remaining>0){const step=Math.min(remaining,1/30);game.update(step);remaining-=step;}}
  for(const event of game.events.splice(0)){if(event.message)ui.toast(event.message);if(event.type==='unlock'||event.type==='wave-complete'||event.type==='victory'){save();beep(920,.2);}else if(event.type==='defeat')beep(140,.4);}
  world.render(game,state,now/1000);uiElapsed+=dt;if(uiElapsed>.15){ui.update(game,state);uiElapsed=0;}
}
requestAnimationFrame(frame);
// Intentionally available for family playtesting and reproducible bug reports.
window.gnomeward={get game(){return game},get state(){return state},get renderer(){return world},version:'0.1.0'};
