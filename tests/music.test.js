import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer } from '../src/music.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

function audioHarness(t) {
  const originalContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  const contexts = [];
  const requests = [];
  class MockAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 10;
      this.destination = {};
      this.sources = [];
      this.gains = [];
      this.listeners = [];
      this.resumes = 0;
      this.suspends = 0;
      contexts.push(this);
    }
    createGain() {
      const calls = [];
      const gain = { value: 1, calls,
        setValueAtTime(value, time) { this.value = value; calls.push(['set', value, time]); },
        linearRampToValueAtTime(value, time) { this.value = value; calls.push(['ramp', value, time]); },
        setTargetAtTime(value, time, duration) { this.value = value; calls.push(['target', value, time, duration]); },
        cancelScheduledValues(time) { calls.push(['cancel', time]); },
      };
      const node = { gain, connections: [], connect(target) { this.connections.push(target); }, disconnect() { this.connections = []; } };
      this.gains.push(node);
      return node;
    }
    createBufferSource() {
      const source = { starts: 0, stops: 0, connections: [], loop: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.connections = []; },
        start() { this.starts++; },
        stop(time) { this.stops++; this.stopTime = time; },
      };
      this.sources.push(source);
      return source;
    }
    addEventListener(type, listener) { if (type === 'statechange') this.listeners.push(listener); }
    stateChange(state) { this.state = state; for (const listener of this.listeners) listener(); }
    resume() { this.resumes++; this.stateChange('running'); return Promise.resolve(); }
    suspend() { this.suspends++; this.stateChange('suspended'); return Promise.resolve(); }
    decodeAudioData(data) { return Promise.resolve({ duration: 12, track: data.track }); }
  }
  globalThis.AudioContext = MockAudioContext;
  globalThis.fetch = url => new Promise((resolve, reject) => {
    const track = url.match(/\/([^/]+)\.wav$/)?.[1];
    requests.push({ url, track, resolve, reject, completed: false });
  });
  t.after(() => {
    if (originalContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalContext;
    globalThis.fetch = originalFetch;
  });
  return {
    contexts, requests,
    finish(track) {
      const request = requests.find(r => r.track === track && !r.completed);
      assert.ok(request, `pending request for ${track}`);
      request.completed = true;
      request.resolve({ ok: true, arrayBuffer: async () => ({ track }) });
    },
    fail(track) {
      const request = requests.find(r => r.track === track && !r.completed);
      assert.ok(request);
      request.completed = true;
      request.reject(new Error('offline'));
    },
  };
}

const player = options => new MusicPlayer({ baseUrl: '/gnomeward/', ...options });

test('music is off and lazy by default; a saved genre waits for a user unlock', async t => {
  const h = audioHarness(t);
  const off = player();
  assert.equal(off.track, 'off');
  assert.equal(off.status, 'off');
  await off.unlock();
  off.setVolume(0.6);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.requests.length, 0);
  const saved = player({ track: 'jazz' });
  assert.equal(saved.status, 'ready');
  assert.equal(saved.context, null);
  assert.equal(h.requests.length, 0);
  assert.equal(player({ track: 'invalid' }).track, 'off');
});

test('selected music decodes once, loops the complete buffer, and fades through its own gain', async t => {
  const h = audioHarness(t);
  const statuses = [];
  const p = player({ onStatus: status => statuses.push(status) });
  const loading = p.select('rock');
  assert.equal(p.status, 'loading');
  assert.equal(h.contexts.length, 1);
  assert.equal(h.contexts[0].resumes, 1);
  assert.equal(h.requests[0].url, '/gnomeward/audio/rock.wav');
  assert.equal(p.source, null);
  h.finish('rock');
  await loading;
  assert.equal(p.status, 'playing');
  assert.equal(p.source.node.buffer.track, 'rock');
  assert.equal(p.source.node.loop, true);
  assert.equal(p.source.node.loopEnd, 12);
  assert.equal(p.source.node.starts, 1);
  assert.equal(p.source.node.connections[0], p.source.gain);
  assert.equal(p.source.gain.connections[0], p.master);
  assert.deepEqual(statuses, ['loading', 'playing']);
});

test('the last genre choice wins when previous fetches complete out of order', async t => {
  const h = audioHarness(t);
  const p = player();
  const old = p.select('rock');
  const latest = p.select('jazz');
  h.finish('jazz');
  await latest;
  assert.equal(p.source.track, 'jazz');
  h.finish('rock');
  await old;
  assert.equal(p.track, 'jazz');
  assert.equal(p.source.track, 'jazz');
  assert.equal(p.context.sources.length, 1);
  const previous = p.source.node;
  const cached = p.select('rock');
  await cached;
  assert.equal(previous.stops, 1);
  assert.equal(p.source.track, 'rock');
  assert.equal(h.requests.length, 2, 'decoded tracks are cached');
});

