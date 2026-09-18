import test from 'node:test';
import assert from 'node:assert/strict';
import { CoopMotionBuffer } from '../src/coop-motion.js';

const line = progress => ({ x: progress, z: 0 });
const enemy = (progress, overrides = {}) => ({ id: 1, x: progress, z: 0, progress, routeIndex: 0, capturedBy: null, hp: 20, ...overrides });
function board(time, enemies = [enemy(time)], overrides = {}) {
  return { map: { id: 'meadow' }, time, enemies, allies: [], effects: [], projectiles: [], holes: [], barriers: [], ...overrides };
}
function packet(buffer, tick, receivedAt, game = board(tick * .05), overrides = {}) {
  buffer.capture(game, { roomId: 'room', connected: true, paused: false, reconnecting: false, snapshotTick: tick, snapshotReceivedAt: receivedAt, snapshotSequence: receivedAt, ...overrides });
}
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message || 'value'}: ${actual} vs ${expected}`);

function regularMotion(oldLerp = false) {
  const buffer = new CoopMotionBuffer();
  let target = 0, old = 0, previous = 0;
  const steps = [];
  for (let frame = 0; frame <= 180; frame++) {
    const now = frame / 60;
    if (frame % 12 === 0) { target = now; packet(buffer, frame / 3, now); }
    const current = oldLerp ? (old += (target - old) * (1 - Math.exp(-18 / 60))) : buffer.sample(now, line).enemies[0].x;
    if (frame > 48) steps.push(current - previous);
    previous = current;
  }
  return steps;
}

test('buffered 5 Hz samples produce uniform 60 Hz travel instead of exponential speed pulses', () => {
  const steps = regularMotion();
  assert.ok(steps.every(distance => Math.abs(distance - 1 / 60) < 1e-8));
  const old = regularMotion(true);
  assert.ok(Math.max(...old) / Math.min(...old) > 20, 'The previous chase visibly accelerates and stalls within every packet interval');
  assert.ok(Math.max(...steps) / Math.min(...steps) < 1.001);
});

test('arrival jitter does not reset the presentation clock each packet', () => {
  const buffer = new CoopMotionBuffer({ delay: .24 });
  const arrivals = Array.from({ length: 18 }, (_, index) => ({ tick: index * 4, arrived: index * .2 + [0, .018, .009, .025][index % 4] }));
  let next = 0, last = null;
  const steps = [];
  for (let frame = 0; frame < 190; frame++) {
    const now = frame / 60;
    while (next < arrivals.length && arrivals[next].arrived <= now + 1e-9) {
      const { tick, arrived } = arrivals[next++];packet(buffer, tick, arrived);
    }
    const x = buffer.sample(now, line)?.enemies[0].x;
    if (frame > 60 && last !== null) steps.push(x - last);
    last = x;
  }
  assert.ok(steps.every(distance => Math.abs(distance - 1 / 60) < 1e-8), 'Late packets are absorbed by the buffer instead of producing speed pulses');
});

test('route interpolation follows corners and rapid backwards gravity without diagonal shortcuts or snaps', () => {
  const corner = progress => progress <= 1 ? { x: progress, z: 0 } : { x: 1, z: progress - 1 };
  const buffer = new CoopMotionBuffer({ delay: .2 });
  packet(buffer, 0, 0, board(0, [enemy(.8, corner(.8))]));
  packet(buffer, 4, .2, board(.2, [enemy(1.4, corner(1.4))]));
  const mid = buffer.sample(.3, corner).enemies[0];
  close(mid.x, 1);close(mid.z, .1);close(mid.progress, 1.1);
  const gravity = new CoopMotionBuffer({ delay: .2 });
  packet(gravity, 0, 0, board(0, [enemy(10)]));
  packet(gravity, 4, .2, board(.6, [enemy(5.8)]));
  const pulled = gravity.sample(.3, line);
  close(pulled.enemies[0].x, 7.9, '4.2-unit gravity pull is interpolated');
  close(pulled.time, .3, 'Animation time follows the 3x simulation clock');
});

test('joining helpers interpolate in world space rather than jumping to the path', () => {
  const buffer = new CoopMotionBuffer({ delay: .2 });
  const helper = { id: 7, routeIndex: 0, progress: 0, phase: 'joining', x: 4, z: 4, ttl: 12 };
  packet(buffer, 0, 0, board(0, [], { allies: [helper] }));
  packet(buffer, 4, .2, board(.2, [], { allies: [{ ...helper, x: 3, z: 3, ttl: 11.8 }] }));
  const ally = buffer.sample(.3, () => ({ x: 99, z: 99 })).allies[0];
  close(ally.x, 3.5);close(ally.z, 3.5);close(ally.ttl, 11.9);
});

test('route changes, capture changes and off-route teleports snap without dragging actors across the map', () => {
  for (const changed of [enemy(1, { routeIndex: 1 }), enemy(1, { capturedBy: 5 }), enemy(1, { x: 9, z: 9 })]) {
    const buffer = new CoopMotionBuffer({ delay: .2 });
    packet(buffer, 0, 0, board(0, [enemy(0)]));
    packet(buffer, 4, .2, board(.2, [changed]));
    const actor = buffer.sample(.3, line).enemies[0];
    close(actor.x, changed.x);close(actor.z, changed.z);
  }
});

test('pause, reconnect, new rooms and map resets clear old motion and freeze presentation', () => {
  const buffer = new CoopMotionBuffer({ delay: .2 });
  packet(buffer, 0, 0);packet(buffer, 4, .2);
  packet(buffer, 4, .21, board(.2), { paused: true });
  close(buffer.sample(10, line).enemies[0].x, .2);
  close(buffer.sample(10, line).time, .2);
  packet(buffer, 4, 10, board(.2), { reconnecting: true });
  assert.equal(buffer.frames.length, 1);
  packet(buffer, 8, 10.2, board(.4));
  assert.equal(buffer.frames.length, 1);
  close(buffer.sample(10.25, line).enemies[0].x, .4);
  packet(buffer, 0, 11, board(0, [enemy(7)]), { roomId: 'another-room' });
  close(buffer.sample(11, line).enemies[0].x, 7);
  buffer.reset();assert.equal(buffer.sample(12, line), null);
});

test('projectiles and effects advance on the presentation clock without touching network records', () => {
  const buffer = new CoopMotionBuffer({ delay: .2 });
  const source = board(0, [enemy(0)], { projectiles: [{ id: 4, type: 'shot', ttl: .6, maxTtl: .6, x: 0, z: 0 }] });
  const later = board(.2, [enemy(.2)], { projectiles: [{ id: 4, type: 'shot', ttl: .4, maxTtl: .6, x: 0, z: 0 }], effects: [{ id: 5, type: 'impact', ttl: .05, maxTtl: .2 }] });
  const original = JSON.stringify([source, later]);
  packet(buffer, 0, 0, source);packet(buffer, 4, .2, later);
  const beforeBirth = buffer.sample(.24, line);
  assert.equal(beforeBirth.effects.length, 0);
  const afterBirth = buffer.sample(.3, line);
  close(afterBirth.projectiles[0].ttl, .5);
  close(afterBirth.effects[0].ttl, .15);
  assert.equal(JSON.stringify([source, later]), original, 'Snapshots remain authoritative and unchanged');
  afterBirth.enemies[0].x = 500;
  assert.equal(source.enemies[0].x, 0);
});

test('missing packets stop at the newest authoritative sample and retained history stays bounded', () => {
  const buffer = new CoopMotionBuffer({ maxSamples: 4 });
  for (let index = 0; index < 20; index++) packet(buffer, index * 4, index * .2);
  assert.equal(buffer.frames.length, 4);
  const held = buffer.sample(20, line);
  close(held.enemies[0].x, 3.8);
  close(held.time, 3.8);
});


test('waiting in an unstarted lobby does not poison the first round clock anchor', () => {
  const buffer = new CoopMotionBuffer();
  packet(buffer, 0, 0, board(0), { started: false });
  packet(buffer, 0, 10, board(0), { started: false });
  packet(buffer, 0, 20, board(0), { started: true });
  let previous;
  const steps = [];
  for (let frame = 0; frame <= 120; frame++) {
    const elapsed = frame / 60;
    if (frame % 12 === 0) packet(buffer, frame / 3, 20 + elapsed, board(elapsed), { started: true });
    const x = buffer.sample(20 + elapsed, line).enemies[0].x;
    if (frame > 36) steps.push(x - previous);
    previous = x;
  }
  assert.ok(steps.every(distance => Math.abs(distance - 1 / 60) < 1e-8));
});

test('homing projectile targets interpolate while the launch position stays fixed', () => {
  const buffer = new CoopMotionBuffer({ delay: .2 });
  const shot = { id: 3, x: 2, z: 3, tx: 4, tz: 5, ttl: .6, maxTtl: .6 };
  packet(buffer, 0, 0, board(0, [], { projectiles: [shot] }));
  packet(buffer, 4, .2, board(.2, [], { projectiles: [{ ...shot, tx: 6, tz: 7, ttl: .4 }] }));
  const rendered = buffer.sample(.3, line).projectiles[0];
  close(rendered.tx, 5); close(rendered.tz, 6);
  close(rendered.x, 2); close(rendered.z, 3);
  close(shot.tx, 4);
});
