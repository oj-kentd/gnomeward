// Presentation only: retain server samples and draw between them instead of
// repeatedly easing to the newest 5 Hz position. No simulation is advanced here.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const copyList = list => (list || []).map(record => ({ ...record }));

export class CoopMotionBuffer {
  constructor({ delay = .22, maxSamples = 12 } = {}) {
    this.delay = Number.isFinite(delay) ? clamp(delay, .05, 1) : .22;
    this.maxSamples = Number.isFinite(maxSamples) ? Math.max(2, Math.floor(maxSamples)) : 12;
    this.reset();
  }

  reset() {
    this.frames = [];
    this.offsets = [];
    this.sequence = null;
    this.roomKey = null;
    this.frozen = false;
    this.started = null;
    this.presentationTime = -Infinity;
  }

  capture(game, multiplayer) {
    if (!multiplayer || !Number.isFinite(multiplayer.snapshotTick) || !Number.isFinite(multiplayer.snapshotReceivedAt)) return false;
    const roomKey = `${multiplayer.roomId || 'coop'}:${game.map?.id || ''}`;
    const frozen = !!(multiplayer.paused || multiplayer.reconnecting || multiplayer.connected === false || multiplayer.result);
    const serverTime = multiplayer.snapshotTick * .05;
    const started = multiplayer.started !== false;
    const controlsChanged = this.roomKey !== roomKey || frozen !== this.frozen || started !== this.started;
    if (controlsChanged || serverTime < (this.frames.at(-1)?.serverTime ?? -Infinity)) this.reset();
    this.roomKey = roomKey;
    this.frozen = frozen;
    this.started = started;
    const sequence = multiplayer.snapshotSequence ?? multiplayer.snapshotReceivedAt;
    if (!controlsChanged && this.sequence === sequence) return false;
    this.sequence = sequence;
    const frame = {
      serverTime,
      receivedAt: multiplayer.snapshotReceivedAt,
      time: Number(game.time) || 0,
      enemies: copyList(game.enemies),
      allies: copyList(game.allies),
      projectiles: copyList(game.projectiles),
      effects: copyList(game.effects),
      holes: copyList(game.holes),
      barriers: copyList(game.barriers),
    };
    frame.enemyById = new Map(frame.enemies.map(actor => [actor.id, actor]));
    frame.allyById = new Map(frame.allies.map(actor => [actor.id, actor]));
    if (this.frames.at(-1)?.serverTime === serverTime) {
      // Upgrades and readiness messages can repeat a simulation tick.
      this.frames[this.frames.length - 1] = frame;
    } else {
      this.frames.push(frame);
      this.offsets.push(frame.receivedAt - serverTime);
      if (this.offsets.length > this.maxSamples) this.offsets.shift();
      if (this.frames.length > this.maxSamples) this.frames.shift();
    }
    return true;
  }

  sample(now, pointAt) {
    if (!this.frames.length) return null;
    const newest = this.frames.at(-1);
    let before = newest, after = newest, amount = 0;
    if (!this.frozen) {
      // Keep one clock across arrivals. Anchoring to every packet would reproduce
      // network jitter as changes in movement speed. A short buffer absorbs it.
      const offset = Math.min(...this.offsets);
      const target = now - offset - this.delay;
      this.presentationTime = clamp(Math.max(this.presentationTime, target), this.frames[0].serverTime, newest.serverTime);
      let index = 0;
      while (index + 1 < this.frames.length && this.frames[index + 1].serverTime <= this.presentationTime) index++;
      before = this.frames[index];
      after = this.frames[Math.min(index + 1, this.frames.length - 1)];
      const duration = after.serverTime - before.serverTime;
      amount = duration > 0 ? clamp((this.presentationTime - before.serverTime) / duration, 0, 1) : 0;
    } else {
      this.presentationTime = newest.serverTime;
    }
    const time = mix(before.time, after.time, amount);
    const enemies = before.enemies.map(actor => this.actor(actor, after.enemyById.get(actor.id), amount, pointAt));
    const allies = before.allies.map(actor => this.actor(actor, after.allyById.get(actor.id), amount, pointAt, true));
    return {
      time, enemies, allies, presentationTime: this.presentationTime,
      projectiles: this.transients(before.projectiles, after.projectiles, before.time, after.time, time),
      effects: this.transients(before.effects, after.effects, before.time, after.time, time),
      holes: this.transients(before.holes, after.holes, before.time, after.time, time),
      barriers: this.transients(before.barriers, after.barriers, before.time, after.time, time),
    };
  }

  actor(before, after, amount, pointAt, ally = false) {
    if (!after || before === after) return { ...before };
    const route = before.routeIndex ?? 0;
    const routeChanged = route !== (after.routeIndex ?? 0);
    const capturedChanged = (before.capturedBy ?? null) !== (after.capturedBy ?? null);
    const jumped = Math.hypot(after.x - before.x, after.z - before.z) > 3;
    if (routeChanged || capturedChanged) return { ...after };
    let onRoute = Number.isFinite(before.progress) && Number.isFinite(after.progress) && !before.capturedBy && !after.capturedBy && (!ally || before.phase !== 'joining' && after.phase !== 'joining') && !!pointAt;
    if (jumped && onRoute) {
      // High-tier gravity at 3x speed legitimately pulls more than three world
      // units between packets. Valid route travel must remain interpolated.
      const start = pointAt(before.progress, route), end = pointAt(after.progress, route);
      onRoute = Math.hypot(start.x - before.x, start.z - before.z) < .3 && Math.hypot(end.x - after.x, end.z - after.z) < .3;
    }
    if (jumped && !onRoute) return { ...after };
    const actor = { ...before };
    if (onRoute) {
      actor.progress = mix(before.progress, after.progress, amount);
      const position = pointAt(actor.progress, route);
      actor.x = position.x;
      actor.z = position.z;
    } else {
      // Cottage departures and captured actors are not on their route yet.
      actor.x = mix(before.x, after.x, amount);
      actor.z = mix(before.z, after.z, amount);
    }
    if (Number.isFinite(before.ttl) && Number.isFinite(after.ttl)) actor.ttl = mix(before.ttl, after.ttl, amount);
    return actor;
  }

  transients(before, after, beforeTime, afterTime, time) {
    const elapsed = Math.max(0, time - beforeTime);
    const result = [];
    const ids = new Set();
    const afterById = new Map(after.map(effect => [effect.id, effect]));
    const amount = afterTime > beforeTime ? clamp((time - beforeTime) / (afterTime - beforeTime), 0, 1) : 0;
    for (const effect of before) {
      ids.add(effect.id);
      const copy = { ...effect };
      const next = afterById.get(effect.id);
      // Homing shots retain the same launch point but track a moving target.
      for (const key of ['tx', 'tz']) {
        if (Number.isFinite(effect[key]) && Number.isFinite(next?.[key])) copy[key] = mix(effect[key], next[key], amount);
      }
      if (Number.isFinite(copy.ttl)) copy.ttl -= elapsed;
      if (!Number.isFinite(copy.ttl) || copy.ttl > 0) result.push(copy);
    }
    // A newly observed shot has an authoritative birth time encoded by its
    // lifetime. It can appear at that point between samples, not at packet time.
    for (const effect of after) {
      if (ids.has(effect.id) || !Number.isFinite(effect.maxTtl) || !Number.isFinite(effect.ttl)) continue;
      const born = afterTime - (effect.maxTtl - effect.ttl);
      if (time + 1e-8 < born) continue;
      const ttl = effect.maxTtl - Math.max(0, time - born);
      if (ttl > 0) result.push({ ...effect, ttl });
    }
    return result;
  }
}
