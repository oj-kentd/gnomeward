import { Game } from '../src/game.js';
import { MAPS, TOWERS, SECRETS } from '../src/data.js';

export const PROTOCOL = 1;
const BOARD_FIELDS = ['wave', 'completedWaves', 'maxWaves', 'endless', 'lives', 'gold', 'points', 'status', 'kills', 'time', 'towers', 'enemies', 'traps', 'holes', 'barriers', 'allies', 'secretDiscoveries', 'effects', 'projectiles'];
const reject = message => { throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateIdentity(options) {
  if (!plain(options) || options.protocol !== PROTOCOL) reject('Protocol mismatch. Use protocol 1.');
  if (typeof options.name !== 'string' || !options.name.trim() || options.name.trim().length > 24 || /[\u0000-\u001f\u007f<>]/.test(options.name)) reject('Name must contain 1–24 plain-text characters.');
  return options.name.trim();
}

/** Server-only state. Browser commands can never import gold, unlocks, HP, or saves. */
export class Match {
  constructor({ mode, mapId, unlockedRewards = [] }) {
    if (!['coop', 'pvp'].includes(mode)) reject('Choose coop or pvp.');
    if (!MAPS.some(map => map.id === mapId)) reject('Unknown map.');
    this.mode = mode;
    this.mapId = mapId;
    this.unlockedRewards = unlockedRewards.filter(id => id === 'strawberry');
    this.players = new Map();
    this.boards = new Map();
    if (mode === 'coop') this.boards.set(null, new Game(mapId, { unlocks: [...this.unlockedRewards] }));
    this.hostId = null;
    this.speed = 1;
    this.manualPause = false;
    this.started = false;
    this.sealed = false;
    this.result = null;
    this.tick = 0;
    this.freeTowerOwners = new Map();
    this.eventIds = new WeakMap();
    this.nextEventId = 0;
  }

  get paused() { return this.manualPause || this.players.size !== 2 || [...this.players.values()].some(p => !p.connected); }
  board(id) { return this.boards.get(this.mode === 'coop' ? null : id); }
  addPlayer(id, name) {
    if (this.sealed || this.result || this.players.has(id) || this.players.size >= 2) reject('This match has no open seats.');
    const player = { id, name, connected: true, ready: false, endlessReady: false, gold: this.mode === 'coop' ? 325 : 650, points: 0 };
    this.players.set(id, player);
    this.hostId ??= id;
    if (this.mode === 'coop') for (const tower of this.board().towers) tower.ownerId ??= this.hostId;
    if (this.mode === 'pvp') this.boards.set(id, new Game(this.mapId, { unlocks: [...this.unlockedRewards] }));
    if (this.players.size === 2) this.sealed = true;
    this._syncWallets();
    return player;
  }

  setConnected(id, connected) {
    const player = this.players.get(id);
    if (player) player.connected = connected;
  }

  leave(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    if (this.result) return;
    const other = [...this.players.values()].find(p => p.id !== id);
    const reason = other && this.mode === 'pvp' ? 'forfeit' : this.mode === 'coop' && this.board().status === 'won' ? 'campaign-cleared' : 'abandoned';
    this.finish(reason, other && this.mode === 'pvp' ? other.id : null);
  }

  finish(reason, winnerId = null) {
    if (this.result) return;
    this.result = {
      mode: this.mode, mapId: this.mapId, reason, winnerId,
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, completedWaves: this.board(p.id)?.completedWaves ?? 0, lives: this.board(p.id)?.lives ?? 0 })),
    };
  }

  _syncWallets() {
    if (this.mode === 'coop') {
      const game = this.board();
      game.gold = [...this.players.values()].reduce((n, p) => n + p.gold, 0);
      game.points = [...this.players.values()].reduce((n, p) => n + p.points, 0);
    } else {
      for (const p of this.players.values()) {
        const game = this.board(p.id);
        p.gold = game.gold;
        p.points = game.points;
      }
    }
  }

  _transaction(player, action) {
    const game = this.board(player.id);
    if (this.mode === 'coop') { game.gold = player.gold; game.points = player.points; }
    try { return action(game); }
    finally {
      player.gold = game.gold;
      player.points = game.points;
      // A free crystal guardian belongs to the player completing its secret.
      for (const tower of game.towers) tower.ownerId ??= this.freeTowerOwners.get(game) || player.id;
      this._syncWallets();
    }
  }

  command(id, message) {
    const player = this.players.get(id);
    if (!player?.connected) reject('Player is not connected.');
    if (this.result) reject('This match has ended.');
    if (!plain(message) || typeof message.action !== 'string') reject('Invalid command.');
    const game = this.board(id);
    const action = message.action;
    if (action === 'speed') {
      if (id !== this.hostId || ![1, 2, 3].includes(message.speed)) reject('Only the host can set speed to 1, 2, or 3.');
      this.speed = message.speed;
      return;
    }
    if (action === 'pause') {
      if (this.mode !== 'coop' || typeof message.paused !== 'boolean') reject('Manual pause is only available in co-op.');
      this.manualPause = message.paused;
      return;
    }
    if (action === 'ready') {
      if (this.players.size !== 2 || this.paused || ![...this.boards.values()].every(g => g.status === 'planning')) reject('Both players must be connected and between rounds.');
      player.ready = true;
      if ([...this.players.values()].every(p => p.ready)) {
        for (const board of this.boards.values()) board.startWave();
        for (const p of this.players.values()) p.ready = false;
        this.started = true;
      }
      return;
    }
    if (action === 'endless') {
      if (this.mode !== 'coop' || game.status !== 'won' || this.paused) reject('Endless mode is available after both players clear round 20.');
      player.endlessReady = true;
      if ([...this.players.values()].every(p => p.endlessReady)) {
        game.continueEndless();
        for (const p of this.players.values()) p.endlessReady = false;
      }
      return;
    }
    if (this.started && (this.players.size !== 2 || [...this.players.values()].some(p => !p.connected))) reject('The match is paused while a player reconnects.');
    if (!['planning', 'wave'].includes(game.status)) reject('This board is not accepting actions.');
    if (action === 'discover') {
      if (typeof message.id !== 'string' || !SECRETS[this.mapId]?.spots.some(spot => spot.id === message.id)) reject('Unknown discovery.');
      this.freeTowerOwners.set(game, id);
      this._transaction(player, board => board.discoverSecret(message.id));
      return;
    }
    if (action === 'place') {
      if (typeof message.type !== 'string' || !Object.hasOwn(TOWERS, message.type) || !Number.isFinite(message.x) || !Number.isFinite(message.z)) reject('Invalid tower placement.');
      // Also caps per-board cost for crowded endless simulations.
      if (game.towers.length >= 100) reject('This garden has reached its 100-gnome limit.');
      const tower = this._transaction(player, board => board.placeTower(message.type, message.x, message.z));
      if (!tower) reject('Cannot place that gnome here or afford it.');
      tower.ownerId = id;
      return;
    }
    if (!['upgrade', 'sell', 'target'].includes(action)) reject('Unknown command.');
    if (!Number.isSafeInteger(message.towerId)) reject('Invalid tower.');
    const tower = game.towers.find(t => t.id === message.towerId);
    if (!tower || tower.ownerId !== id) reject('You can only change your own gnomes.');
    let ok;
    if (action === 'upgrade') ok = this._transaction(player, board => board.upgradeTower(tower.id, message.path));
    if (action === 'sell') ok = this._transaction(player, board => board.sellTower(tower.id));
    if (action === 'target') ok = game.setTargeting(tower.id, message.mode);
    if (!ok) reject('That action is not available.');
  }

  step(dt = 0.05) {
    if (this.result || this.paused || !this.started || !Number.isFinite(dt) || dt <= 0) return;
    this.tick++;
    for (const game of this.boards.values()) {
      const gold = game.gold, points = game.points;
      game.update(Math.min(dt, 0.05) * this.speed);
      if (this.mode === 'coop') {
        for (const p of this.players.values()) {
          p.gold += (game.gold - gold) / 2;
          p.points += (game.points - points) / 2;
        }
      }
      for (const tower of game.towers) tower.ownerId ??= this.freeTowerOwners.get(game) || (this.mode === 'pvp' ? [...this.boards.entries()].find(([, board]) => board === game)?.[0] : this.hostId);
    }
    this._syncWallets();
    const boards = [...this.boards.values()];
    if (this.mode === 'coop' && boards[0].status === 'lost') this.finish('defeat');
    if (this.mode === 'pvp') {
      const living = [...this.players.keys()].filter(id => this.board(id).status !== 'lost');
      if (living.length < 2) this.finish(living.length === 0 ? 'draw' : 'last-standing', living[0] || null);
      else if (boards.every(g => g.status === 'won')) for (const game of boards) game.continueEndless();
    }
  }

  snapshot(roomId = '') {
    return structuredClone({
      protocol: PROTOCOL, roomId, mode: this.mode, mapId: this.mapId, hostId: this.hostId,
      players: [...this.players.values()], paused: this.paused, manualPause: this.manualPause,
      speed: this.speed, started: this.started, tick: this.tick, result: this.result,
      boards: [...this.boards.entries()].map(([playerId, game]) => ({ playerId, state: {
        ...Object.fromEntries(BOARD_FIELDS.map(field => [field, game[field]])),
        profile: { unlocks: [...game.profile.unlocks], bestRounds: { ...game.profile.bestRounds } },
        bestRound: game.bestRound,
        events: game.events.slice(-12).map(event => {
          if (!this.eventIds.has(event)) this.eventIds.set(event, ++this.nextEventId);
          return { ...event, eventId: this.eventIds.get(event) };
        }),
      } })),
    });
  }
}