test('turning music off during loading prevents the completed request from restarting it', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('chill');
  p.select('off');
  h.finish('chill');
  await loading;
  await p.unlock();
  assert.equal(p.status, 'off');
  assert.equal(p.track, 'off');
  assert.equal(p.source, null);
  assert.equal(p.context.sources.length, 0);
});

test('repeated selection and user unlocks cannot layer duplicate copies of a genre', async t => {
  const h = audioHarness(t);
  const p = player();
  const first = p.select('rock');
  const second = p.select('rock');
  await p.unlock();
  assert.equal(h.requests.length, 1);
  h.finish('rock');
  await Promise.all([first, second]);
  const node = p.source.node;
  await p.unlock();
  await p.select('rock');
  await p.unlock();
  assert.equal(p.source.node, node);
  assert.equal(p.context.sources.length, 1);
  assert.equal(node.starts, 1);
  assert.equal(node.stops, 0);
  p.select('off');
  assert.equal(node.stops, 1);
  assert.equal(p.source, null);
});

test('music volume clamps and controls only its master gain without changing playback', async t => {
  const h = audioHarness(t);
  const p = player();
  p.setVolume(-4);
  assert.equal(p.volume, 0);
  assert.equal(p.context, null);
  p.setVolume(4);
  assert.equal(p.volume, 1);
  p.setVolume(NaN);
  p.setVolume(Infinity);
  assert.equal(p.volume, 1);
  const loading = p.select('jazz');
  h.finish('jazz');
  await loading;
  const source = p.source;
  p.setVolume(0.2);
  assert.equal(p.master.gain.value, 0.2);
  assert.equal(source.gain.gain.value, 1, 'per-track fade gain is independent');
  assert.equal(p.source, source);
  assert.equal(p.track, 'jazz');
  assert.equal(p.context.sources.length, 1);
  p.setVolume(0);
  assert.equal(p.status, 'playing', 'muting does not reset the loop');
});

test('hiding suspends music and returning resumes the same loop without layering', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('chill');
  h.finish('chill');
  await loading;
  const original = p.source.node;
  p.setHidden(true);
  await settle();
  assert.equal(p.context.state, 'suspended');
  assert.equal(p.status, 'ready');
  assert.equal(original.stops, 0);
  p.setHidden(false);
  await settle();
  assert.equal(p.context.state, 'running');
  assert.equal(p.status, 'playing');
  assert.equal(p.source.node, original);
  assert.equal(p.context.sources.length, 1);
});

test('switching genres while hidden waits for visibility before loading and playing', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('rock');
  h.finish('rock');
  await loading;
  const original = p.source.node;
  p.setHidden(true);
  await p.select('jazz');
  assert.equal(original.stops, 1);
  assert.equal(p.source, null);
  assert.equal(p.context.state, 'suspended');
  assert.equal(h.requests.length, 1);
  p.setHidden(false);
  await settle();
  assert.equal(p.context.state, 'running');
  h.finish('jazz');
  await settle();
  assert.equal(p.source.track, 'jazz');
  assert.equal(p.status, 'playing');
});

test('a fetch completing while hidden stays silent and starts on return', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('rock');
  p.setHidden(true);
  h.finish('rock');
  await loading;
  assert.equal(p.source, null);
  assert.equal(p.status, 'ready');
  assert.equal(p.context.state, 'suspended');
  p.setHidden(false);
  await settle();
  assert.equal(p.source.track, 'rock');
  assert.equal(p.status, 'playing');
  assert.equal(h.requests.length, 1);
});

test('returning while a fetch is still pending resumes its context and allows eventual playback', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('jazz');
  p.setHidden(true);
  p.setHidden(false);
  await settle();
  assert.equal(p.context.state, 'running');
  h.finish('jazz');
  await loading;
  assert.equal(p.status, 'playing');
  assert.equal(p.source.track, 'jazz');
  assert.equal(p.context.sources.length, 1);
});

test('failed music loads report an error and can be retried successfully', async t => {
  const h = audioHarness(t);
  const p = player();
  const loading = p.select('rock');
  h.fail('rock');
  await loading;
  assert.equal(p.status, 'error');
  assert.equal(p.source, null);
  const retry = p.unlock();
  assert.equal(h.requests.length, 2);
  h.finish('rock');
  await retry;
  assert.equal(p.status, 'playing');
});
