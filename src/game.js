import { MAPS, TOWERS, ENEMIES, SECRETS, NECRO_PATH_SECRET, cottagePosition, cottageDoorPosition } from './data.js';
import { SPOREFIRE, PRISMSTORM, BERRY_SINGULARITY } from './combos.js';
import { ENEMY_TRAITS, traitForSpawn, damageMultiplier, damageKindForTower } from './enemy-traits.js';
import { normalizeEconomy, MAX_ROUND_COINS } from './economy.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function wavePlan(wave, endless = false) {
  if (!Number.isSafeInteger(wave) || wave < 1 || (!endless && wave > 20)) return [];
  if (wave > 20) {
    // Bound the crowd size for browser performance; enemy strength keeps growing.
    const extra = wave - 20;
    const roster = wave < 30 ? ['blue', 'red', 'purple', 'gold'] : wave < 50 ? ['red', 'purple', 'gold'] : ['purple', 'gold'];
    const result = Array.from({ length: Math.min(180, 49 + extra * 3) }, (_, i) => roster[(i + wave) % roster.length]);
    if (wave % 5 === 0) result.push(...Array(Math.min(6, 1 + Math.floor(extra / 20))).fill(wave % 10 === 0 ? 'king' : 'boss'));
    return result;
  }
  const roster = ['bone'];
  if (wave >= 3) roster.push('green');
  if (wave >= 5) roster.push('blue');
  if (wave >= 7) roster.push('red');
  if (wave >= 11) roster.push('purple');
  if (wave >= 14) roster.push('gold');
  const count = 9 + wave * 2;
  const result = Array.from({ length: count }, (_, i) => roster[(i * 7 + wave) % roster.length]);
  if (wave === 10) result.push('boss');
  if (wave === 20) result.push('king');
  return result;
}

