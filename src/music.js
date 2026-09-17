/** Original, decoded audio loops; independent of simulation speed and sound effects. */
export const MUSIC_TRACKS = ['rock', 'chill', 'jazz'];

export class MusicPlayer {
  constructor({ baseUrl, track = 'off', volume = .35, onStatus = () => {} }) {
    this.baseUrl = baseUrl;
    this.track = MUSIC_TRACKS.includes(track) ? track : 'off';
    this.volume = volume;
    this.onStatus = onStatus;
    this.status = this.track === 'off' ? 'off' : 'ready';
    this.context = null;
    this.source = null;
    this.buffers = new Map();
    this.revision = 0;
    this.pending = null;
    this.hidden = false;
  }

  report(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  ensureContext() {
    if (this.context) return this.context;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('Web Audio is unavailable');
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    this.context.addEventListener('statechange', () => {
      if (this.track === 'off' || this.pending !== null) return;
      this.report(this.source && this.context.state === 'running' && !this.hidden ? 'playing' : 'ready');
    });
    return this.context;
  }

  async load(track) {
    if (!this.buffers.has(track)) {
      const request = fetch(`${this.baseUrl}audio/${track}.wav`)
        .then(response => {
          if (!response.ok) throw new Error('Music could not load');
          return response.arrayBuffer();
        })
        .then(data => this.context.decodeAudioData(data));
      this.buffers.set(track, request);
      request.catch(() => { if (this.buffers.get(track) === request) this.buffers.delete(track); });
    }
    return this.buffers.get(track);
  }

  stopSource() {
    const old = this.source;
    this.source = null;
    if (!old) return;
    const now = this.context.currentTime;
    if (this.context.state === 'running') {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, .015);
      old.node.stop(now + .08);
    } else {
      old.node.stop();
      old.node.disconnect();
      old.gain.disconnect();
    }
  }

  select(track) {
    if (track !== 'off' && !MUSIC_TRACKS.includes(track)) return;
    if (track === this.track && this.source && this.context?.state === 'running') return;
    this.track = track;
    this.revision++;
    this.pending = null;
    this.stopSource();
    if (track === 'off') { this.report('off'); return; }
    return this.unlock();
  }

  async unlock() {
    if (this.track === 'off' || this.hidden || this.pending === this.revision) return;
    if (this.source && this.context?.state === 'running') return;
    const revision = this.revision;
    const track = this.track;
    this.pending = revision;
    try {
      const context = this.ensureContext();
      // Resume immediately inside the click/key gesture, before fetching or decoding.
      const resume = context.resume();
      if (!this.source) this.report('loading');
      const [, buffer] = await Promise.all([resume, this.load(track)]);
      if (revision !== this.revision) return;
      if (this.hidden || context.state !== 'running') { this.report('ready'); return; }
      if (!this.source) {
        const node = context.createBufferSource();
        const gain = context.createGain();
        node.buffer = buffer;
        node.loop = true;
        node.loopEnd = buffer.duration;
        node.connect(gain);
        gain.connect(this.master);
        gain.gain.setValueAtTime(0, context.currentTime);
        gain.gain.linearRampToValueAtTime(1, context.currentTime + .12);
        node.onended = () => { node.disconnect(); gain.disconnect(); };
        node.start();
        this.source = { node, gain, track };
      }
      this.report('playing');
    } catch {
      if (revision === this.revision) this.report('error');
    } finally {
      if (this.pending === revision) this.pending = null;
    }
  }

  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .025);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    if (!this.context) return;
    if (hidden) {
      this.context.suspend().catch(() => {});
      if (this.track !== 'off') this.report('ready');
    } else {
      // Suspension preserves the loop position when returning to the game.
      if (this.track !== 'off') this.context.resume().then(() => { if (!this.hidden) this.unlock(); }).catch(() => this.report('ready'));
    }
  }
}
