import './style.css';
import { Game } from './game.js';
import { MAPS, TOWERS } from './data.js';
import { UI } from './ui.js';
import { GardenRenderer } from './renderer.js';
import { MusicPlayer, MUSIC_TRACKS } from './music.js';
import { CoopClient, applyCoopSnapshot, coopCountdown } from './multiplayer.js';
import { buyShopItem, getShopOffer, equipTowerSkin, getTowerSkin, SHOP_ITEMS, applyCoopRoundReward } from './economy.js';

let profile={unlocks:[]};
try { const saved=JSON.parse(localStorage.getItem('gnomeward-profile')||'null');if(saved&&Array.isArray(saved.unlocks))profile={...saved,unlocks:saved.unlocks.filter(id=>Object.hasOwn(TOWERS,id))}; }catch{}
let audioPreferences = {};
try { audioPreferences = JSON.parse(localStorage.getItem('gnomeward-audio') || '{}') || {}; } catch {}
const preferredMusic = MUSIC_TRACKS.includes(audioPreferences.music) ? audioPreferences.music : 'off';
const preferredVolume = Number.isFinite(audioPreferences.volume) ? Math.max(0, Math.min(1, audioPreferences.volume)) : .35;
let game=new Game(MAPS[0].id,profile),world,ready=false;
const state={selectedTowerId:null,placingType:null,paused:false,speed:1,sound:audioPreferences.effects === true,autoStart:false,autoCountdown:null,music:preferredMusic,musicVolume:preferredVolume,musicStatus:preferredMusic === 'off' ? 'off' : 'ready'};
function refreshUI() {
  state.shopProfile = soloRun?.game.profile || game.profile;
  ui.update(game, state);
}

