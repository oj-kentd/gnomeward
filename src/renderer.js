import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOWERS, ENEMIES } from './data.js';

const ASSETS = ['pumpkin','apple-tree','water','ground','path','tree','bush','rock','flower','mushroom','house','fence','crystal','projectile','ring','explosion','skeleton','skeleton-boss',...Object.keys(TOWERS).map(t=>'gnome-'+t)];
const palettes = [
  {grass:0x87aa59, edge:0x6c6946, road:0xd7bc8c, bg:0x183c35},
  {grass:0xa4ad64, edge:0x716147, road:0xe2c18c, bg:0x293d32},
  {grass:0x73899a, edge:0x5b647d, road:0xc1b5ba, bg:0x253b47},
  {grass:0x8c9891, edge:0x657c7e, road:0xdbd7c2, bg:0x294753},
  {grass:0x92915c, edge:0x625246, road:0xc9b6a7, bg:0x303b35},
];
export class GardenRenderer {
  constructor(container, handlers) {
    this.container=container; this.handlers=handlers; this.models={}; this.entities=new Map(); this.traps=new Map(); this.fx=new Map(); this.tintMaterials=new Map();
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0x183c35);
    this.camera=new THREE.OrthographicCamera(-16,16,12,-12,.1,150); this.camera.position.set(0,26,21); this.camera.lookAt(0,0,0);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7)); this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace; this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.0;
    container.appendChild(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label','Garden battlefield. Select a gnome, then click beside the path to place it.');
    this.scene.add(new THREE.HemisphereLight(0xfff6dc,0x506055,1.4));
    const sun=new THREE.DirectionalLight(0xfff1d6,1.8); sun.position.set(-10,22,12); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18; sun.shadow.normalBias=.04; this.scene.add(sun);
    this.world=new THREE.Group(); this.scene.add(this.world); this.actors=new THREE.Group();this.scene.add(this.actors);
    this.raycaster=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.pointer=new THREE.Vector2();this.point=new THREE.Vector3();
    this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(container);
    this.renderer.domElement.addEventListener('pointermove',e=>{const p=this.pick(e);if(p)this.handlers.onHover(p.x,p.z)});
    this.renderer.domElement.addEventListener('pointerleave',()=>{if(this.ghost)this.ghost.visible=false;});
    this.renderer.domElement.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const point = this.pick(e);
      if (!point) return;
      const towers = [...this.entities].filter(([key]) => key.startsWith('t')).map(([, object]) => object);
      let hit = this.raycaster.intersectObjects(towers, true)[0]?.object;
      while (hit && hit.userData.towerId === undefined) hit = hit.parent;
      this.handlers.onClick(point.x, point.z, hit?.userData.towerId);
    });
    this.renderer.domElement.addEventListener('contextmenu',e=>{e.preventDefault();this.handlers.onCancel()});
    this.resize();
  }
  async load(onProgress) {
    const loader=new GLTFLoader(); let done=0;
    await Promise.all(ASSETS.map(async name=>{const gltf=await loader.loadAsync(import.meta.env.BASE_URL+'assets/'+name+'.glb'); this.models[name]=gltf.scene;gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});onProgress?.(++done/ASSETS.length);}));
    this.range=this.clone('ring',0xd5f395); this.range.visible=false;this.scene.add(this.range);
  }
  clone(name,color) {
    const obj=this.models[name].clone(true);
    if(color!==undefined)obj.traverse(o=>{if(!o.isMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];const tinted=mats.map(m=>{const key=m.uuid+color;if(!this.tintMaterials.has(key)){const c=m.clone();c.color.set(color);this.tintMaterials.set(key,c)}return this.tintMaterials.get(key)});o.material=Array.isArray(o.material)?tinted:tinted[0]});
    return obj;
  }
  add(name,x,y,z,sx=1,sy=sx,sz=sx,color,rotation=0) {const obj=this.clone(name,color);obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);obj.rotation.y=rotation;this.world.add(obj);return obj;}
  setMap(map,index) {
    this.world.clear();this.actors.clear();this.entities.clear();this.traps.clear();this.fx.clear();if(this.ghost){this.scene.remove(this.ghost);this.ghost=null;this.ghostType=null;}
    const p=palettes[index%5];this.scene.background.set(p.bg);this.range.visible=false;
    this.add('ground',0,-.48,0,25.7,.8,17.7,p.edge);
    this.add('ground',0,-.08,0,25.4,.22,17.4,p.grass);
    // Both the route and its cobbles are instances of the Blender-authored path mesh.
    for(let i=1;i<map.path.length;i++){
      const [ax,az]=map.path[i-1],[bx,bz]=map.path[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx);
      this.add('path',(ax+bx)/2,.055,(az+bz)/2,len+.65,.07,1.58,0xbca67e,rot);
      const n=Math.ceil(len/.72);
      for(let j=0;j<n;j++){const t=(j+.5)/n;this.add('path',ax+dx*t,.103,az+dz*t,len/n-.035,.055,1.38,p.road,rot)}
    }
    const distance=(x,z)=>Math.min(...map.path.slice(1).map(([bx,bz],i)=>{const[ax,az]=map.path[i],dx=bx-ax,dz=bz-az;const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-ax-t*dx,z-az-t*dz)}));
    let seed=82+index*781;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    // Border planting leaves the buildable interior clear.
    for(let i=0;i<68;i++){
      const horizontal=i<40;const x=horizontal?(random()*24-12):(i%2?-11.8:11.8);const z=horizontal?(i%2?-7.7:7.7):(random()*15-7.5);
      if(distance(x,z)<1.7)continue;const type=i%6===0?(index===1?'apple-tree':'tree'):index===4&&i%3===0?'pumpkin':i%3===0?'rock':i%4===0?'flower':'bush';const scale=type==='tree'?.7+random()*.45:.55+random()*.6;
      this.add(type,x,.06,z,scale,scale,scale,undefined,random()*Math.PI*2);
    }
    for(let i=0;i<35;i++){const x=random()*23-11.5,z=random()*14-7;if(distance(x,z)>1.3)this.add('flower',x,.045,z,.25,.25,.25,undefined,random()*6.28)}
    if(index===3)for(let i=0;i<10;i++){const x=i%2?-10.5:10.5,z=-6+i*1.3;if(distance(x,z)>1.4)this.add('crystal',x,.04,z,.55,.7,.55)}
    if(index===2){this.add('water',3.2,.035,-6.9,4.7,.06,1.5);this.add('water',4.2,.035,-7.8,6,.06,1.3);}
    const end=map.path.at(-1);this.add('house',THREE.MathUtils.clamp(end[0],-11.3,11.3),.1,THREE.MathUtils.clamp(end[1]+1.4,-7,7),.85,.85,.85);
    const start=map.path[0];this.add('mushroom',THREE.MathUtils.clamp(start[0]+.8,-12,12),.08,THREE.MathUtils.clamp(start[1]-1.2,-7.6,7.6),.6,.6,.6);
    this.resize();
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);const a=w/h,halfW=Math.max(13.9,8.5*a),halfH=halfW/a;this.camera.left=-halfW;this.camera.right=halfW;this.camera.top=halfH;this.camera.bottom=-halfH;this.camera.updateProjectionMatrix();}
  pick(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.ray.intersectPlane(this.plane,this.point);}
  setGhost(type,x,z,valid,range) {
    if(!type){if(this.ghost)this.ghost.visible=false;return;}
    if(this.ghostType!==type){if(this.ghost)this.scene.remove(this.ghost);this.ghost=this.clone('gnome-'+type);this.ghost.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material]){m.transparent=true;m.opacity=.6;}}});this.scene.add(this.ghost);this.ghostType=type;}
    this.ghost.position.set(x,.05,z);this.ghost.visible=true;this.showRange(x,z,range,valid);
  }
  showRange(x,z,range,valid=true){this.range.position.set(x,.13,z);this.range.scale.set(Math.min(range,35),1,Math.min(range,35));this.range.visible=true;this.range.traverse(o=>{if(o.isMesh)o.material.color.set(valid?0xd5f395:0xf3817e)})}
  render(game,state,time) {
    const seen=new Set();
    for(const t of game.towers){const key='t'+t.id;seen.add(key);let o=this.entities.get(key);if(!o){o=this.clone('gnome-'+t.type);o.userData.towerId=t.id;this.actors.add(o);this.entities.set(key,o)}o.position.set(t.x,.07,t.z);const nearest=game.enemies.reduce((best,e)=>!best||Math.hypot(e.x-t.x,e.z-t.z)<Math.hypot(best.x-t.x,best.z-t.z)?e:best,null);if(nearest)o.rotation.y=Math.atan2(nearest.x-t.x,nearest.z-t.z);o.scale.setScalar(1+Math.min(t.levels.reduce((a,b)=>a+b,0),6)*.035);}
    for(const e of game.enemies){const key='e'+e.id;seen.add(key);let o=this.entities.get(key);if(!o){o=this.clone(e.boss||e.isBoss?'skeleton-boss':'skeleton');const color=e.color||ENEMIES[e.type]?.color; if(color)o.traverse(m=>{if(!m.isMesh)return;const tint=mat=>{if(!/cream|purple|bone|skull|rib/i.test(mat.name))return mat;const k=mat.uuid+color;if(!this.tintMaterials.has(k)){const copy=mat.clone();copy.color.set(color);this.tintMaterials.set(k,copy)}return this.tintMaterials.get(k)};m.material=Array.isArray(m.material)?m.material.map(tint):tint(m.material)});this.actors.add(o);this.entities.set(key,o);const hp=this.clone('path',0xd5f395);hp.name='health';hp.scale.set(.8,.055,.065);hp.position.set(0,1.65,0);o.add(hp);}o.position.set(e.x,.1+Math.sin(time*10+e.id)*.035,e.z);if(o.userData.lastX!==undefined){const dx=e.x-o.userData.lastX,dz=e.z-o.userData.lastZ;if(Math.abs(dx)+Math.abs(dz)>.001)o.rotation.y=Math.atan2(dx,dz)}o.userData.lastX=e.x;o.userData.lastZ=e.z;const hp=o.getObjectByName('health');if(hp){hp.scale.x=.8*Math.max(.01,e.hp/e.maxHp);hp.visible=e.hp<e.maxHp;}if(e.stun>0)o.rotation.z=Math.sin(time*16)*.05;else o.rotation.z=0;}
    for(const [key,o]of this.entities)if(!seen.has(key)){this.actors.remove(o);this.entities.delete(key)}
    const ts=new Set();for(const trap of game.traps){ts.add(trap.id);let o=this.traps.get(trap.id);if(!o){o=this.clone('mushroom');o.scale.setScalar(.42);this.actors.add(o);this.traps.set(trap.id,o)}o.position.set(trap.x,.12,trap.z)}for(const[id,o]of this.traps)if(!ts.has(id)){this.actors.remove(o);this.traps.delete(id)}
    const fs = new Set();
    for (const effect of [...game.effects, ...game.projectiles]) {
      fs.add(effect.id);
      let object = this.fx.get(effect.id);
      if (!object) {
        object = this.clone(effect.type === 'explosion' ? 'explosion' : 'projectile', effect.color);
        this.actors.add(object);
        this.fx.set(effect.id, object);
      }
      const progress = THREE.MathUtils.clamp(1 - effect.ttl / effect.maxTtl, 0, 1);
      object.position.set(effect.x, .65, effect.z);
      if (effect.type === 'explosion') {
        object.scale.setScalar((effect.radius || 1.5) * Math.max(.1, progress));
      } else if (effect.type === 'poison') {
        object.position.y = .4;
        object.scale.setScalar(.26);
      } else if (effect.type === 'impact') {
        object.scale.setScalar(.08 + .18 * (1 - progress));
      } else {
        // A compact Blender-made pellet travels from the weapon to its moving target.
        const target = game.enemies.find(enemy => enemy.id === effect.targetId);
        const tx = target?.x ?? effect.tx, tz = target?.z ?? effect.tz;
        const dx = tx - effect.x, dz = tz - effect.z;
        const arc = effect.unitType === 'boom' ? .45 : effect.unitType === 'sprout' ? .2 : .08;
        object.position.set(effect.x + dx * progress, .75 + Math.sin(progress * Math.PI) * arc, effect.z + dz * progress);
        const radius = effect.type === 'stun' ? .17 : effect.unitType === 'boom' ? .15 : .11;
        object.scale.setScalar(radius);
        object.rotation.set(progress * Math.PI * 4, Math.atan2(dx, dz), 0);
      }
    }
    for (const [id, object] of this.fx) {
      if (!fs.has(id)) { this.actors.remove(object); this.fx.delete(id); }
    }
    if(!state.placingType){if(this.ghost)this.ghost.visible=false;const t=game.towers.find(t=>t.id===state.selectedTowerId);if(t)this.showRange(t.x,t.z,game.getStats(t).range);else this.range.visible=false;}
    this.renderer.render(this.scene,this.camera);
  }
}