export class Game {
  constructor(mapId = 'meadow', profile = { unlocks: [] }) {
    this.map = MAPS.find(m => m.id === mapId) || MAPS[0];
    this.profile = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
    normalizeEconomy(this.profile);
    this.bossDamageOwners = null;
    this._sourceOwners = {};
    if (!Array.isArray(this.profile.unlocks)) this.profile.unlocks = [];
    this.profile.pathUnlocks = [...new Set((Array.isArray(this.profile.pathUnlocks) ? this.profile.pathUnlocks : []).filter(id => id === NECRO_PATH_SECRET.id))];
    this.profile.enemyTraits = [...new Set((Array.isArray(this.profile.enemyTraits) ? this.profile.enemyTraits : []).filter(id => typeof id === 'string' && Object.hasOwn(ENEMY_TRAITS, id)))];
    const records = this.profile.bestRounds;
    this.profile.bestRounds = Object.fromEntries(MAPS.map(map => [map.id,
      Number.isSafeInteger(records?.[map.id]) && records[map.id] > 0 ? records[map.id] : 0]));
    this.wave = 0;
    this.completedWaves = 0;
    this.maxWaves = 20;
    this.endless = false;
    this.lives = 100;
    this.gold = 650;
    this.points = 0;
    this.towers = [];
    this.enemies = [];
    this.traps = [];
    this.holes = [];
    this.barriers = [];
    this.allies = [];
    this.secretDiscoveries = [];
    this.necroSpellKills = 0;
    this.pathSecretDiscoveries = [];
    this._necroPathHinted = false;
    this._pendingSummon = null;
    this.effects = [];
    this.comboDiscoveries = [];
    this.projectiles = [];
    this.events = [];
    this.status = 'planning';
    this.kills = 0;
    this.time = 0;
    this._id = 0;
    this._queue = [];
    this._spawnTimer = 0;
    this._spawnCount = 0;
    this._traitSpawnCount = 0;
    this.routes = (this.map.paths || [this.map.path]).map(path => {
      const segments = [];
      let length = 0;
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1], [bx, bz] = path[i];
        const segmentLength = Math.hypot(bx - ax, bz - az);
        if (segmentLength <= 0) continue;
        segments.push({ ax, az, bx, bz, length: segmentLength, start: length });
        length += segmentLength;
      }
      return { path, segments, length };
    });
    // Preserve the original single-route API for callers and map previews.
    this._segments = this.routes[0].segments;
    this.pathLength = this.routes[0].length;
    for (const starter of this.map.startingTowers || []) {
      if (!TOWERS[starter.type] || !this._validTowerSpot(starter.x, starter.z)) continue;
      this._makeTower(starter.type, starter.x, starter.z, 0).starting = true;
    }
  }

  _event(type, message, extra = {}) {
    this.events.push({ type, message, ...extra });
    if (this.events.length > 100) this.events.shift();
  }

  routeLength(routeIndex = 0) {
    return (this.routes[routeIndex] || this.routes[0]).length;
  }

  pointAt(progress, routeIndex = 0) {
    const route = this.routes[routeIndex] || this.routes[0];
    const p = clamp(progress, 0, route.length);
    const s = route.segments.find(segment => p <= segment.start + segment.length) || route.segments.at(-1);
    const t = clamp((p - s.start) / s.length, 0, 1);
    return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t };
  }

  pathDistance(x, z) {
    return Math.min(...this.routes.flatMap(route => route.segments.map(s => {
      const t = clamp(((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / s.length ** 2, 0, 1);
      return Math.hypot(x - s.ax - t * (s.bx - s.ax), z - s.az - t * (s.bz - s.az));
    })));
  }

  remainingDistance(enemy) {
    return Math.max(0, this.routeLength(enemy.routeIndex) - enemy.progress);
  }

  _anchorMap(anchor) {
    const origin = this.routes[anchor.routeIndex ?? 0] || this.routes[0];
    const tangents = origin.segments.filter(s => anchor.progress >= s.start - 1e-7 && anchor.progress <= s.start + s.length + 1e-7);
    return this.routes.map(route => {
      const occurrences = [];
      for (const s of route.segments) {
        // A road crossing is not a shared road: only parallel overlapping segments count.
        if (!tangents.some(t => Math.abs((t.bx - t.ax) * (s.bz - s.az) - (t.bz - t.az) * (s.bx - s.ax)) < 1e-7 * s.length * t.length)) continue;
        const t = ((anchor.x - s.ax) * (s.bx - s.ax) + (anchor.z - s.az) * (s.bz - s.az)) / s.length ** 2;
        if (t < -1e-7 || t > 1 + 1e-7) continue;
        const projected = { x: s.ax + t * (s.bx - s.ax), z: s.az + t * (s.bz - s.az) };
        if (distance(anchor, projected) > 1e-6) continue;
        const progress = s.start + clamp(t, 0, 1) * s.length;
        if (!occurrences.some(p => Math.abs(p - progress) < 1e-6)) occurrences.push(progress);
      }
      return occurrences.sort((a, b) => a - b);
    });
  }

  _anchorProgresses(anchor, routeIndex = 0) {
    anchor.routeProgressMap ??= this._anchorMap(anchor);
    return anchor.routeProgressMap[routeIndex] || [];
  }

  isUnlocked(type) {
    const tower = TOWERS[type];
    return !!tower && ((!tower.unlockWave && !tower.unlockSecret && !tower.unlockMap) || this.profile.unlocks.includes(type));
  }

  isPathUnlocked(type, index) {
    const path = Number.isInteger(index) ? TOWERS[type]?.paths[index] : null;
    return !!path && (!path.unlockSecret || (this.profile.pathUnlocks || []).includes(path.unlockSecret));
  }

  canDiscoverNecroPath() {
    return ['planning', 'wave'].includes(this.status) && this.map.id === NECRO_PATH_SECRET.mapId &&
      this.isUnlocked('necro') && this.necroSpellKills >= NECRO_PATH_SECRET.requiredKills && !this.isPathUnlocked('necro', 3);
  }

  _validTowerSpot(x, z) {
    return Number.isFinite(x) && Number.isFinite(z) &&
      Math.abs(x) <= 11.35 && Math.abs(z) <= 7 && this.pathDistance(x, z) >= 1.3 &&
      (SECRETS[this.map.id]?.spots || []).every(spot => Math.hypot(spot.x - x, spot.z - z) >= 0.65) &&
      this.towers.every(t => Math.hypot(t.x - x, t.z - z) >= 1.4);
  }

  canPlace(type, x, z) {
    return this.isUnlocked(type) && ['planning', 'wave'].includes(this.status) &&
      this.gold >= TOWERS[type].cost && this._validTowerSpot(x, z);
  }

  _makeTower(type, x, z, purchaseCost) {
    const tower = { id: ++this._id, type, x, z, levels: TOWERS[type].paths.map(() => 0), kills: 0, damageDone: 0, cooldown: 0, planted: 0, targeting: 'first', purchaseCost, soulQueue: [], summonCooldown: 0 };
    if (type === 'necro') tower.skin = this.profile.equippedNecroSkin;
    this.towers.push(tower);
    return tower;
  }

  placeTower(type, x, z) {
    if (!this.canPlace(type, x, z)) return null;
    const tower = this._makeTower(type, x, z, TOWERS[type].cost);
    this.gold -= tower.purchaseCost;
    this._event('placed', `${TOWERS[type].name} joined the garden.`, { towerId: tower.id });
    return tower;
  }

  discoverSecret(id) {
    const secret = SECRETS[this.map.id];
    if (!['planning', 'wave'].includes(this.status) || !secret?.spots.some(spot => spot.id === id)) return false;
    if (this.map.id === NECRO_PATH_SECRET.mapId && this.isUnlocked('necro')) return this._discoverNecroPath(id);
    if (secret.order) {
      if (this.secretDiscoveries.length === secret.order.length || this.secretDiscoveries.at(-1) === id) return false;
      if (id !== secret.order[this.secretDiscoveries.length]) {
        this.secretDiscoveries = [];
        this._event('secret-reset', 'The little lights fade. The cottage may hold a clue.', { unit: secret.unit, count: 0 });
        return false;
      }
    } else if (this.secretDiscoveries.includes(id)) return false;
    this.secretDiscoveries.push(id);
    const count = this.secretDiscoveries.length;
    this._event('secret-found', secret.order ? 'A little pumpkin light wakes.' : `Hidden treasure found! ${count} / ${secret.spots.length}`, { id, count, total: secret.spots.length, unit: secret.unit });
    if (count === secret.spots.length && !this.isUnlocked(secret.unit)) {
      this._unlock(secret.unit);
      if (secret.summon) {
        this._pendingSummon = { type: secret.unit, ...secret.summon };
        this._trySummon();
      }
    }
    return true;
  }

  _discoverNecroPath(id) {
    if (this.isPathUnlocked('necro', 3)) return false;
    if (!this.canDiscoverNecroPath()) {
      if (!this._necroPathHinted) {
        this._necroPathHinted = true;
        this._event('path-secret-hint', 'The lanterns are quiet. Let Morrow’s own spells gather ten souls in this garden.');
      }
      return false;
    }
    const { order } = NECRO_PATH_SECRET;
    if (this.pathSecretDiscoveries.at(-1) === id) return false;
    if (id !== order[this.pathSecretDiscoveries.length]) {
      this.pathSecretDiscoveries = [];
      this._event('path-secret-reset', 'The echoes fade. Trace the cottage rhyme back toward its beginning.', { unit: 'necro', path: 'echoes', count: 0 });
      return false;
    }
    this.pathSecretDiscoveries.push(id);
    const count = this.pathSecretDiscoveries.length;
    this._event('path-secret-found', 'A lantern answers with an echo.', { id, unit: 'necro', path: 'echoes', count, total: order.length });
    if (count === order.length) {
      this.profile.pathUnlocks.push(NECRO_PATH_SECRET.id);
      this._event('path-unlock', 'Soul Echoes unlocked! Morrow can now learn to summon more reborn gnomes per spell defeat.', { unit: 'necro', path: 'echoes', pathId: NECRO_PATH_SECRET.id });
    }
    return true;
  }

  _trySummon() {
    if (!this._pendingSummon || !['planning', 'wave'].includes(this.status)) return;
    const { type, x, z } = this._pendingSummon;
    let spot = this._validTowerSpot(x, z) ? { x, z } : null;
    // Search outward from the altar, with normal path, boundary, and overlap rules.
    for (let radius = 0.5; !spot && radius <= 25; radius += 0.5) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        const candidate = { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
        if (this._validTowerSpot(candidate.x, candidate.z)) { spot = candidate; break; }
      }
    }
    if (!spot) return;
    const tower = this._makeTower(type, spot.x, spot.z, 0);
    tower.summoned = true;
    this._pendingSummon = null;
    this._event('summoned', `${TOWERS[type].name} appeared! Your first crystal guardian is free.`, { towerId: tower.id, unit: type });
  }

  upgradeTower(id, pathIndex) {
    if (!['planning', 'wave'].includes(this.status)) return false;
    const tower = this.towers.find(t => t.id === id);
    if (!tower || !Number.isInteger(pathIndex) || !TOWERS[tower.type].paths[pathIndex] || !this.isPathUnlocked(tower.type, pathIndex)) return false;
    const level = tower.levels[pathIndex] ?? 0;
    if (level >= 3 || (level === 0 && tower.levels.filter(n => n > 0).length >= 2)) return false;
    const cost = TOWERS[tower.type].paths[pathIndex].costs[level];
    if (this.points < cost) return false;
    this.points -= cost;
    tower.levels[pathIndex] = level + 1;
    this._event('upgrade', `${TOWERS[tower.type].name}: ${TOWERS[tower.type].paths[pathIndex].name} ${level + 1}.`, { towerId: id });
    return true;
  }

  setTargeting(id, mode) {
    if (!['planning', 'wave'].includes(this.status) || !['first', 'last', 'strong', 'close'].includes(mode)) return false;
    const tower = this.towers.find(t => t.id === id);
    if (!tower || ['spore', 'gravity', 'crystal'].includes(tower.type)) return false;
    tower.targeting = mode;
    return true;
  }

  _targetPriority(tower, a, b) {
    const first = this.remainingDistance(a) - this.remainingDistance(b);
    switch (tower.targeting) {
      case 'last': return -first;
      case 'strong': return b.maxHp - a.maxHp || first;
      case 'close': return distance(tower, a) - distance(tower, b) || first;
      default: return first;
    }
  }

  sellTower(id) {
    if (!['planning', 'wave'].includes(this.status)) return false;
    const index = this.towers.findIndex(t => t.id === id);
    if (index < 0) return false;
    const [tower] = this.towers.splice(index, 1);
    // Poison and projectiles can outlive a sold tower. Preserve who fired them.
    if (tower.ownerId != null) this._sourceOwners[tower.id] = tower.ownerId;
    this.gold += Math.floor((tower.purchaseCost ?? TOWERS[tower.type].cost) * 0.75);
    this.traps = this.traps.filter(trap => trap.sourceId !== id);
    this.holes = this.holes.filter(hole => hole.sourceId !== id);
    for (const enemy of this.enemies) if (enemy.capturedBy != null && !this.holes.some(h => h.id === enemy.capturedBy)) enemy.capturedBy = null;
    this.barriers = this.barriers.filter(barrier => barrier.sourceId !== id);
    this.allies = this.allies.filter(ally => ally.sourceId !== id);
    for (const enemy of this.enemies) if (enemy.allyTargetId != null && !this.allies.some(ally => ally.id === enemy.allyTargetId)) enemy.allyTargetId = null;
    tower.soulQueue = [];
    this._trySummon();
    this._event('sold', `${TOWERS[tower.type].name} returned home. Upgrade points stay spent.`);
    return true;
  }

  getStats(tower) {
    const [a = 0, b = 0, c = 0, d = 0] = tower.levels;
    let stats;
    switch (tower.type) {
      case 'sprout': stats = { damage: [5, 11, 22, 42][a] + d * (3 + Math.min(35, tower.kills || 0) * 0.7), interval: 0.95 * 0.73 ** b, range: 3.4 + c * 1.0 }; break;
      case 'spore': stats = { damage: 0, interval: 2.5 * 0.68 ** c, range: 3.9 + d * 1.1, poisonDps: [6, 11, 19, 32][a], poisonDuration: 4 + b * 2, charges: 1 + b, trapRadius: 0.62 + d * 0.32, poisonSpreadRadius: d > 0 ? 0.7 + d * 0.6 : 0, poisonSpreadInterval: 1, poisonSpreadTargets: d, poisonSpreadMultiplier: 0.65, volatileSpores: d === 3 }; break;
      case 'boom': stats = { damage: [13, 24, 42, 70][a], interval: 1.4 * 0.73 ** c, range: 3.7 + d * 1.0, explosionDamage: [18, 30, 48, 75][b], explosionRadius: 1.5 + b * 0.5 }; break;
      case 'stun': stats = { damage: [3, 10, 22, 40][c], interval: 1.7 * 0.73 ** b, range: 3.8 + d * 1.0, slowDuration: 2 + a * 0.8, slowMultiplier: 0.5 }; break;
      case 'multi': stats = { damage: [8, 15, 26, 42][a], interval: 1.3 * 0.72 ** a, range: 4, shots: 3 + a }; break;
      case 'sniper': stats = { damage: [5, 25, 65, 130][a], interval: 1.25 * 0.48 ** b, range: 100 }; break;
      case 'gravity': {
        const holeDuration = 3 + b * 1.1;
        stats = { damage: 0, range: 4.2 + c * 0.7, gravityDps: [3, 6, 12, 65][a], pullSpeed: [2.2, 3.2, 4.5, 7][a], holeDuration, holeRadius: 2.2 + c * 0.8, capture: a === 3, interval: holeDuration + Math.max(5, 7 + a * 2 + b * 1.2 - d * 1.5) };
        break;
      }
      case 'crystal': stats = { damage: 0, range: 4 + d, interval: Math.max(8, 12 - c * 1.4), barrierHp: [70, 120, 200, 320][a], barrierLifetime: 20 + a * 2, barrierLimit: 2, explosionDamage: [0, 28, 55, 95][b], explosionRadius: 1.5 + b * 0.4 }; break;
      case 'necro': {
        const echoLevel = this.isPathUnlocked('necro', 3) && Number.isInteger(d) ? clamp(d, 0, 3) : 0;
        const summonCount = [1, 2, 3, 4][echoLevel];
        stats = { damage: [12, 20, 32, 48][c], interval: 1.5 * 0.82 ** c, range: 4 + c * 0.6, allyHp: [50, 90, 150, 240][a], allyDamage: [8, 14, 24, 38][a], allyInterval: 0.8, allySpeed: 3.5 + b * 0.5, allyLifetime: 55, allyLimit: Math.max(3 + b * 2, summonCount), summonInterval: [2.4, 1.8, 1.2, 0.7][b], summonCount };
        break;
      }
      case 'strawberry': stats = { damage: [18,34,60,96][a], interval: 4 * 0.76 ** c, range: 40, explosionRadius: [2.1,2.45,2.8,3.2][a], seedCount: [8,12,16,20][b], seedDamage: [4,6,9,13][b], seedPierce: [1,1,2,3][b], seedRange: 3 + b * 0.25, flightDuration: [1.5,1.25,1,0.8][c] }; break;
      default: stats = { damage: 0, interval: 1, range: 0 };
    }
    return { shots: 1, poisonDps: 0, poisonDuration: 0, poisonSpreadRadius: 0, poisonSpreadInterval: 0, poisonSpreadTargets: 0, poisonSpreadMultiplier: 0, slowDuration: 0, slowMultiplier: 1, explosionDamage: 0, explosionRadius: 0, ...stats, attackSpeed: 1 / stats.interval };
  }

  get bestRound() { return this.profile.bestRounds[this.map.id] || 0; }

  continueEndless() {
    if (this.status !== 'won' || this.wave !== this.maxWaves || this.endless || this.lives <= 0) return false;
    this.endless = true;
    this.status = 'planning';
    this._event('endless-start', 'Endless mode! The skeletons grow stronger every round.');
    return true;
  }

  nextWaveInfo() {
    const wave = this.endless ? this.wave + 1 : Math.min(this.maxWaves, this.wave + 1);
    const plan = wavePlan(wave, this.endless);
    const counts = {};
    for (const type of plan) counts[type] = (counts[type] || 0) + 1;
    const bossType = plan.find(type => ENEMIES[type].boss);
    const boss = !!bossType;
    const description = `${plan.length} skeletons incoming${boss ? `, including ${ENEMIES[bossType].name}` : ''}. Prepare your garden!`;
    return { wave, count: plan.length, boss, types: [...new Set(plan)], counts, description };
  }

  startWave() {
    if (this.status !== 'planning' || (!this.endless && this.wave >= this.maxWaves)) return false;
    this.wave++;
    this.status = 'wave';
    this._queue = wavePlan(this.wave, this.endless);
    this._traitSpawnCount = 0;
    this._spawnTimer = 0;
    this._event('wave-start', `Wave ${this.wave}${this._queue.some(type => ENEMIES[type].boss) ? ' · Boss incoming!' : ' has begun.'}`, { wave: this.wave });
    return true;
  }

  _spawn(type, routeIndex = this._spawnCount++ % this.routes.length) {
    if (!Number.isInteger(routeIndex) || !this.routes[routeIndex]) routeIndex = 0;
    const spec = ENEMIES[type];
    const extra = this.endless ? Math.max(0, this.wave - this.maxWaves) : 0;
    const trait = traitForSpawn(this.wave, this.endless, !!spec.boss, spec.boss ? 0 : this._traitSpawnCount++);
    const hp = spec.hp * (spec.boss ? 1 : 1 + Math.max(0, Math.min(this.wave, 20) - 5) * 0.075) * (1 + extra * 0.14) ** 2;
    const enemy = { id: ++this._id, type, trait, routeIndex, ...this.pointAt(0, routeIndex), hp, maxHp: hp, progress: 0, slowRemaining: 0, slowMultiplier: 1, capturedBy: null, poison: null, speed: spec.speed * (1 + extra * 0.018), attackDamage: spec.attackDamage * (1 + extra * 0.08), boss: !!spec.boss, isBoss: !!spec.boss, color: spec.color };
    this.enemies.push(enemy);
    if (trait && !this.profile.enemyTraits.includes(trait)) {
      this.profile.enemyTraits.push(trait);
      const found = ENEMY_TRAITS[trait];
      this._event('trait-discovered', `${found.name} skeletons discovered! ${found.weak} deals double damage; ${found.resist} deals half. Added to your field guide.`, { trait });
    }
    return enemy;
  }

  _effect(type, source, target = source, color = '#ffffff', ttl = 0.22) {
    this.effects.push({ id: ++this._id, type, x: source.x, z: source.z, tx: target.x, tz: target.z, ttl, maxTtl: ttl, color });
    if (this.effects.length > 180) this.effects.splice(0, this.effects.length - 180);
  }

  _launch(tower, target, stats) {
    if (tower.type === 'strawberry') {
      this.projectiles.push({
        id: ++this._id, type: 'strawberry-mortar', unitType: tower.type, sourceId: tower.id,
        x: tower.x, z: tower.z, tx: target.x, tz: target.z,
        ttl: stats.flightDuration, maxTtl: stats.flightDuration, color: TOWERS.strawberry.color,
        damage: stats.damage, radius: stats.explosionRadius, seedCount: stats.seedCount,
        seedDamage: stats.seedDamage, seedPierce: stats.seedPierce, seedRange: stats.seedRange,
      });
      return;
    }
    const duration = clamp(distance(tower, target) / 14, 0.16, 1.8);
    this.projectiles.push({
      id: ++this._id, type: tower.type === 'stun' ? 'stun' : 'shot',
      unitType: tower.type, damageKind: damageKindForTower(tower.type), sourceId: tower.id, targetId: target.id,
      x: tower.x, z: tower.z, tx: target.x, tz: target.z,
      ttl: duration, maxTtl: duration, color: TOWERS[tower.type].color,
      damage: stats.damage, slowDuration: stats.slowDuration, slowMultiplier: stats.slowMultiplier, summonOnKill: tower.type === 'necro',
    });
  }

  _advanceProjectiles(dt) {
    const flying = this.projectiles;
    this.projectiles = [];
    let chargedPending = flying.filter(shot => shot.gravityCharged).length;
    for (const shot of flying) {
      if (shot.type === 'prism-shard') {
        this._advancePrismShard(shot, dt);
        continue;
      }
      if (shot.type === 'strawberry-mortar') {
        shot.ttl -= dt;
        if (shot.ttl > 0) this.projectiles.push(shot);
        else this._burstStrawberry(shot, chargedPending);
        continue;
      }
      if (shot.type === 'strawberry-seed') {
        if (shot.gravityCharged) chargedPending--;
        this._advanceSeed(shot, dt);
        continue;
      }
      const target = this.enemies.find(e => e.id === shot.targetId && e.hp > 0);
      if (!target) continue;
      shot.tx = target.x;
      shot.tz = target.z;
      shot.ttl -= dt;
      if (shot.ttl > 0) {
        this.projectiles.push(shot);
        continue;
      }
      if (shot.unitType === 'boom') this._igniteSpores(target, shot.sourceId);
      this._damage(target, shot.damage, shot.sourceId, { summon: shot.summonOnKill === true, damageKind: shot.damageKind || damageKindForTower(shot.unitType) });
      if (target.hp > 0 && shot.slowDuration > 0) {
        target.slowRemaining = Math.max(target.slowRemaining, shot.slowDuration);
        target.slowMultiplier = shot.slowMultiplier;
      }
      this._effect('impact', target, target, shot.color, 0.12);
    }
  }

  _markCombo(kind, ...towerIds) {
    for (const id of new Set(towerIds)) {
      const tower = this.towers.find(unit => unit.id === id);
      if (tower) tower.comboActive = { kind, startedAt: this.time, until: this.time + 3 };
    }
  }

  _announceCombo(id, message) {
    if (this.comboDiscoveries.includes(id)) return;
    this.comboDiscoveries.push(id);
    this._event('combo', message, { combo: id });
  }

  _igniteSpores(target, sourceId) {
    const tower = this.towers.find(t => t.id === sourceId);
    if (!tower || tower.type !== 'boom' || tower.levels[1] !== 3 || target.hp <= 0 ||
        !target.poison?.volatile || target.poison.remaining <= 0 || (target.sporefireReadyAt || 0) > this.time) return false;
    this._markCombo('sporefire', tower.id, target.poison.sourceId);
    this._announceCombo('sporefire', 'SPOREFIRE! A secret combination discovered!');
    this._effect('sporefire', target, target, '#b8ed58', .85);
    this.effects.at(-1).radius = SPOREFIRE.radius;
    // Every victim shares the same recovery across all Brambles. Only a direct
    // acorn can ignite spores; explosion kills never recursively ignite them.
    const victims = this.enemies.filter(enemy => enemy.hp > 0 && distance(target, enemy) <= SPOREFIRE.radius && (enemy.sporefireReadyAt || 0) <= this.time);
    for (const enemy of victims) enemy.sporefireReadyAt = this.time + SPOREFIRE.cooldown;
    for (const enemy of victims) {
      this._damage(enemy, SPOREFIRE.damage + enemy.maxHp * (enemy.boss ? SPOREFIRE.bossFraction : SPOREFIRE.healthFraction), tower.id, { damageKind: 'poison' });
    }
    return true;
  }

  prismPartner(tower) {
    if (tower.type !== 'multi' || tower.levels[0] !== 3) return null;
    return this.towers.filter(partner => partner.type === 'crystal' && partner.levels[1] === 3 && distance(tower, partner) <= PRISMSTORM.partnerRange)
      .sort((a, b) => distance(tower, a) - distance(tower, b) || a.id - b.id)[0] || null;
  }

  _launchPrismShard(tower, target, origin = tower, bounces = PRISMSTORM.bounces, hitIds = []) {
    if (this.projectiles.filter(shot => shot.type === 'prism-shard').length >= PRISMSTORM.projectileLimit) return false;
    const duration = clamp(distance(origin, target) / 22, .12, .45);
    this.projectiles.push({ id: ++this._id, type: 'prism-shard', unitType: 'multi', sourceId: tower.id,
      targetId: target.id, x: origin.x, z: origin.z, tx: target.x, tz: target.z,
      ttl: duration, maxTtl: duration, color: ['#7be9fa', '#efabff', '#ffe29b'][this._id % 3], bounces, hitIds: [...hitIds] });
    return true;
  }

  _advancePrismShard(shot, dt) {
    const tower = this.towers.find(t => t.id === shot.sourceId);
    if (!tower) return;
    const target = this.enemies.find(enemy => enemy.id === shot.targetId && enemy.hp > 0);
    if (target) {
      shot.tx = target.x; shot.tz = target.z; shot.ttl -= dt;
      if (shot.ttl > 0) { this.projectiles.push(shot); return; }
      this._damage(target, PRISMSTORM.damage + target.maxHp * (target.boss ? PRISMSTORM.bossFraction : PRISMSTORM.healthFraction), tower.id, { damageKind: 'magic' });
      this._effect('impact', target, target, shot.color, .12);
    }
    // A missed/dead target also consumes a hop, so retargeting has a finite cost.
    if (shot.bounces <= 0) return;
    const hitIds = [...shot.hitIds, shot.targetId];
    const origin = { x: shot.tx, z: shot.tz };
    const next = this.enemies.filter(enemy => enemy.hp > 0 && !hitIds.includes(enemy.id) && distance(origin, enemy) <= PRISMSTORM.ricochetRange)
      .sort((a, b) => distance(origin, a) - distance(origin, b) || a.id - b.id)[0];
    if (next) this._launchPrismShard(tower, next, origin, shot.bounces - 1, hitIds);
  }

  _burstStrawberry(shot, chargedPending = 0) {
    const impact = { x: shot.tx, z: shot.tz };
    const strawberry = this.towers.find(tower => tower.id === shot.sourceId && tower.type === 'strawberry');
    const budget = this.projectiles.filter(seed => seed.gravityCharged).length + chargedPending;
    const hole = strawberry?.levels[1] === 3 && budget + shot.seedCount <= BERRY_SINGULARITY.projectileLimit
      ? this.holes.filter(well => well.ttl > 0 && well.capture && (well.berryReadyAt || 0) <= this.time &&
        distance(impact, well) <= well.radius && this.towers.some(tower => tower.id === well.sourceId && tower.type === 'gravity' && tower.levels[0] === 3))
        .sort((a, b) => distance(impact, a) - distance(impact, b) || a.id - b.id)[0] : null;
    const center = hole ? { x: hole.x, z: hole.z } : impact;
    if (hole) {
      hole.berryReadyAt = this.time + BERRY_SINGULARITY.cooldown;
      this._markCombo('berry-singularity', strawberry.id, hole.sourceId);
      this._announceCombo('berry-singularity', 'BERRY SINGULARITY! A secret combination discovered!');
      this._effect('berry-singularity', center, center, '#c4afff', 1.1);
      this.effects.at(-1).radius = 4;
    }
    for (const enemy of this.enemies) {
      if (enemy.hp > 0 && distance(impact, enemy) <= shot.radius) this._damage(enemy, shot.damage, shot.sourceId, { damageKind: 'physical' });
    }
    for (let i = 0; i < shot.seedCount; i++) {
      const angle = i / shot.seedCount * Math.PI * 2;
      const range = hole ? BERRY_SINGULARITY.range : shot.seedRange;
      const duration = hole ? BERRY_SINGULARITY.orbitDuration + BERRY_SINGULARITY.flightDuration : .5;
      this.projectiles.push({
        id: ++this._id, type: 'strawberry-seed', unitType: 'strawberry', sourceId: shot.sourceId,
        x: center.x, z: center.z, tx: center.x + Math.cos(angle) * range, tz: center.z + Math.sin(angle) * range,
        ttl: duration, maxTtl: duration, color: '#111111', damage: shot.seedDamage + (hole ? BERRY_SINGULARITY.damage : 0),
        pierce: hole ? BERRY_SINGULARITY.pierce : shot.seedPierce, hitIds: [],
        ...(hole ? { gravityCharged: true, orbitDuration: BERRY_SINGULARITY.orbitDuration, orbitRemaining: BERRY_SINGULARITY.orbitDuration,
          flightDuration: BERRY_SINGULARITY.flightDuration, orbitRadius: BERRY_SINGULARITY.orbitRadius, orbitTurns: 1, angle, ox: center.x, oz: center.z } : {}),
      });
    }
  }

  _advanceSeed(shot, dt) {
    if (shot.gravityCharged && shot.orbitRemaining > 0) {
      const orbitStep = Math.min(dt, shot.orbitRemaining);
      shot.orbitRemaining -= orbitStep;
      shot.ttl -= orbitStep;
      dt -= orbitStep;
      if (dt <= 1e-8) { this.projectiles.push(shot); return; }
    }
    const duration = shot.flightDuration || shot.maxTtl;
    const before = clamp(1 - shot.ttl / duration, 0, 1);
    shot.ttl -= dt;
    const after = clamp(1 - shot.ttl / duration, 0, 1);
    const dx = shot.tx - shot.x, dz = shot.tz - shot.z;
    const ax = shot.x + dx * before, az = shot.z + dz * before;
    const sx = dx * (after - before), sz = dz * (after - before);
    const lengthSquared = sx * sx + sz * sz;
    const contacts = this.enemies.filter(enemy => enemy.hp > 0 && !shot.hitIds.includes(enemy.id)).map(enemy => {
      const t = lengthSquared > 0 ? clamp(((enemy.x - ax) * sx + (enemy.z - az) * sz) / lengthSquared, 0, 1) : 0;
      return { enemy, t, separation: Math.hypot(enemy.x - ax - sx * t, enemy.z - az - sz * t) };
    }).filter(({ separation }) => separation <= 0.33).sort((a, b) => a.t - b.t);
    for (const { enemy } of contacts) {
      if (shot.hitIds.length >= shot.pierce) break;
      shot.hitIds.push(enemy.id);
      const bonus = shot.gravityCharged ? enemy.maxHp * (enemy.boss ? BERRY_SINGULARITY.bossFraction : BERRY_SINGULARITY.healthFraction) : 0;
      this._damage(enemy, shot.damage + bonus, shot.sourceId, { damageKind: shot.gravityCharged ? 'magic' : 'physical' });
      this._effect('impact', enemy, enemy, shot.color, 0.12);
    }
    if (shot.ttl > 0 && shot.hitIds.length < shot.pierce) this.projectiles.push(shot);
  }

  _unlock(type) {
    if (this.isUnlocked(type)) return;
    this.profile.unlocks.push(type);
    this._event('unlock', `${TOWERS[type].name} unlocked! Available in every garden.`, { tower: type, typeId: type });
  }

  _damage(enemy, amount, sourceId, { summon = false, damageKind } = {}) {
    if (enemy.hp <= 0 || amount <= 0) return;
    const tower = this.towers.find(t => t.id === sourceId);
    amount *= damageMultiplier(enemy.trait, damageKind || damageKindForTower(tower?.type));
    const owner = tower?.ownerId ?? this._sourceOwners[sourceId];
    const bossBoost = Array.isArray(this.bossDamageOwners)
      ? owner != null && this.bossDamageOwners.includes(owner)
      : this.profile.bossDamageUnlocked;
    if ((enemy.boss || enemy.isBoss) && bossBoost) amount *= 2;
    const dealt = Math.min(enemy.hp, amount);
    enemy.hp -= amount;
    if (tower) tower.damageDone += dealt;
    if (enemy.hp > 0) return;
    enemy.hp = 0;
    this.kills++;
    this.gold += ENEMIES[enemy.type].reward;
    this.points += enemy.boss ? 20 : 1;
    if (tower) tower.kills++;
    if (tower?.type === 'necro' && summon) {
      this.necroSpellKills++;
      const count = this.getStats(tower).summonCount;
      for (let i = 0; i < count; i++) tower.soulQueue.push({ routeIndex: enemy.routeIndex ?? 0 });
      this._effect('soul-reap', enemy, enemy, TOWERS.necro.color, 0.4);
      if (this.necroSpellKills === NECRO_PATH_SECRET.requiredKills && this.canDiscoverNecroPath()) this._event('path-secret-ready', 'Ten souls stir the Hollow lanterns. The cottage rhyme may have an echo…');
    }
    if (enemy.type === 'boss') this._unlock('stun');
    if (enemy.type === 'king') this._unlock('sniper');
    if (tower?.type === 'boom') {
      const stats = this.getStats(tower);
      this._effect('explosion', enemy, enemy, TOWERS.boom.color, 0.48);
      this.effects.at(-1).radius = stats.explosionRadius;
      for (const other of this.enemies) {
        if (other.hp > 0 && distance(enemy, other) <= stats.explosionRadius) this._damage(other, stats.explosionDamage, tower.id, { damageKind: 'physical' });
      }
    }
  }

  _plant(tower, stats) {
    if (this.traps.filter(t => t.sourceId === tower.id).length >= 16) return;
    const candidates = [];
    for (let routeIndex = 0; routeIndex < this.routes.length; routeIndex++) {
      for (let p = 0.4; p < this.routeLength(routeIndex); p += 0.8) {
        const point = this.pointAt(p, routeIndex);
        if (distance(tower, point) <= stats.range) candidates.push({ ...point, progress: p, routeIndex });
      }
    }
    if (!candidates.length) return;
    const approaching = this.enemies.filter(e => e.hp > 0 && candidates.some(p => p.routeIndex === (e.routeIndex ?? 0) && p.progress >= e.progress && p.progress - e.progress < 8)).sort((a, b) => this.remainingDistance(a) - this.remainingDistance(b))[0];
    const ahead = approaching && candidates.filter(p => p.routeIndex === (approaching.routeIndex ?? 0) && p.progress >= approaching.progress + 0.5);
    const available = ahead?.length ? ahead : candidates;
    const point = available[(tower.planted++) % Math.min(available.length, 5)];
    this.traps.push({ id: ++this._id, ...point, sourceId: tower.id, ttl: 28, charges: stats.charges, poisonDps: stats.poisonDps, poisonDuration: stats.poisonDuration, radius: stats.trapRadius, spreadRadius: stats.poisonSpreadRadius, spreadInterval: stats.poisonSpreadInterval, spreadTargets: stats.poisonSpreadTargets, spreadMultiplier: stats.poisonSpreadMultiplier, volatile: !!stats.volatileSpores });
  }

  _spreadPoison(enemy, dt) {
    const poison = enemy.poison;
    if (enemy.hp <= 0 || !poison || poison.remaining <= 0 || !(poison.spreadTargetsLeft > 0)) return;
    poison.spreadCooldown -= dt;
    if (poison.spreadCooldown > 1e-8) return;
    poison.spreadCooldown += poison.spreadInterval;
    const target = this.enemies.filter(other => other.id !== enemy.id && other.hp > 0 && !other.poison && distance(enemy, other) <= poison.spreadRadius).sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id - b.id)[0];
    if (!target) return;
    target.poison = { dps: poison.dps * poison.spreadMultiplier, remaining: poison.remaining, sourceId: poison.sourceId, spreadTargetsLeft: 0, secondary: true, volatile: !!poison.volatile };
    poison.spreadTargetsLeft--;
    this._effect('poison-spread', enemy, target, '#a6e675', 0.3);
    this.effects.at(-1).targetId = target.id;
  }

  _openHole(tower, stats, target) {
    if (!target || target.progress < 0.35 || this.holes.some(h => h.sourceId === tower.id && h.ttl > 0)) return false;
    const progress = Math.max(0, target.progress - 1.2);
    const routeIndex = target.routeIndex ?? 0;
    const point = this.pointAt(progress, routeIndex);
    if (distance(tower, point) > stats.range) return false;
    this.holes.push({ id: ++this._id, sourceId: tower.id, ...point, progress, routeIndex, ttl: stats.holeDuration, maxTtl: stats.holeDuration, radius: stats.holeRadius, dps: stats.gravityDps, pullSpeed: stats.pullSpeed, capture: stats.capture, released: [] });
    return true;
  }

  _gravityMovement(enemy, forward, dt) {
    enemy.capturedBy = null;
    const candidates = [];
    for (const hole of this.holes) {
      if (hole.ttl <= 0 || hole.released?.includes(enemy.id)) continue;
      const progress = this._anchorProgresses(hole, enemy.routeIndex ?? 0).filter(p => enemy.progress >= p - 1e-8 && enemy.progress - p <= hole.radius).at(-1);
      if (progress !== undefined) candidates.push({ hole, progress });
    }
    candidates.sort((a, b) => b.hole.dps - a.hole.dps || b.hole.pullSpeed - a.hole.pullSpeed || a.hole.id - b.hole.id);
    if (!candidates.length) return enemy.progress + forward;
    const { hole, progress: anchorProgress } = candidates[0];
    const activeTime = Math.min(dt, hole.ttl);
    this._damage(enemy, hole.dps * activeTime, hole.sourceId, { damageKind: 'magic' });
    if (enemy.hp <= 0) return enemy.progress;
    const resistance = enemy.boss ? 0.35 : 1;
    const pull = hole.pullSpeed * resistance * activeTime;
    let progress = Math.max(anchorProgress, enemy.progress + forward - pull);
    if (progress <= anchorProgress + 1e-8) {
      if (hole.capture) {
        // A captured skeleton stays at the center only while the well remains alive.
        progress = anchorProgress + forward * (1 - activeTime / dt);
        if (hole.ttl > dt + 1e-8) enemy.capturedBy = hole.id;
      } else {
        // Lesser wells tug each visitor through once; they cannot hold it forever.
        hole.released ??= [];
        hole.released.push(enemy.id);
      }
    }
    return Math.max(0, progress);
  }

  _raiseBarrier(tower, stats, target) {
    if (!target || this.barriers.filter(b => b.sourceId === tower.id && b.hp > 0 && b.ttl > 0).length >= stats.barrierLimit) return false;
    const progress = target.progress + 0.9;
    const routeIndex = target.routeIndex ?? 0;
    if (progress >= this.routeLength(routeIndex) - 0.35) return false;
    const point = this.pointAt(progress, routeIndex);
    if (distance(tower, point) > stats.range || this.enemies.some(e => e.hp > 0 && distance(e, point) < 0.65) || this.barriers.some(b => b.hp > 0 && distance(b, point) < 1.2)) return false;
    this.barriers.push({ id: ++this._id, sourceId: tower.id, ...point, progress, routeIndex, hp: stats.barrierHp, maxHp: stats.barrierHp, ttl: stats.barrierLifetime, explosionDamage: stats.explosionDamage, explosionRadius: stats.explosionRadius });
    return true;
  }

  _destroyBarrier(barrier) {
    if (barrier.destroyed) return;
    barrier.destroyed = true;
    barrier.hp = 0;
    if (barrier.explosionDamage <= 0) return;
    this._effect('explosion', barrier, barrier, TOWERS.crystal.color, 0.48);
    this.effects.at(-1).radius = barrier.explosionRadius;
    for (const enemy of this.enemies) {
      if (enemy.hp > 0 && distance(enemy, barrier) <= barrier.explosionRadius) this._damage(enemy, barrier.explosionDamage, barrier.sourceId, { damageKind: 'magic' });
    }
  }

  _clearReborn() {
    for (const ally of this.allies) this._effect('reborn-fade', ally, ally, TOWERS.necro.color, 0.25);
    this.allies = [];
    for (const tower of this.towers) { tower.soulQueue = []; tower.summonCooldown = 0; }
    for (const enemy of this.enemies) enemy.allyTargetId = null;
  }

  _spawnReborn(tower, routeIndex) {
    const stats = this.getStats(tower);
    const house = cottagePosition(this.map, routeIndex);
    const door = cottageDoorPosition(this.map, routeIndex);
    const end = this.pointAt(this.routeLength(routeIndex), routeIndex);
    const side = house.x + (end.x >= house.x ? 1.05 : -1.05);
    const ally = {
      id: ++this._id, sourceId: tower.id, routeIndex, ...door,
      progress: this.routeLength(routeIndex), hp: stats.allyHp, maxHp: stats.allyHp,
      damage: stats.allyDamage, interval: stats.allyInterval, cooldown: 0,
      speed: stats.allySpeed, ttl: stats.allyLifetime, maxTtl: stats.allyLifetime,
      phase: 'joining', targetId: null, spawnedAt: this.time,
      joining: [{ x: side, z: door.z }, { x: side, z: end.z }, end], waypointIndex: 0,
    };
    this.allies.push(ally);
    this._effect('reborn-spawn', ally, ally, TOWERS.necro.color, 0.4);
    return ally;
  }

  _dispatchReborn(dt) {
    for (const tower of this.towers) {
      if (tower.type !== 'necro') continue;
      tower.summonCooldown = Math.max(0, tower.summonCooldown - dt);
      const stats = this.getStats(tower);
      if (tower.summonCooldown > 1e-8 || !tower.soulQueue.length || this.allies.filter(ally => ally.sourceId === tower.id && ally.hp > 0 && ally.ttl > 0).length >= stats.allyLimit) continue;
      const soul = tower.soulQueue.shift();
      this._spawnReborn(tower, soul.routeIndex);
      tower.summonCooldown = stats.summonInterval;
    }
  }

  _actorProgresses(actor, routeIndex) {
    // A moving actor on the same loop must stay on its actual lap, not another
    // occurrence of the same junction. Other routes interact only on shared road.
    if ((actor.routeIndex ?? 0) === routeIndex) return [actor.progress];
    return this._anchorMap(actor)[routeIndex] || [];
  }

  _moveReborn(dt) {
    for (const ally of this.allies) {
      if (ally.hp <= 0 || ally.ttl <= 0 || ally.spawnedAt === this.time) continue;
      ally.ttl -= dt;
      ally.cooldown = Math.max(0, ally.cooldown - dt);
      ally.targetId = null;
      if (ally.ttl <= 0) continue;
      let travel = ally.speed * dt;
      if (ally.phase === 'joining') {
        while (travel > 1e-8 && ally.waypointIndex < ally.joining.length) {
          const waypoint = ally.joining[ally.waypointIndex];
          const length = distance(ally, waypoint);
          if (length <= travel + 1e-8) {
            ally.x = waypoint.x; ally.z = waypoint.z;
            travel = Math.max(0, travel - length);
            ally.waypointIndex++;
          } else {
            ally.x += (waypoint.x - ally.x) * travel / length;
            ally.z += (waypoint.z - ally.z) * travel / length;
            travel = 0;
          }
        }
        if (ally.waypointIndex < ally.joining.length) continue;
        ally.phase = 'marching';
      }
      const old = ally.progress;
      let next = Math.max(0, old - travel);
      const encounters = [];
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        for (const progress of this._actorProgresses(enemy, ally.routeIndex)) {
          if (progress <= old + 0.65 && progress + 0.65 >= next) encounters.push({ enemy, progress });
        }
      }
      encounters.sort((a, b) => Math.abs(a.progress - old) - Math.abs(b.progress - old) || a.enemy.id - b.enemy.id);
      if (encounters.length) next = Math.max(next, Math.min(old, encounters[0].progress + 0.65));
      ally.progress = next;
      ally.phase = 'marching';
      Object.assign(ally, this.pointAt(ally.progress, ally.routeIndex));
    }
  }

  _fightReborn() {
    for (const ally of this.allies) {
      if (ally.hp <= 0 || ally.ttl <= 0 || ally.phase === 'joining' || ally.progress <= 0) continue;
      const targets = this.enemies.filter(enemy => enemy.hp > 0 && this._actorProgresses(enemy, ally.routeIndex).some(progress => Math.abs(progress - ally.progress) <= 0.650001)).sort((a, b) => distance(ally, a) - distance(ally, b) || a.id - b.id);
      const target = targets[0];
      ally.targetId = target?.id ?? null;
      ally.phase = target ? 'fighting' : 'marching';
      if (!target || ally.cooldown > 1e-8) continue;
      ally.cooldown = ally.interval;
      this._damage(target, ally.damage, ally.sourceId, { summon: false, damageKind: 'physical' });
      this._effect('reborn-hit', target, target, TOWERS.necro.color, 0.18);
    }
  }

  _moveAgainstBarriers(enemy, nextProgress, dt) {
    const oldProgress = enemy.progress;
    const forward = nextProgress >= oldProgress;
    const contacts = [];
    enemy.allyTargetId = null;
    if (forward) {
      for (const barrier of this.barriers) {
        if (barrier.hp <= 0 || barrier.ttl <= 0) continue;
        for (const p of this._anchorProgresses(barrier, enemy.routeIndex ?? 0)) {
          const contact = p - 0.35;
          if (contact >= oldProgress - 1e-8 && contact <= nextProgress + 1e-8) contacts.push({ barrier, contact });
        }
      }
    }
    for (const ally of this.allies) {
      if (ally.hp <= 0 || ally.ttl <= 0 || ally.phase === 'joining' || ally.progress <= 0) continue;
      for (const p of this._actorProgresses(ally, enemy.routeIndex ?? 0)) {
        if (Math.abs(p - oldProgress) <= 0.650001 && (forward ? p >= oldProgress - 1e-8 : p <= oldProgress + 1e-8)) { contacts.push({ ally, contact: oldProgress }); continue; }
        const contact = p + (forward ? -0.65 : 0.65);
        if (forward ? contact >= oldProgress - 1e-8 && contact <= nextProgress + 1e-8 : contact <= oldProgress + 1e-8 && contact >= nextProgress - 1e-8) contacts.push({ ally, contact });
      }
    }
    contacts.sort((a, b) => (forward ? a.contact - b.contact : b.contact - a.contact) || Number(!!b.ally) - Number(!!a.ally));
    if (!contacts.length) { enemy.progress = nextProgress; return; }
    const { barrier, ally, contact } = contacts[0];
    enemy.progress = forward ? Math.max(oldProgress, contact) : Math.min(oldProgress, contact);
    Object.assign(enemy, this.pointAt(enemy.progress, enemy.routeIndex));
    const travel = Math.abs(nextProgress - oldProgress);
    const contactTime = travel > 1e-8 ? dt * clamp(Math.abs(nextProgress - contact) / travel, 0, 1) : dt;
    if (ally) {
      enemy.allyTargetId = ally.id;
      ally.hp = Math.max(0, ally.hp - (enemy.attackDamage ?? ENEMIES[enemy.type].attackDamage) * contactTime);
    } else {
      barrier.hp -= (enemy.attackDamage ?? ENEMIES[enemy.type].attackDamage) * Math.min(contactTime, barrier.ttl);
      if (barrier.hp <= 0) this._destroyBarrier(barrier);
    }
  }

  _step(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.ttl -= dt;
    this.effects = this.effects.filter(e => e.ttl > 0);
    this._trySummon();
    if (this.status !== 'wave') { this._clearReborn(); this.projectiles = []; this.holes = []; this.barriers = []; for (const enemy of this.enemies) enemy.capturedBy = null; return; }
    this._spawnTimer -= dt;
    if (this._queue.length && this._spawnTimer <= 0) {
      this._spawn(this._queue.shift());
      this._spawnTimer += Math.max(this.endless ? 0.18 : 0.32, 0.85 - this.wave * 0.018);
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.poison) {
        const tick = Math.min(dt, enemy.poison.remaining);
        this._damage(enemy, enemy.poison.dps * tick, enemy.poison.sourceId, { damageKind: 'poison' });
        enemy.poison.remaining -= dt;
        if (enemy.poison.remaining <= 0) enemy.poison = null;
      }
    }
    for (const enemy of this.enemies) this._spreadPoison(enemy, dt);
    this._advanceProjectiles(dt);
    this._dispatchReborn(dt);
    this._moveReborn(dt);
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      tower.prismCooldown = Math.max(0, (tower.prismCooldown || 0) - dt);
      if (tower.cooldown > 0) continue;
      const stats = this.getStats(tower);
      if (tower.type === 'spore') {
        this._plant(tower, stats);
        tower.cooldown = stats.interval;
        continue;
      }
      if (tower.type === 'gravity' || tower.type === 'crystal') {
        const candidates = this.enemies.filter(e => e.hp > 0 && distance(tower, e) <= stats.range).sort((a, b) => this.remainingDistance(a) - this.remainingDistance(b));
        const planted = tower.type === 'gravity' ? this._openHole(tower, stats, candidates[0]) : this._raiseBarrier(tower, stats, candidates[0]);
        if (planted) tower.cooldown = stats.interval;
        continue;
      }
      const targets = this.enemies.filter(e => e.hp > 0 && distance(tower, e) <= stats.range).sort((a, b) => this._targetPriority(tower, a, b)).slice(0, stats.shots);
      if (!targets.length) continue;
      tower.cooldown = stats.interval;
      const prism = tower.prismCooldown <= 0 && this.projectiles.filter(shot => shot.type === 'prism-shard').length < PRISMSTORM.projectileLimit ? this.prismPartner(tower) : null;
      if (prism) {
        tower.prismCooldown = PRISMSTORM.cooldown;
        this._markCombo('prismstorm', tower.id, prism.id);
        this._announceCombo('prismstorm', 'PRISMSTORM! A secret combination discovered!');
        this._effect('prism-burst', prism, prism, '#a4edff', .75);
        this.effects.at(-1).radius = 2;
      }
      for (const target of targets) {
        if (target.hp <= 0) continue;
        if (prism && this._launchPrismShard(tower, target)) continue;
        this._launch(tower, target, stats);
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const slowedTime = Math.min(dt, enemy.slowRemaining);
      const forward = enemy.speed * (slowedTime * enemy.slowMultiplier + dt - slowedTime);
      enemy.slowRemaining = Math.max(0, enemy.slowRemaining - dt);
      if (enemy.slowRemaining === 0) enemy.slowMultiplier = 1;
      const nextProgress = this._gravityMovement(enemy, forward, dt);
      if (enemy.hp <= 0) continue;
      this._moveAgainstBarriers(enemy, nextProgress, dt);
      Object.assign(enemy, this.pointAt(enemy.progress, enemy.routeIndex));
      if (enemy.progress >= this.routeLength(enemy.routeIndex)) {
        this.lives = Math.max(0, this.lives - ENEMIES[enemy.type].leak);
        enemy.hp = 0;
        this._event('leak', `${ENEMIES[enemy.type].name} reached the gate.`, { amount: ENEMIES[enemy.type].leak });
      }
    }
    this._fightReborn();
    this.allies = this.allies.filter(ally => {
      const alive = ally.hp > 0 && ally.ttl > 0 && (ally.phase === 'joining' || ally.progress > 0);
      if (!alive) this._effect('reborn-fade', ally, ally, TOWERS.necro.color, 0.25);
      return alive;
    });
    for (const enemy of this.enemies) if (enemy.allyTargetId != null && !this.allies.some(ally => ally.id === enemy.allyTargetId)) enemy.allyTargetId = null;
    for (const hole of this.holes) hole.ttl -= dt;
    this.holes = this.holes.filter(hole => hole.ttl > 1e-8);
    for (const enemy of this.enemies) if (enemy.capturedBy != null && !this.holes.some(h => h.id === enemy.capturedBy)) enemy.capturedBy = null;
    for (const barrier of this.barriers) barrier.ttl -= dt;
    this.barriers = this.barriers.filter(barrier => barrier.hp > 0 && barrier.ttl > 1e-8);
    for (const trap of this.traps) {
      trap.ttl -= dt;
      if (trap.ttl <= 0) continue;
      trap.regrow = Math.max(0, (trap.regrow || 0) - dt);
      if (trap.regrow > 0) continue;
      const touched = this.enemies.filter(e => e.hp > 0 && distance(trap, e) <= trap.radius);
      if (!touched.length) continue;
      for (const enemy of touched) {
        if (!enemy.poison || trap.poisonDps >= enemy.poison.dps) enemy.poison = { dps: trap.poisonDps, remaining: trap.poisonDuration, sourceId: trap.sourceId, spreadRadius: trap.spreadRadius || 0, spreadInterval: trap.spreadInterval || 1, spreadCooldown: trap.spreadInterval || 1, spreadTargetsLeft: trap.spreadTargets || 0, spreadMultiplier: trap.spreadMultiplier || 0.65, volatile: !!trap.volatile };
        else enemy.poison.remaining = Math.max(enemy.poison.remaining, trap.poisonDuration);
      }
      this._effect('poison', trap, trap, '#9fda62', 0.45);
      trap.charges--;
      // A multi-use mushroom needs a moment to regrow before it can trigger again.
      if (trap.charges > 0) trap.regrow = 0.75;
    }
    this.traps = this.traps.filter(t => t.charges > 0 && t.ttl > 0);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (this.lives <= 0) {
      this.status = 'lost';
      this._clearReborn();
      this.projectiles = [];
      this.holes = [];
      this.barriers = [];
      for (const enemy of this.enemies) enemy.capturedBy = null;
      this._event('defeat', `You survived ${this.completedWaves} rounds. Your best for this garden is ${this.bestRound}.`);
      return;
    }
    if (!this._queue.length && !this.enemies.length) {
      this._clearReborn();
      this.projectiles = [];
      this.holes = [];
      this.barriers = [];
      this.completedWaves = this.wave;
      this.profile.bestRounds[this.map.id] = Math.max(this.bestRound, this.completedWaves);
      this.gold += 65 + this.wave * 5;
      this.points += 6 + Math.floor(this.wave / 2);
      const roundCoins = this.profile.roundCoins < MAX_ROUND_COINS ? 1 : 0;
      this.profile.roundCoins += roundCoins;
      if (this.wave === 15) this._unlock('multi');
      this._event('wave-complete', `Wave ${this.wave} cleared! +${65 + this.wave * 5} gold, +${6 + Math.floor(this.wave / 2)} points, +${roundCoins} Round Coin.`, { wave: this.wave, roundCoins, totalRoundCoins: this.profile.roundCoins });
      this.status = !this.endless && this.wave === this.maxWaves ? 'won' : 'planning';
      if (this.status === 'won') {
        for (const tower of Object.values(TOWERS)) if (tower.unlockMap === this.map.id) this._unlock(tower.id);
      }
      if (this.status === 'won') this._event('victory', 'The garden is safe! Continue in endless mode or try another garden.');
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 2);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 0.05);
      this._step(step);
      remaining -= step;
    }
  }
}