const music = new MusicPlayer({
  baseUrl: import.meta.env.BASE_URL, track: state.music, volume: state.musicVolume,
  onStatus: status => { state.musicStatus = status; refreshUI(); }
});
function saveAudioPreferences(){
  try { localStorage.setItem('gnomeward-audio', JSON.stringify({music:state.music,volume:state.musicVolume,effects:state.sound})); } catch {}
}
function chooseMusic(track){
  if(track !== 'off' && !MUSIC_TRACKS.includes(track))return;
  state.music=track;saveAudioPreferences();music.select(track);refreshUI();
}
let audio;
function beep(pitch=440,duration=.08){if(!state.sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(pitch,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(pitch*.6,audio.currentTime+duration);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
function save(){if(state.multiplayer)return;try{localStorage.setItem('gnomeward-profile',JSON.stringify(game.profile));}catch{}}
function cancel(){state.placingType=null;state.selectedTowerId=null;world?.setGhost(null);refreshUI();}
function choose(type){if(!ready)return;if(!game.isUnlocked(type)){ui.toast(TOWERS[type].unlockMap ? `Clear all 20 rounds of ${MAPS.find(map=>map.id===TOWERS[type].unlockMap).name} to recruit this gnome.` : TOWERS[type].unlockSecret ? `A hidden friend awaits in ${MAPS.find(map=>map.id===TOWERS[type].unlockSecret).name}.` : 'This gnome joins your team after its milestone.');return;}state.placingType=state.placingType===type?null:type;state.selectedTowerId=null;refreshUI();beep(600);}
function cycleSpeed(){
  const speed=state.speed===1?2:state.speed===2?3:1;
  if(state.multiplayer){if(state.multiplayer.hostId===state.multiplayer.sessionId)multiplayer.command({action:'speed',speed});return;}
  state.speed=speed;
}
function pause(){
  if(state.multiplayer){multiplayer.command({action:'pause',paused:!state.multiplayer.manualPause});return;}
  state.paused=!state.paused;refreshUI();
}
function ownSelection(){
  const tower=game.towers.find(t=>t.id===state.selectedTowerId);
  if(state.multiplayer && tower?.ownerId!==state.multiplayer.sessionId){ui.toast('Your teammate manages this gnome.');return false;}
  return !!tower;
}
let soloRun=null,lastEventId=0,pendingPlacement=null,lobbyBusy=false,lobbyLoading=false;
const multiplayer=new CoopClient({
  onSnapshot:(snapshot,sessionId)=>{
    const previousMultiplayer=state.multiplayer;
    if(!state.multiplayer){
      save();soloRun={game,paused:state.paused,speed:state.speed,autoStart:state.autoStart};
      game=new Game(snapshot.mapId);lastEventId=0;
      Object.assign(state,{selectedTowerId:null,placingType:null,autoStart:false,autoCountdown:null});
      ui.closeModal();world?.setGhost(null);world?.setMap(game.map,MAPS.findIndex(m=>m.id===snapshot.mapId));
    }
    const previousStatus=game.status;
    const applied=applyCoopSnapshot(game,snapshot,sessionId,lastEventId);
    game=applied.game;lastEventId=applied.eventId;state.multiplayer=applied.multiplayer;
    if (soloRun && state.multiplayer.shopSupported) {
      const earned = applyCoopRoundReward(soloRun.game.profile, state.multiplayer.receiptKey, state.multiplayer.roundCoinsEarned);
      if (earned) {
        try { localStorage.setItem('gnomeward-profile', JSON.stringify(soloRun.game.profile)); } catch {}
        ui.toast(`+${earned} Round Coin${earned === 1 ? '' : 's'} · saved to your shop wallet`);
      }
    }
    state.paused=snapshot.paused;state.speed=snapshot.speed;
    state.autoStart=state.multiplayer.autoStart;state.autoCountdown=coopCountdown(state.multiplayer);
    if(previousMultiplayer?.roomId===snapshot.roomId){
      const teammate=state.multiplayer.players.find(player=>player.id!==sessionId);
      const previousTeammate=previousMultiplayer.players.find(player=>player.id===teammate?.id);
      if(teammate?.ready&&!previousTeammate?.ready&&game.status==='planning'){
        ui.toast(`${teammate.name} is ready!`);beep(660,.12);
      }
      if(state.multiplayer.autoStart!==previousMultiplayer.autoStart)ui.toast(state.multiplayer.autoStart?'Auto rounds on · five seconds to build between rounds.':'Auto rounds off · both players choose when to start.');
    }
    if(snapshot.mapId==='strawberry'&&game.completedWaves>=20&&game.profile.unlocks.includes('strawberry')&&soloRun&&!soloRun.game.profile.unlocks.includes('strawberry')){
      soloRun.game.profile.unlocks.push('strawberry');
      try{localStorage.setItem('gnomeward-profile',JSON.stringify(soloRun.game.profile));}catch{}
    }
    if(game.profile.pathUnlocks?.includes('necro-echoes')&&soloRun&&!soloRun.game.profile.pathUnlocks?.includes('necro-echoes')){
      soloRun.game.profile.pathUnlocks??=[];
      soloRun.game.profile.pathUnlocks.push('necro-echoes');
      try{localStorage.setItem('gnomeward-profile',JSON.stringify(soloRun.game.profile));}catch{}
    }
    if (soloRun && game.profile.enemyTraits?.length) {
      const known = soloRun.game.profile.enemyTraits ||= [];
      const discoveries = game.profile.enemyTraits.filter(id => !known.includes(id));
      if (discoveries.length) {
        known.push(...discoveries);
        try { localStorage.setItem('gnomeward-profile', JSON.stringify(soloRun.game.profile)); } catch {}
      }
    }
    if(previousStatus==='won'&&game.status==='planning'&&ui.modalType==='result')ui.closeModal();
    if(pendingPlacement){
      const tower=game.towers.find(t=>t.ownerId===sessionId&&t.type===pendingPlacement.type&&Math.hypot(t.x-pendingPlacement.x,t.z-pendingPlacement.z)<.05);
      if(tower){state.selectedTowerId=tower.id;pendingPlacement=null;beep(520,.12);}
    }
    refreshUI();
  },
  onConnection:connected=>{if(state.multiplayer){
    const now=performance.now()/1000,held=coopCountdown(state.multiplayer,now);
    state.multiplayer.autoCountdown=held;state.multiplayer.countdownReceivedAt=now;state.autoCountdown=held;
    state.multiplayer.connected=connected;state.multiplayer.reconnecting=!connected;
    if(!connected)state.paused=true;refreshUI();
  }},
  onError:message=>{pendingPlacement=null;ui.toast(message);},
  onLeave:message=>{
    if(soloRun){game=soloRun.game;Object.assign(state,{paused:true,speed:soloRun.speed,autoStart:soloRun.autoStart});soloRun=null;}
    state.multiplayer=null;lastEventId=0;pendingPlacement=null;
    Object.assign(state,{placingType:null,selectedTowerId:null,autoCountdown:null});
    ui.closeModal();ui.resultShown='';world?.setGhost(null);world?.setMap(game.map,MAPS.findIndex(m=>m.id===game.map.id));
    refreshUI();ui.toast(message);
  }
});
async function refreshLobbies(){
  if(lobbyLoading||lobbyBusy||document.hidden||ui.modalType!=='coop-lobby')return;
  lobbyLoading=true;ui.updateCoopLobby({loading:true});
  try{const lobbies=await multiplayer.browse();ui.updateCoopLobby({loading:false,available:true,error:'',lobbies});}
  catch(error){ui.updateCoopLobby({loading:false,available:false,error:error.message==='Failed to fetch'?'Cannot reach the co-op server. Check the Unraid server and Cloudflare connection, then try Refresh.':error.message,lobbies:[]});}
  finally{lobbyLoading=false;}
}
async function connectCoop(options){
  if(!ready||lobbyBusy||state.multiplayer)return;
  lobbyBusy=true;ui.updateCoopLobby({loading:true,error:''});
  try{await multiplayer.connect({...options,loadout:{bossDamage:game.profile.bossDamageUnlocked === true,necroSkin:getTowerSkin(game.profile,'necro'),...(game.profile.tumbleSpeedUnlocked ? {tumbleSpeed:true} : {}),...(getTowerSkin(game.profile,'boom') ? {boomSkin:getTowerSkin(game.profile,'boom')} : {}),...(getTowerSkin(game.profile,'sprout') ? {sproutSkin:getTowerSkin(game.profile,'sprout')} : {})}});}
  catch(error){ui.updateCoopLobby({loading:false,error:error.message});}
  finally{lobbyBusy=false;ui.updateCoopLobby({loading:false});}
}
function openCoop(){if(!ready)return;ui.showCoopLobby();if(!state.multiplayer)refreshLobbies();}
setInterval(()=>{if(!state.multiplayer)refreshLobbies();},4000);

function start(){
  if(!ready)return;
  if(game.status==='won'){ui.showResult(game);return;}
  if(state.multiplayer){
    if(game.status==='planning'&&(!state.multiplayer.ready||state.multiplayer.autoSupported))multiplayer.command({action:'ready',ready:!state.multiplayer.ready});
    else if(game.status==='wave'){if(state.multiplayer.manualPause)pause();else cycleSpeed();}
    return;
  }
  if(game.status==='planning'){
    if(game.startWave()!==false){state.paused=false;state.autoCountdown=null;beep(700,.16);}
  }else if(game.status==='wave'){
    if(state.paused)state.paused=false;else cycleSpeed();
  }
  refreshUI();
}
function targetNext(){
  const tower=game.towers.find(t=>t.id===state.selectedTowerId);
  if(!tower||!ownSelection())return;
  const modes=['first','last','strong','close'];
  const mode=modes[(modes.indexOf(tower.targeting)+1)%modes.length];
  if(state.multiplayer){multiplayer.command({action:'target',towerId:tower.id,mode});return;}
  game.setTargeting(tower.id,mode);
  refreshUI();
}
function newGarden(mapId){if(!ready||state.multiplayer)return;save();profile=game.profile;game=new Game(mapId,profile);Object.assign(state,{selectedTowerId:null,placingType:null,paused:false,autoCountdown:null});world?.setMap(game.map,MAPS.findIndex(m=>m.id===mapId));refreshUI();}
function shopBuy(id, quotedPrice) {
  if (state.multiplayer) return;
  const now = Date.now(), offer = getShopOffer(id, now);
  if (!offer) return;
  if (quotedPrice !== offer.cost) {
    refreshUI(); ui.showCoinShop();
    ui.toast('The shop offer has changed. Check the current price before buying.');
    return;
  }
  if (!buyShopItem(game.profile, id, now)) { refreshUI(); ui.showCoinShop(); return; }
  if (id === 'tumble-speed') for (const tower of game.towers) if (tower.type === 'multi') tower.cooldown /= 3;
  save(); refreshUI(); ui.showCoinShop(); beep(880,.16);
  ui.toast(id === 'boss-damage' ? 'Boss Breaker unlocked forever · 2× damage against bosses!' : id === 'tumble-speed' ? 'Turbo Tumble unlocked forever · 3× attack speed!' : `${SHOP_ITEMS.find(item => item.id === id)?.name || 'Costume'} unlocked! Equip it in the shop.`);
}
function shopEquip(type, skin) {
  if (state.multiplayer || !equipTowerSkin(game.profile, type, skin === 'default' ? null : skin)) return;
  for (const tower of game.towers) if (tower.type === type) tower.skin = getTowerSkin(game.profile, type);
  world?.setGhost(null);
  save(); refreshUI(); ui.showCoinShop();
}
const ui=new UI({
  onChooseTower:choose,onStartWave:start,
  onShopBuy:shopBuy,onShopEquip:shopEquip,
  onCoopOpen:openCoop,onCoopRefresh:refreshLobbies,onCoopCreate:connectCoop,onCoopJoin:connectCoop,onCoopLeave:()=>multiplayer.leave(),
  onContinueEndless:()=>{if(state.multiplayer){multiplayer.command({action:'endless'});return;}if(game.continueEndless()){Object.assign(state,{paused:false,autoCountdown:null,placingType:null,selectedTowerId:null});world?.setGhost(null);save();refreshUI();}},
  onPause:pause,
  onSpeed:()=>{cycleSpeed();refreshUI()},
  onAuto:()=>{if(state.multiplayer){if(state.multiplayer.autoSupported)multiplayer.command({action:'auto',enabled:!state.multiplayer.autoStart});return;}state.autoStart=!state.autoStart;state.autoCountdown=null;refreshUI()},
  onTargeting:targetNext,
  onMusic:chooseMusic,
  onMusicVolume:value=>{music.setVolume(value);state.musicVolume=music.volume;saveAudioPreferences();refreshUI()},
  onMap:id=>newGarden(id),onUpgrade:pathIndex=>{if(!ownSelection())return;if(state.multiplayer){multiplayer.command({action:'upgrade',towerId:state.selectedTowerId,path:pathIndex});return;}if(game.upgradeTower(state.selectedTowerId,pathIndex)){beep(880,.16);}else ui.toast('Earn more points, or choose one of your two available paths.');refreshUI()},
  onSell:()=>{if(!ownSelection())return;if(state.multiplayer){multiplayer.command({action:'sell',towerId:state.selectedTowerId});cancel();return;}game.sellTower(state.selectedTowerId);cancel();beep(400)},onCancel:cancel,
  onSound:()=>{state.sound=!state.sound;saveAudioPreferences();beep(600);refreshUI()},onRestart:()=>newGarden(game.map.id)
});
refreshUI();ui.setLoading?.('Growing your garden…');
try {
  world=new GardenRenderer(document.getElementById('scene'),{
    onHover:(x,z)=>{if(!ready||!state.placingType)return;const type=state.placingType;world.setGhost(type,x,z,game.canPlace(type,x,z),game.getStats({type,levels:TOWERS[type].paths.map(()=>0)}).range,state.multiplayer ? state.multiplayer.loadout?.[type+'Skin'] : getTowerSkin(game.profile,type));},
    onClick:(x,z,hitTowerId,secretId,clueId)=>{
      if(!ready||['won','lost'].includes(game.status)||state.multiplayer?.result||state.multiplayer?.reconnecting)return;
      if(clueId&&!state.placingType){
        ui.showCottageClue();
        return;
      }
      if(secretId&&!state.placingType){
        if(state.multiplayer){multiplayer.command({action:'discover',id:secretId});return;}
        if(game.discoverSecret(secretId)){save();state.selectedTowerId=null;beep(1100,.2);refreshUI();}
        return;
      }
      if(state.placingType&&state.multiplayer){
        const type=state.placingType;
        if(!game.canPlace(type,x,z)){ui.toast(game.gold<TOWERS[type].cost?'You need more gold for this gnome.':'Choose clear grass beside the path.');return;}
        if(multiplayer.command({action:'place',type,x,z})){pendingPlacement={type,x,z};state.placingType=null;world?.setGhost(null);}
        refreshUI();return;
      }
      if(state.placingType){const t=game.placeTower(state.placingType,x,z);if(t){state.placingType=null;state.selectedTowerId=t.id;beep(520,.12);}else ui.toast(game.gold<TOWERS[state.placingType].cost?'You need more gold for this gnome.':'Place your gnome on the grass, away from the path, hidden relics, and other gnomes.');}
      else {const nearest=game.towers.find(t=>t.id===hitTowerId)||game.towers.find(t=>Math.hypot(t.x-x,t.z-z)<.85);state.selectedTowerId=nearest?.id??null;}
      refreshUI();
    },onCancel:cancel
  });
  await world.load(progress=>ui.setLoading?.('Growing your garden… '+Math.round(progress*100)+'%'));
  world.setMap(game.map,0);ready=true;ui.setLoading?.(null);
  multiplayer.resume().catch(()=>ui.toast('Your previous co-op room is no longer available. You can create or join another.'));
}catch(error){console.error(error);ui.setLoading?.('The garden could not load. Please reload in a browser with WebGL 2 enabled.');}
window.addEventListener('keydown',e=>{if(!document.getElementById('splash-screen')?.hidden)return;if(e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.code==='Escape')cancel();else if(e.code==='Space'){if(e.target.closest('button,a'))return;e.preventDefault();start();}else if(e.code==='KeyP'){pause();}else if(/^Digit[1-9]$/.test(e.code))choose(Object.keys(TOWERS)[Number(e.code.slice(-1))-1]);});
let last=performance.now(),uiElapsed=0;
// Returning to the tab must not count time spent away toward an automatic round.
document.addEventListener('visibilitychange',()=>{last=performance.now();music.setHidden(document.hidden);});
music.setHidden(document.hidden);
// Saved music resumes only after a real interaction; first visits remain quiet.
document.addEventListener('pointerdown',()=>music.unlock(),{capture:true});
document.addEventListener('keydown',()=>music.unlock(),{capture:true});
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=(now-last)/1000,dt=Math.min(elapsed,.08);last=now;
  if(!ready)return;
  const active=!state.paused&&!document.hidden&&!document.querySelector('dialog[open]');
  if(state.multiplayer){
    state.autoCountdown=coopCountdown(state.multiplayer,now/1000);
  }else if(!state.autoStart||game.status!=='planning'||game.wave===0||(!game.endless&&game.wave>=game.maxWaves)){
    state.autoCountdown=null;
  }else{
    state.autoCountdown??=3;
    if(active){state.autoCountdown=Math.max(0,state.autoCountdown-elapsed);if(state.autoCountdown===0)start();}
  }
  if(active&&!state.multiplayer){
    let remaining=dt*state.speed;
    while(remaining>0){const step=Math.min(remaining,1/30);game.update(step);remaining-=step;}
  }
  const events=game.events.splice(0);
  const announcement=events.findLast(event=>['unlock','path-unlock','combo','trait-discovered'].includes(event.type))||events.findLast(event=>['wave-start','wave-complete'].includes(event.type));
  if (announcement) {
    const title = announcement.type === 'combo' ? `${announcement.combo.toUpperCase().replaceAll('-', ' ')}!`
      : announcement.type === 'trait-discovered' ? `${announcement.trait.toUpperCase()} SKELETONS!` : announcement.message;
    const kind = announcement.type === 'combo' ? announcement.combo : ['path-unlock', 'trait-discovered'].includes(announcement.type) ? 'unlock' : announcement.type;
    ui.announce?.(title, kind);
  }
  for(const event of events){
    if(event.message&&!['leak','placed','wave-start','wave-complete','unlock','path-unlock','combo'].includes(event.type))ui.toast(event.message);
    if(event.type==='summoned'&&(!state.multiplayer||game.towers.find(t=>t.id===event.towerId)?.ownerId===state.multiplayer.sessionId)){state.selectedTowerId=event.towerId;state.placingType=null;refreshUI();}
    if(['secret-found','summoned','trait-discovered'].includes(event.type))save();
    if(['unlock','path-unlock','wave-complete','victory'].includes(event.type)){save();beep(920,.2);}
    else if(event.type==='defeat'){save();beep(140,.4);}
    else if(event.type==='combo'){beep(880,.18);beep(1320,.12);}
  }
  world.render(game,state,now/1000);
  uiElapsed+=dt;if(uiElapsed>.15){refreshUI();uiElapsed=0;}
}
requestAnimationFrame(frame);
// Intentionally available for family playtesting and reproducible bug reports.
window.gnomeward={get ready(){return ready},get game(){return game},get state(){return state},get renderer(){return world},get music(){return music},get multiplayer(){return multiplayer},version:'0.3.6'};
