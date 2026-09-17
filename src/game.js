import { MAPS, TOWERS, ENEMIES } from './data.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function wavePlan(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > 20) return [];
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
    this.profile = profile && typeof profile === 'object' ? profile : {};
    if (!Array.isArray(this.profile.unlocks)) this.profile.unlocks = [];
    this.wave = 0;
    this.lives = 100;
    this.gold = 650;
    this.points = 0;
    this.towers = [];
    this.enemies = [];
    this.traps = [];
    this.effects = [];
    this.projectiles = [];
    this.events = [];
    this.status = 'planning';
    this.kills = 0;
    this.time = 0;
    this._id = 0;
    this._queue = [];
    this._spawnTimer = 0;
    this._segments = [];
    this.pathLength = 0;
    for (let i = 1; i < this.map.path.length; i++) {
      const [ax, az] = this.map.path[i - 1], [bx, bz] = this.map.path[i];
      const length = Math.hypot(bx - ax, bz - az);
      this._segments.push({ ax, az, bx, bz, length, start: this.pathLength });
      this.pathLength += length;
    }
  }

  _event(type, message, extra = {}) {
    this.events.push({ type, message, ...extra });
    if (this.events.length > 100) this.events.shift();
  }

  pointAt(progress) {
    const p = clamp(progress, 0, this.pathLength);
    const s = this._segments.find(segment => p <= segment.start + segment.length) || this._segments.at(-1);
    const t = clamp((p - s.start) / s.length, 0, 1);
    return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t };
  }

  pathDistance(x, z) {
    return Math.min(...this._segments.map(s => {
      const t = clamp(((x - s.ax) * (s.bx - s.ax) + (z - s.az) * (s.bz - s.az)) / s.length ** 2, 0, 1);
      return Math.hypot(x - s.ax - t * (s.bx - s.ax), z - s.az - t * (s.bz - s.az));
    }));
  }

  isUnlocked(type) {
    return !!TOWERS[type] && (!TOWERS[type].unlockWave || this.profile.unlocks.includes(type));
  }

  canPlace(type, x, z) {
    return Number.isFinite(x) && Number.isFinite(z) && this.isUnlocked(type) &&
      ['planning', 'wave'].includes(this.status) && this.gold >= TOWERS[type].cost &&
      Math.abs(x) <= 11.35 && Math.abs(z) <= 7 && this.pathDistance(x, z) >= 1.3 &&
      this.towers.every(t => Math.hypot(t.x - x, t.z - z) >= 1.4);
  }

  placeTower(type, x, z) {
    if (!this.canPlace(type, x, z)) return null;
    const tower = { id: ++this._id, type, x, z, levels: TOWERS[type].paths.map(() => 0), kills: 0, damageDone: 0, cooldown: 0, planted: 0, targeting: 'first' };
    this.towers.push(tower);
    this.gold -= TOWERS[type].cost;
    this._event('placed', `${TOWERS[type].name} joined the garden.`, { towerId: tower.id });
    return tower;
  }

  upgradeTower(id, pathIndex) {
    if (!['planning', 'wave'].includes(this.status)) return false;
    const tower = this.towers.find(t => t.id === id);
    if (!tower || !Number.isInteger(pathIndex) || !TOWERS[tower.type].paths[pathIndex]) return false;
    const level = tower.levels[pathIndex];
    if (level >= 3 || (level === 0 && tower.levels.filter(n => n > 0).length >= 2)) return false;
    const cost = TOWERS[tower.type].paths[pathIndex].costs[level];
    if (this.points < cost) return false;
    this.points -= cost;
    tower.levels[pathIndex]++;
    this._event('upgrade', `${TOWERS[tower.type].name}: ${TOWERS[tower.type].paths[pathIndex].name} ${level + 1}.`, { towerId: id });
    return true;
  }

  setTargeting(id, mode) {
    if (!['planning', 'wave'].includes(this.status) || !['first', 'last', 'strong', 'close'].includes(mode)) return false;
    const tower = this.towers.find(t => t.id === id);
    if (!tower || tower.type === 'spore') return false;
    tower.targeting = mode;
    return true;
  }

  _targetPriority(tower, a, b) {
    switch (tower.targeting) {
      case 'last': return a.progress - b.progress;
      case 'strong': return b.maxHp - a.maxHp || b.progress - a.progress;
      case 'close': return distance(tower, a) - distance(tower, b) || b.progress - a.progress;
      default: return b.progress - a.progress;
    }
  }

  sellTower(id) {
    if (!['planning', 'wave'].includes(this.status)) return false;
    const index = this.towers.findIndex(t => t.id === id);
    if (index < 0) return false;
    const [tower] = this.towers.splice(index, 1);
    this.gold += Math.floor(TOWERS[tower.type].cost * 0.75);
    this.traps = this.traps.filter(trap => trap.sourceId !== id);
    this._event('sold', `${TOWERS[tower.type].name} returned home. Upgrade points stay spent.`);
    return true;
  }

  getStats(tower) {
    const [a = 0, b = 0, c = 0, d = 0] = tower.levels;
    let stats;
    switch (tower.type) {
      case 'sprout': stats = { damage: [5, 11, 22, 42][a] + d * (3 + Math.min(35, tower.kills || 0) * 0.7), interval: 0.95 * 0.73 ** b, range: 3.4 + c * 1.0 }; break;
      case 'spore': stats = { damage: 0, interval: 2.5 * 0.68 ** c, range: 3.9 + d * 1.1, poisonDps: [6, 11, 19, 32][a], poisonDuration: 4 + b * 2, charges: 1 + b, trapRadius: 0.62 + d * 0.32 }; break;
      case 'boom': stats = { damage: [13, 24, 42, 70][a], interval: 1.4 * 0.73 ** c, range: 3.7 + d * 1.0, explosionDamage: [18, 30, 48, 75][b], explosionRadius: 1.5 + b * 0.5 }; break;
      case 'stun': stats = { damage: [3, 10, 22, 40][c], interval: 1.7 * 0.73 ** b, range: 3.8 + d * 1.0, stunDuration: 2 + a * 0.8 }; break;
      case 'multi': stats = { damage: [8, 15, 26, 42][a], interval: 1.3 * 0.72 ** a, range: 4, shots: 3 + a }; break;
      case 'sniper': stats = { damage: [5, 25, 65, 130][a], interval: 1.25 * 0.48 ** b, range: 100 }; break;
      default: stats = { damage: 0, interval: 1, range: 0 };
    }
    return { shots: 1, poisonDps: 0, poisonDuration: 0, stunDuration: 0, explosionDamage: 0, explosionRadius: 0, ...stats, attackSpeed: 1 / stats.interval };
  }

  nextWaveInfo() {
    const wave = Math.min(20, this.wave + 1);
    const plan = wavePlan(wave);
    const counts = {};
    for (const type of plan) counts[type] = (counts[type] || 0) + 1;
    const boss = wave === 10 || wave === 20;
    const description = `${plan.length} skeletons incoming${boss ? `, including ${ENEMIES[wave === 10 ? 'boss' : 'king'].name}` : ''}. Prepare your garden!`;
    return { wave, count: plan.length, boss, types: [...new Set(plan)], counts, description };
  }

  startWave() {
    if (this.status !== 'planning' || this.wave >= 20) return false;
    this.wave++;
    this.status = 'wave';
    this._queue = wavePlan(this.wave);
    this._spawnTimer = 0;
    this._event('wave-start', `Wave ${this.wave}${this.wave % 10 === 0 ? ' · Boss incoming!' : ' has begun.'}`, { wave: this.wave });
    return true;
  }

  _spawn(type) {
    const spec = ENEMIES[type];
    const hp = spec.hp * (spec.boss ? 1 : 1 + Math.max(0, this.wave - 5) * 0.075);
    const enemy = { id: ++this._id, type, ...this.pointAt(0), hp, maxHp: hp, progress: 0, stun: 0, poison: null, speed: spec.speed, boss: !!spec.boss, isBoss: !!spec.boss, color: spec.color };
    this.enemies.push(enemy);
    return enemy;
  }

  _effect(type, source, target = source, color = '#ffffff', ttl = 0.22) {
    this.effects.push({ id: ++this._id, type, x: source.x, z: source.z, tx: target.x, tz: target.z, ttl, maxTtl: ttl, color });
    if (this.effects.length > 180) this.effects.splice(0, this.effects.length - 180);
  }

  _launch(tower, target, stats) {
    const duration = clamp(distance(tower, target) / 14, 0.16, 1.8);
    this.projectiles.push({
      id: ++this._id, type: tower.type === 'stun' ? 'stun' : 'shot',
      unitType: tower.type, sourceId: tower.id, targetId: target.id,
      x: tower.x, z: tower.z, tx: target.x, tz: target.z,
      ttl: duration, maxTtl: duration, color: TOWERS[tower.type].color,
      damage: stats.damage, stunDuration: stats.stunDuration,
    });
  }

  _advanceProjectiles(dt) {
    const flying = this.projectiles;
    this.projectiles = [];
    for (const shot of flying) {
      const target = this.enemies.find(e => e.id === shot.targetId && e.hp > 0);
      if (!target) continue;
      shot.tx = target.x;
      shot.tz = target.z;
      shot.ttl -= dt;
      if (shot.ttl > 0) {
        this.projectiles.push(shot);
        continue;
      }
      this._damage(target, shot.damage, shot.sourceId);
      if (target.hp > 0 && shot.stunDuration) target.stun = Math.max(target.stun, shot.stunDuration);
      this._effect('impact', target, target, shot.color, 0.12);
    }
  }

  _unlock(type) {
    if (this.isUnlocked(type)) return;
    this.profile.unlocks.push(type);
    this._event('unlock', `${TOWERS[type].name} unlocked! Available in every garden.`, { tower: type, typeId: type });
  }

  _damage(enemy, amount, sourceId) {
    if (enemy.hp <= 0 || amount <= 0) return;
    const tower = this.towers.find(t => t.id === sourceId);
    const dealt = Math.min(enemy.hp, amount);
    enemy.hp -= amount;
    if (tower) tower.damageDone += dealt;
    if (enemy.hp > 0) return;
    enemy.hp = 0;
    this.kills++;
    this.gold += ENEMIES[enemy.type].reward;
    this.points += enemy.boss ? 20 : 1;
    if (tower) tower.kills++;
    if (enemy.type === 'boss') this._unlock('stun');
    if (enemy.type === 'king') this._unlock('sniper');
    if (tower?.type === 'boom') {
      const stats = this.getStats(tower);
      this._effect('explosion', enemy, enemy, TOWERS.boom.color, 0.48);
      this.effects.at(-1).radius = stats.explosionRadius;
      for (const other of this.enemies) {
        if (other.hp > 0 && distance(enemy, other) <= stats.explosionRadius) this._damage(other, stats.explosionDamage, tower.id);
      }
    }
  }

  _plant(tower, stats) {
    if (this.traps.filter(t => t.sourceId === tower.id).length >= 16) return;
    const candidates = [];
    for (let p = 0.4; p < this.pathLength; p += 0.8) {
      const point = this.pointAt(p);
      if (distance(tower, point) <= stats.range) candidates.push({ ...point, progress: p });
    }
    if (!candidates.length) return;
    const approaching = this.enemies.filter(e => e.hp > 0 && candidates.some(p => p.progress >= e.progress && p.progress - e.progress < 8)).sort((a, b) => b.progress - a.progress)[0];
    const ahead = approaching && candidates.filter(p => p.progress >= approaching.progress + 0.5);
    const available = ahead?.length ? ahead : candidates;
    const point = available[(tower.planted++) % Math.min(available.length, 5)];
    this.traps.push({ id: ++this._id, ...point, sourceId: tower.id, ttl: 28, charges: stats.charges, poisonDps: stats.poisonDps, poisonDuration: stats.poisonDuration, radius: stats.trapRadius });
  }

  _step(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.ttl -= dt;
    this.effects = this.effects.filter(e => e.ttl > 0);
    if (this.status !== 'wave') { this.projectiles = []; return; }
    this._spawnTimer -= dt;
    if (this._queue.length && this._spawnTimer <= 0) {
      this._spawn(this._queue.shift());
      this._spawnTimer += Math.max(0.32, 0.85 - this.wave * 0.018);
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.poison) {
        const tick = Math.min(dt, enemy.poison.remaining);
        this._damage(enemy, enemy.poison.dps * tick, enemy.poison.sourceId);
        enemy.poison.remaining -= dt;
        if (enemy.poison.remaining <= 0) enemy.poison = null;
      }
    }
    this._advanceProjectiles(dt);
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      const stats = this.getStats(tower);
      if (tower.type === 'spore') {
        this._plant(tower, stats);
        tower.cooldown = stats.interval;
        continue;
      }
      const targets = this.enemies.filter(e => e.hp > 0 && distance(tower, e) <= stats.range).sort((a, b) => this._targetPriority(tower, a, b)).slice(0, stats.shots);
      if (!targets.length) continue;
      tower.cooldown = stats.interval;
      for (const target of targets) {
        if (target.hp <= 0) continue;
        this._launch(tower, target, stats);
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.stun <= 0) enemy.progress += enemy.speed * dt;
      Object.assign(enemy, this.pointAt(enemy.progress));
      if (enemy.progress >= this.pathLength) {
        this.lives = Math.max(0, this.lives - ENEMIES[enemy.type].leak);
        enemy.hp = 0;
        this._event('leak', `${ENEMIES[enemy.type].name} reached the gate.`, { amount: ENEMIES[enemy.type].leak });
      }
    }
    for (const trap of this.traps) {
      trap.ttl -= dt;
      if (trap.ttl <= 0) continue;
      trap.regrow = Math.max(0, (trap.regrow || 0) - dt);
      if (trap.regrow > 0) continue;
      const touched = this.enemies.filter(e => e.hp > 0 && distance(trap, e) <= trap.radius);
      if (!touched.length) continue;
      for (const enemy of touched) {
        if (!enemy.poison || trap.poisonDps >= enemy.poison.dps) enemy.poison = { dps: trap.poisonDps, remaining: trap.poisonDuration, sourceId: trap.sourceId };
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
      this.projectiles = [];
      this._event('defeat', 'The garden needs another try. Your character unlocks are saved.');
      return;
    }
    if (!this._queue.length && !this.enemies.length) {
      this.projectiles = [];
      this.gold += 65 + this.wave * 5;
      this.points += 6 + Math.floor(this.wave / 2);
      if (this.wave === 15) this._unlock('multi');
      this._event('wave-complete', `Wave ${this.wave} cleared! +${65 + this.wave * 5} gold, +${6 + Math.floor(this.wave / 2)} points.`, { wave: this.wave });
      this.status = this.wave === 20 ? 'won' : 'planning';
      if (this.status === 'won') this._event('victory', 'The garden is safe! Try another map with your new friends.');
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
