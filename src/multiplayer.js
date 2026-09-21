import { Game } from './game.js';

export const MULTIPLAYER_URL = import.meta.env?.VITE_MULTIPLAYER_URL || 'https://multiplayer.lightsoutphotos.com';
const SESSION_KEY = 'gnomeward-coop-session';
let snapshotSequence = 0;

// A display clock only; reaching zero never starts a round in the browser.
export function coopCountdown(multiplayer, now = performance.now() / 1000) {
  if (!multiplayer?.autoSupported || !multiplayer.autoStart || multiplayer.result || !Number.isFinite(multiplayer.autoCountdown)) return null;
  const elapsed = multiplayer.paused || multiplayer.reconnecting || !multiplayer.connected
    ? 0 : Math.max(0, now - (multiplayer.countdownReceivedAt ?? multiplayer.snapshotReceivedAt));
  return Math.max(0, multiplayer.autoCountdown - elapsed);
}

export function applyCoopSnapshot(game, snapshot, sessionId, lastEventId = 0, receivedAt = performance.now() / 1000) {
  if (snapshot.protocol !== 1 || snapshot.mode !== 'coop') throw new Error('This room is not a compatible co-op game.');
  const board = snapshot.boards.find(board => board.playerId === null)?.state;
  const player = snapshot.players.find(player => player.id === sessionId);
  if (!board || !player) throw new Error('Your garden could not be loaded.');
  if (!game || game.map.id !== snapshot.mapId) game = new Game(snapshot.mapId);
  // The Game methods provide local placement previews and upgrade descriptions.
  // Only the server advances the simulation or changes resources in online play.
  for (const [key, value] of Object.entries(board)) {
    if (key !== 'bestRound' && key !== 'events') game[key] = value;
  }
  game.gold = player.gold;
  game.points = player.points;
  const events = board.events || [];
  game.events = events.filter(event => event.eventId > lastEventId);
  const eventId = Math.max(lastEventId, ...events.map(event => event.eventId || 0));
  return { game, eventId, multiplayer: {
    snapshotTick: snapshot.tick, snapshotReceivedAt: receivedAt, snapshotSequence: ++snapshotSequence,
    roomId: snapshot.roomId, sessionId, hostId: snapshot.hostId, players: snapshot.players,
    connected: true, reconnecting: false, ready: player.ready, endlessReady: player.endlessReady,
    combosSupported: snapshot.comboVersion === 1,
    shopSupported: snapshot.shopVersion === 1,
    roundCoinsEarned: snapshot.shopVersion === 1 && Number.isSafeInteger(player.roundCoinsEarned) && player.roundCoinsEarned >= 0 ? player.roundCoinsEarned : 0,
    receiptKey: snapshot.shopVersion === 1 && typeof player.receiptKey === 'string' ? player.receiptKey : null,
    loadout: snapshot.shopVersion === 1 ? player.loadout : null,
    paused: snapshot.paused, manualPause: snapshot.manualPause, started: snapshot.started,
    autoSupported: typeof snapshot.autoStart === 'boolean',
    autoStart: snapshot.autoStart === true,
    autoCountdown: Number.isFinite(snapshot.autoCountdown) && snapshot.autoCountdown >= 0 ? snapshot.autoCountdown : null,
    countdownReceivedAt: receivedAt,
    result: snapshot.result,
  } };
}

