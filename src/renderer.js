import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOWERS, ENEMIES, SECRETS, cottagePosition } from './data.js';

const ASSETS = ['reborn-gnome','soul-puff','necro-clue','secret-pumpkin-moon','secret-pumpkin-star','secret-pumpkin-leaf','secret-pumpkin-flame','path-tile','entry-arrow','black-hole','crystal-barrier','secret-rune','secret-crystal','pumpkin','apple-tree','water','ground','path','tree','bush','rock','flower','mushroom','house','fence','crystal','projectile','ring','explosion','skeleton','skeleton-boss',...Object.keys(TOWERS).map(t=>'gnome-'+t)];
const palettes = [
  {grass:0x87aa59, edge:0x6c6946, road:0xe2c795, bg:0x183c35},
  {grass:0xa4ad64, edge:0x716147, road:0xe8cc9c, bg:0x293d32},
  {grass:0x73899a, edge:0x5b647d, road:0xc9c4cd, bg:0x253b47},
  {grass:0x8c9891, edge:0x657c7e, road:0xdbd7c2, bg:0x294753},
  {grass:0x92915c, edge:0x625246, road:0xd7c2a1, bg:0x303b35},
  {grass:0x79a58a, edge:0x516d62, road:0xe1ceb0, bg:0x233f3e},
];
export class GardenRenderer {
  constructor(container, handlers) {
    this.container=container; this.handlers=handlers; this.models={}; this.entities=new Map(); this.traps=new Map(); this.fx=new Map(); this.holes=new Map(); this.barriers=new Map(); this.secrets=new Map(); this.clues=new Map(); this.allies=new Map(); this.tintMaterials=new Map();
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
      this.scene.updateMatrixWorld(true);
      const towers = [...this.entities].filter(([key]) => key.startsWith('t')).map(([, object]) => object);
      const towerHit = this.raycaster.intersectObjects(towers, true)[0];
      const secretHit = this.raycaster.intersectObjects([...this.secrets.values(), ...this.clues.values()], true)[0];
      let hit = towerHit?.object;
      while (hit && hit.userData.towerId === undefined) hit = hit.parent;
      let secret = secretHit && (!towerHit || secretHit.distance < towerHit.distance) ? secretHit.object : null;
      while (secret && secret.userData.secretId === undefined && secret.userData.clueId === undefined) secret = secret.parent;
      this.handlers.onClick(point.x, point.z, secret ? undefined : hit?.userData.towerId, secret?.userData.secretId, secret?.userData.clueId);
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
    for(const object of this.secrets.values())object.traverse(child=>{if(child.isMesh)for(const material of Array.isArray(child.material)?child.material:[child.material])material.dispose();});
    this.world.clear();this.actors.clear();this.entities.clear();this.traps.clear();this.fx.clear();this.holes.clear();this.barriers.clear();this.secrets.clear();this.clues.clear();this.allies.clear();if(this.ghost){this.scene.remove(this.ghost);this.ghost=null;this.ghostType=null;}
    const p=palettes[index%palettes.length];this.scene.background.set(p.bg);this.range.visible=false;
    this.add('ground',0,-.48,0,25.7,.8,17.7,p.edge);
    this.add('ground',0,-.08,0,25.4,.22,17.4,p.grass);
    // Reuse Blender stone meshes; split crossings so junctions have one smooth stone.
    const routes = map.paths || [map.path];
    const cottages = routes.map((_, routeIndex) => cottagePosition(map, routeIndex));
    const clearOfCottages = (x, z) => cottages.every(house => Math.hypot(x - house.x, z - house.z) > 1.75);
    const rawSegments = routes.flatMap(route => route.slice(1).map((point, i) => [route[i], point]));
    const junctions = new Map();
    const junction = point => junctions.set(point.join(','), point);
    for (const segment of rawSegments) segment.forEach(junction);
    for (const [a, b] of rawSegments) for (const [c, d] of rawSegments) {
      const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
      const cross = rx * sz - rz * sx;
      if (Math.abs(cross) < 1e-8) continue;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / cross;
      const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) junction([a[0] + t * rx, a[1] + t * rz]);
    }
    const segments = new Map();
    for (const [a, b] of rawSegments) {
      const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      const points = [...junctions.values()].map(point => ({ point, t: ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2 }))
        .filter(({ point, t }) => t >= 0 && t <= 1 && Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz) < 1e-6).sort((a, b) => a.t - b.t);
      for (let i = 1; i < points.length; i++) {
        const ends = [points[i - 1].point, points[i].point];
        segments.set(ends.map(point => point.join(',')).sort().join('|'), ends);
      }
    }
    for(const [[ax,az],[bx,bz]] of segments.values()){
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx);
      this.add('path',(ax+bx)/2,.055,(az+bz)/2,len+.65,.07,1.58,0xbca67e,rot);
      const inner = len - 1.45, n = Math.max(0, Math.ceil(inner / .72));
      for(let j=0;j<n;j++){const t=(.725+(j+.5)*inner/n)/len;this.add('path-tile',ax+dx*t,.085,az+dz*t,(inner/n-.035)/.7,1,1,p.road,rot)}
    }
    for (const [x, z] of junctions.values()) this.add('path-tile', x, .085, z, 1.38/.7, 1, 1, p.road);
    const distance=(x,z)=>Math.min(...[...segments.values()].map(([[ax,az],[bx,bz]])=>{const dx=bx-ax,dz=bz-az;const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-ax-t*dx,z-az-t*dz)}));
    let seed=82+index*781;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    // Border planting leaves the buildable interior clear.
    for(let i=0;i<68;i++){
      const horizontal=i<40;const x=horizontal?(random()*24-12):(i%2?-11.8:11.8);const z=horizontal?(i%2?-7.7:7.7):(random()*15-7.5);
      if(distance(x,z)<1.7||!clearOfCottages(x,z)||(SECRETS[map.id]?.spots||[]).some(spot=>Math.hypot(spot.x-x,spot.z-z)<1.1))continue;let type=i%6===0?(index===1?'apple-tree':'tree'):index===4&&i%3===0?'pumpkin':i%3===0?'rock':i%4===0?'flower':'bush';if(type.endsWith('tree')&&distance(x,z)<3)type='bush';const scale=type==='tree'?.7+random()*.45:.55+random()*.6;
      this.add(type,x,.06,z,scale,scale,scale,undefined,random()*Math.PI*2);
    }
    for(let i=0;i<35;i++){const x=random()*23-11.5,z=random()*14-7;if(distance(x,z)>1.3&&clearOfCottages(x,z))this.add('flower',x,.045,z,.5,.5,.5,undefined,random()*6.28)}
    if(index===3)for(let i=0;i<10;i++){const x=i%2?-10.5:10.5,z=-6+i*1.3;if(distance(x,z)>1.4&&clearOfCottages(x,z))this.add('crystal',x,.04,z,.55,.7,.55)}
    if(index===2){this.add('water',3.2,.035,-6.9,4.7,.06,1.5);this.add('water',4.2,.035,-7.8,6,.06,1.3);}
    const exits = new Set(), entrances = new Set();
    for (const route of routes) {
      const end = route.at(-1), start = route[0], next = route[1];
      if (!exits.has(end.join(','))) {
        const location = cottagePosition(map, routes.indexOf(route));
        const house = this.add('house', location.x, .1, location.z, .85, .85, .85);
        if (map.id === 'hollow') {
          house.userData.clueId = 'hollow-cottage';
          const plaque = this.clone('necro-clue');
          plaque.position.set(0, .85, .755);
          house.add(plaque);
          this.clues.set('hollow-cottage', house);
        }
        exits.add(end.join(','));
      }
      if (!entrances.has(start.join(','))) {
        const dx = next[0] - start[0], dz = next[1] - start[1], length = Math.hypot(dx, dz);
        const arrow = this.add('entry-arrow', start[0] + dx / length * .8, .16, start[1] + dz / length * .8, 1, 1, 1, undefined, Math.atan2(dx, dz));
        arrow.userData.entrance = true;
        this.add('mushroom',THREE.MathUtils.clamp(start[0]+.8,-12,12),.08,THREE.MathUtils.clamp(start[1]-1.2,-7.6,7.6),.6,.6,.6);
        entrances.add(start.join(','));
      }
    }
    for (const spot of SECRETS[map.id]?.spots || []) {
      const object = this.clone(map.id === 'hollow' ? 'secret-pumpkin-' + spot.id.split('-').at(-1) : map.id === 'quarry' ? 'secret-crystal' : 'secret-rune');
      object.position.set(spot.x, .11, spot.z);
      object.userData.secretId = spot.id;
      object.traverse(child => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const copies = materials.map(material => {
          const copy = material.clone();
          if (copy.name === 'pumpkin-rune' && copy.emissive) { copy.emissive.set(0xf7bd60); copy.emissiveIntensity = 0; }
          if (copy.name === 'secret-gem') { copy.color.set(spot.color); if (copy.emissive) copy.emissive.set(spot.color).multiplyScalar(.22); }
          return copy;
        });
        child.material = Array.isArray(child.material) ? copies : copies[0];
      });
      this.world.add(object);
      this.secrets.set(spot.id, object);
    }
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h, portrait = aspect < .85;
    // Fit the garden tightly; on phones its long side runs vertically.
    this.camera.position.set(portrait ? 21 : 0, 32, portrait ? 0 : 21);
    this.camera.lookAt(0, 0, 0);
    const halfW = portrait ? Math.max(9.2, 11 * aspect) : Math.max(13.1, 8 * aspect);
    const halfH = halfW / aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
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
    for(const e of game.enemies){const key='e'+e.id;seen.add(key);let o=this.entities.get(key);if(!o){o=this.clone(e.boss||e.isBoss?'skeleton-boss':'skeleton');const color=e.color||ENEMIES[e.type]?.color; if(color)o.traverse(m=>{if(!m.isMesh)return;const tint=mat=>{if(!/cream|purple|bone|skull|rib/i.test(mat.name))return mat;const k=mat.uuid+color;if(!this.tintMaterials.has(k)){const copy=mat.clone();copy.color.set(color);this.tintMaterials.set(k,copy)}return this.tintMaterials.get(k)};m.material=Array.isArray(m.material)?m.material.map(tint):tint(m.material)});this.actors.add(o);this.entities.set(key,o);const hp=this.clone('path',0xd5f395);hp.name='health';hp.scale.set(.8,.055,.065);hp.position.set(0,1.65,0);o.add(hp);}o.position.set(e.x,.1+Math.sin(time*10+e.id)*.035,e.z);if(o.userData.lastX!==undefined){const dx=e.x-o.userData.lastX,dz=e.z-o.userData.lastZ;if(Math.abs(dx)+Math.abs(dz)>.001)o.rotation.y=Math.atan2(dx,dz)}o.userData.lastX=e.x;o.userData.lastZ=e.z;const hp=o.getObjectByName('health');if(hp){hp.scale.x=.8*Math.max(.01,e.hp/e.maxHp);hp.visible=e.hp<e.maxHp;}if(e.slowRemaining>0)o.rotation.z=Math.sin(time*5)*.025;else o.rotation.z=0;
      if(!e.capturedBy&&game.barriers.some(b=>b.hp>0&&Math.hypot(e.x-b.x,e.z-b.z)<.4)){o.rotation.z=Math.sin(time*12+e.id)*.1;o.position.y+=Math.abs(Math.sin(time*12+e.id))*.04;}
      if(e.allyTargetId&&!e.capturedBy){const ally=game.allies.find(a=>a.id===e.allyTargetId);if(ally)o.rotation.y=Math.atan2(ally.x-e.x,ally.z-e.z);o.rotation.z=Math.sin(game.time*12+e.id)*.1;}
      if(e.capturedBy){o.position.y=-.06;o.position.x+=Math.sin(time*5+e.id)*.16;o.position.z+=Math.cos(time*5+e.id)*.16;o.rotation.y=time*5+e.id;o.rotation.z=.25;}o.scale.setScalar(THREE.MathUtils.lerp(o.scale.x,e.capturedBy?.52:1,.25));}
    for(const [key,o]of this.entities)if(!seen.has(key)){this.actors.remove(o);this.entities.delete(key)}
    const allyIds = new Set();
    for (const ally of game.allies || []) {
      allyIds.add(ally.id);
      let object = this.allies.get(ally.id);
      if (!object) {
        object = this.clone('reborn-gnome');
        object.userData.allyId = ally.id;
        const ring = this.clone('ring', 0x89e2bd); ring.scale.set(.4, .45, .4); ring.position.y = .02; object.add(ring);
        const health = this.clone('path', 0x8ef0c5); health.name = 'ally-health'; health.position.set(0, 1.17, 0); health.scale.set(.62, .045, .065); object.add(health);
        this.actors.add(object); this.allies.set(ally.id, object);
      }
      const target = ally.phase === 'fighting' && game.enemies.find(enemy => enemy.id === ally.targetId && enemy.hp > 0);
      const dx = ally.x - (object.userData.lastX ?? ally.x), dz = ally.z - (object.userData.lastZ ?? ally.z);
      object.position.set(ally.x, .12, ally.z);
      if (target) {
        object.rotation.y = Math.atan2(target.x - ally.x, target.z - ally.z);
        const swing = Math.sin(game.time * 12 + ally.id);
        object.rotation.z = swing * .12;
        object.position.x += Math.sin(object.rotation.y) * Math.max(0, swing) * .08;
        object.position.z += Math.cos(object.rotation.y) * Math.max(0, swing) * .08;
      } else {
        if (Math.hypot(dx, dz) > .0001) object.rotation.y = Math.atan2(dx, dz);
        object.rotation.z = Math.sin(game.time * 11 + ally.id) * .05;
        object.position.y += Math.abs(Math.sin(game.time * 11 + ally.id)) * .06;
      }
      object.userData.lastX = ally.x; object.userData.lastZ = ally.z;
      const age = ally.maxTtl - ally.ttl;
      object.scale.setScalar(Math.max(.12, Math.min(1, (age + .1) / .35, ally.ttl / .5)));
      const health = object.getObjectByName('ally-health');
      health.scale.x = .62 * Math.max(.01, ally.hp / ally.maxHp);
      health.visible = ally.hp < ally.maxHp || !!target;
    }
    for (const [id, object] of this.allies) if (!allyIds.has(id)) { this.actors.remove(object); this.allies.delete(id); }

    const ts=new Set();for(const trap of game.traps){ts.add(trap.id);let o=this.traps.get(trap.id);if(!o){o=this.clone('mushroom');o.scale.setScalar(.42);this.actors.add(o);this.traps.set(trap.id,o)}o.position.set(trap.x,.12,trap.z)}for(const[id,o]of this.traps)if(!ts.has(id)){this.actors.remove(o);this.traps.delete(id)}
    const holeIds = new Set();
    for (const hole of game.holes) {
      holeIds.add(hole.id);
      let object = this.holes.get(hole.id);
      if (!object) { object = this.clone('black-hole'); this.actors.add(object); this.holes.set(hole.id, object); }
      object.position.set(hole.x, .17, hole.z);
      object.rotation.y = -time * (hole.capture ? 2.5 : 1.3);
      const fade = Math.min(1, hole.ttl / .4, (hole.maxTtl - hole.ttl + .1) / .35);
      const radius = hole.radius * (.96 + .04 * Math.sin(time * 4)) * Math.max(.05, fade);
      object.scale.set(radius, 1, radius);
    }
    for (const [id, object] of this.holes) if (!holeIds.has(id)) { this.actors.remove(object); this.holes.delete(id); }
    const barrierIds = new Set();
    for (const barrier of game.barriers) {
      barrierIds.add(barrier.id);
      let object = this.barriers.get(barrier.id);
      if (!object) {
        object = this.clone('crystal-barrier');
        const health = this.clone('path', 0x7cf0ef); health.name = 'barrier-health'; health.position.set(0, 1.18, 0); health.scale.set(.9, .055, .07); object.add(health);
        this.actors.add(object); this.barriers.set(barrier.id, object);
      }
      object.position.set(barrier.x, .12, barrier.z);
      const before = game.pointAt(Math.max(0, barrier.progress - .1), barrier.routeIndex), after = game.pointAt(barrier.progress + .1, barrier.routeIndex);
      object.rotation.y = Math.atan2(after.x - before.x, after.z - before.z);
      object.getObjectByName('barrier-health').scale.x = .9 * Math.max(.02, barrier.hp / barrier.maxHp);
    }
    for (const [id, object] of this.barriers) if (!barrierIds.has(id)) { this.actors.remove(object); this.barriers.delete(id); }
    for (const [id, object] of this.secrets) {
      const found = game.secretDiscoveries.includes(id) || game.isUnlocked(SECRETS[game.map.id].unit);
      const pumpkin = id.startsWith('hollow-');
      object.scale.setScalar(found ? 1.03 + Math.sin(time * 3) * .03 : 1);
      if (found && !pumpkin) object.rotation.y = time * .35;
      object.traverse(child => { if (!child.isMesh) return; for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.emissiveIntensity = pumpkin ? (material.name === 'pumpkin-rune' && found ? 1.6 : 0) : found ? 1.5 : .65; });
    }
    const fs = new Set();
    for (const effect of [...game.effects, ...game.projectiles]) {
      fs.add(effect.id);
      let object = this.fx.get(effect.id);
      if (!object) {
        object = this.clone(['soul-reap','reborn-spawn','reborn-fade'].includes(effect.type) ? 'soul-puff' : effect.type === 'explosion' ? 'explosion' : 'projectile', effect.color);
        this.actors.add(object);
        this.fx.set(effect.id, object);
      }
      const progress = THREE.MathUtils.clamp(1 - effect.ttl / effect.maxTtl, 0, 1);
      object.position.set(effect.x, .65, effect.z);
      if (['soul-reap','reborn-spawn','reborn-fade'].includes(effect.type)) {
        object.position.y = .3 + progress * .7;
        object.rotation.y = progress * Math.PI;
        object.scale.setScalar(.3 + Math.sin(progress * Math.PI) * .5);
      } else if (effect.type === 'reborn-hit') {
        object.scale.setScalar(.08 + .15 * (1 - progress));
      } else if (effect.type === 'explosion') {
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
        const arc = effect.type === 'poison-spread' ? .4 : effect.unitType === 'boom' ? .45 : effect.unitType === 'sprout' ? .2 : effect.unitType === 'necro' ? .3 : .08;
        object.position.set(effect.x + dx * progress, .75 + Math.sin(progress * Math.PI) * arc, effect.z + dz * progress);
        const radius = effect.type === 'poison-spread' ? .13 : effect.type === 'stun' ? .17 : effect.unitType === 'boom' ? .15 : .11;
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