export class CoopClient {
  constructor({ url = MULTIPLAYER_URL, onSnapshot, onConnection, onLeave, onError }) {
    this.url = url.replace(/\/$/, '');
    this.onSnapshot = onSnapshot; this.onConnection = onConnection;
    this.onLeave = onLeave; this.onError = onError;
    this.activeRoom = null; this.connecting = false; this.reconnecting = false;
  }
  async browse() {
    const response = await fetch(`${this.url}/lobbies`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.status === 404) throw new Error('Update the Unraid server to version 0.2.1 to enable co-op lobbies.');
    if (!response.ok) throw new Error('The co-op server is restarting or unavailable. Try again shortly.');
    const data = await response.json();
    if (!Array.isArray(data.lobbies)) throw new Error('Update the Unraid server to version 0.2.1 to enable co-op lobbies.');
    return data.lobbies.filter(lobby => lobby.mode === 'coop');
  }
  async sdk() {
    if (!this.client) { const { Client } = await import('@colyseus/sdk'); this.client = new Client(this.url); }
    return this.client;
  }
  async connect({ name, mapId, roomId, token, loadout } = {}) {
    if (this.activeRoom || this.connecting) return;
    if (!token && (typeof name !== 'string' || !name.trim() || name.trim().length > 24 || /[\u0000-\u001f\u007f<>]/.test(name))) throw new Error('Enter a name with 1–24 plain-text characters.');
    this.connecting = true;
    try {
      const client = await this.sdk();
      const options = { protocol: 1, name: name?.trim(), mode: 'coop', ...(loadout === undefined ? {} : { loadout }) };
      const room = token ? await client.reconnect(token) : roomId
        ? await client.joinById(roomId, options)
        : await client.create('gnomeward', { ...options, mapId });
      this.attach(room);
    } catch (error) {
      if (token) this.clearSession();
      if (/full|locked|seat reservation|no open seats/i.test(error.message)) throw new Error('Someone else joined that lobby. Choose another or create your own.');
      if (/not found|does not exist|invalid room|404/i.test(error.message)) throw new Error('That lobby has closed. Choose another or create your own.');
      throw error;
    } finally { this.connecting = false; }
  }
  attach(room) {
    this.activeRoom = room; this.reconnecting = false;
    this.saveSession(room);
    Object.assign(room.reconnection, { minUptime: 0, maxRetries: 30, minDelay: 500, maxDelay: 3000 });
    this.firstSnapshotTimer = setTimeout(() => { if (this.activeRoom === room) this.leave('The server did not send your garden. Please try joining again.'); }, 12000);
    room.onMessage('snapshot', snapshot => {
      if (this.activeRoom !== room) return;
      clearTimeout(this.firstSnapshotTimer);
      try { this.onSnapshot(snapshot, room.sessionId); }
      catch (error) { this.leave(error.message); }
    });
    room.onMessage('command-error', error => { if (this.activeRoom === room) this.onError(error.message); });
    room.onError((_code, message) => { if (this.activeRoom === room && !this.reconnecting) this.onError(message); });
    room.onDrop(() => {
      if (this.activeRoom !== room || this.reconnecting) return;
      this.reconnecting = true; this.onConnection(false);
      this.reconnectTimer = setTimeout(() => this.leave('Reconnection timed out. You can join another lobby.'), 60000);
    });
    room.onReconnect(() => {
      if (this.activeRoom !== room) { room.leave(); return; }
      clearTimeout(this.reconnectTimer); this.reconnecting = false;
      this.saveSession(room); this.onConnection(true); room.send('snapshot');
    });
    room.onLeave(() => { if (this.activeRoom === room) this.leave('The co-op room has closed.'); });
    room.send('snapshot');
  }
  command(message) {
    if (!this.activeRoom || this.reconnecting) { this.onError('Waiting for the co-op connection…'); return false; }
    this.activeRoom.send('command', message); return true;
  }
  saveSession(room) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ url: this.url, token: room.reconnectionToken })); } catch {} }
  clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} }
  async resume() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}
    if (!saved?.token || saved.url !== this.url) return;
    return this.connect({ token: saved.token });
  }
  leave(message = 'You left the co-op garden.') {
    const room = this.activeRoom;
    this.activeRoom = null; this.reconnecting = false;
    clearTimeout(this.reconnectTimer); clearTimeout(this.firstSnapshotTimer); this.clearSession();
    if (room) {
      room.reconnection.enabled = false; room.reconnection.maxRetries = 0;
      if (room.connection.isOpen) room.leave().catch(() => {}); else room.connection.close();
    }
    this.onLeave(message);
  }
}
