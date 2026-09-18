import { Room } from '@colyseus/core';
import { Match, validateIdentity } from './match.js';
import { NECRO_PATH_SECRET } from '../src/data.js';

/** Configuration is closed over by the server, never merged with browser options. */
export function createGnomewardRoom({ recordResult = () => {}, onRoomOpen = () => {}, onRoomClose = () => {}, getUnlockedRewards = () => [], onRewardUnlocked = () => {}, getUnlockedPaths = () => [], onPathUnlocked = () => {}, reconnectSeconds = 60, lobbyIdleMs = 300_000, roomIdleMs = 1_800_000 } = {}) {
  return class GnomewardRoom extends Room {
    maxClients = 2;
    autoDispose = true;

    async onCreate(options) {
      validateIdentity(options);
      this.match = new Match({ ...options, unlockedRewards: getUnlockedRewards(), unlockedPaths: getUnlockedPaths() });
      await onRoomOpen(this);
      this.registered = true;
      this.budgets = new Map();
      this.backpressure = new Map();
      this.pendingJoins = new Map();
      this.accumulator = 0;
      this.resultRecorded = false;
      this.lastActivity = Date.now();
      this.onMessage('command', (client, message) => {
        if (!this.consume(client)) return;
        try {
          this.match.command(client.sessionId, message);
          this.lastActivity = Date.now();
        }
        catch (error) { client.send('command-error', { message: error.message }); }
        this.savePathUnlocks();
        this.saveResult();
      });
      this.onMessage('snapshot', client => {
        if (this.consume(client)) this.sendSnapshot(client);
      });
      this.setSimulationInterval(delta => {
        // Fixed 20 Hz steps, capped catch-up after a stalled process.
        this.accumulator += Math.min(delta, 250);
        while (this.accumulator >= 50) {
          this.match.step(0.05);
          this.accumulator -= 50;
        }
        this.saveEncounterReward();
        this.savePathUnlocks();
        this.saveResult();
        if (!this.match.result && !this.match.paused && [...this.match.boards.values()].some(board => board.status === 'wave')) this.lastActivity = Date.now();
      }, 50);
      this.clock.setInterval(() => this.sendSnapshot(), 200);
      this.clock.setInterval(() => this.expireIfIdle(), 10_000);
    }

    onAuth(client, options) {
      validateIdentity(options);
      if (options.mode !== undefined && options.mode !== this.match.mode) throw new Error('Room mode does not match.');
      if (options.mapId !== undefined && options.mapId !== this.match.mapId) throw new Error('Room map does not match.');
      return true;
    }

    lobbyListing() {
      const match = this.match;
      const host = match?.players.get(match.hostId);
      if (!host?.connected || match.players.size !== 1 || match.sealed || match.started || match.result || this.locked || this.hasReachedMaxClients()) return null;
      return { roomId: this.roomId, hostName: host.name, mode: match.mode, mapId: match.mapId, players: 1, maxPlayers: this.maxClients };
    }

    onJoin(client, options) {
      this.match.addPlayer(client.sessionId, validateIdentity(options));
      this.lastActivity = Date.now();
      this.budgets.set(client.sessionId, { tokens: 60, time: Date.now() });
      if (this.match.sealed) this.lock();
      this.sendSnapshot();
    }

    onDrop(client) {
      this.backpressure.delete(client.sessionId);
      this.pendingJoins.delete(client.sessionId);
      this.match.setConnected(client.sessionId, false);
      // Core calls onLeave after expiry; the catch also covers disposal races.
      this.allowReconnection(client, reconnectSeconds).catch(() => {});
      this.sendSnapshot();
    }

    onReconnect(client) {
      this.backpressure.delete(client.sessionId);
      this.pendingJoins.delete(client.sessionId);
      this.match.setConnected(client.sessionId, true);
      this.sendSnapshot();
    }

    onLeave(client) {
      this.backpressure.delete(client.sessionId);
      this.pendingJoins.delete(client.sessionId);
      this.match.leave(client.sessionId);
      this.budgets.delete(client.sessionId);
      this.saveResult();
      this.sendSnapshot();
      // A one-player lobby cannot be reused after its creator leaves.
      this.lock();
    }

    expireIfIdle() {
      const timeout = this.match.sealed ? roomIdleMs : lobbyIdleMs;
      if (Date.now() - this.lastActivity < timeout) return;
      this.match.finish('idle-timeout');
      this.saveResult();
      this.sendSnapshot();
      this.disconnect().catch(error => console.error('Could not close idle room:', error.message));
    }

    consume(client) {
      const budget = this.budgets.get(client.sessionId);
      if (!budget) return false;
      const now = Date.now();
      budget.tokens = Math.min(60, budget.tokens + Math.max(0, now - budget.time) * 0.03);
      budget.time = now;
      if (budget.tokens < 1) return false;
      budget.tokens--;
      return true;
    }

    sendSnapshot(recipient) {
      if (!this.match) return;
      let snapshot;
      for (const client of recipient ? [recipient] : this.clients) {
        // Colyseus buffers messages until JOIN_ROOM is acknowledged. Queue only
        // one initial snapshot, and bound an incomplete handshake's lifetime.
        if (Array.isArray(client._enqueuedMessages)) {
          const pendingSince = this.pendingJoins.get(client.sessionId);
          if (pendingSince !== undefined) {
            if (Date.now() - pendingSince >= 10_000) client.ref.terminate();
            continue;
          }
          this.pendingJoins.set(client.sessionId, Date.now());
        } else {
          this.pendingJoins.delete(client.sessionId);
        }
        if (client.ref.bufferedAmount > 1024 * 1024) {
          const now = Date.now();
          const blockedSince = this.backpressure.get(client.sessionId);
          if (blockedSince === undefined) this.backpressure.set(client.sessionId, now);
          else if (now - blockedSince >= 10_000) {
            this.backpressure.delete(client.sessionId);
            // An abnormal drop invokes the ordinary pause/reconnect lifecycle.
            client.ref.terminate();
          }
          continue;
        }
        this.backpressure.delete(client.sessionId);
        snapshot ??= this.match.snapshot(this.roomId);
        client.send('snapshot', snapshot);
      }
    }

    async saveEncounterReward() {
      if (this.rewardSaved || this.rewardPending || Date.now() < (this.rewardRetryAt || 0) || this.match.mapId !== 'strawberry' ||
          ![...this.match.boards.values()].some(board => board.completedWaves >= 20 && board.profile.unlocks.includes('strawberry'))) return;
      this.rewardPending = true;
      try {
        await onRewardUnlocked('strawberry');
        this.rewardSaved = true;
      } catch (error) {
        this.rewardRetryAt = Date.now() + 5000;
        console.error('Could not save Strawberry reward:', error.message);
      } finally { this.rewardPending = false; }
    }

    async savePathUnlocks() {
      if (this.pathSaved || this.pathPending || Date.now() < (this.pathRetryAt || 0) ||
          ![...this.match.boards.values()].some(board => board.profile.pathUnlocks?.includes(NECRO_PATH_SECRET.id))) return;
      this.pathPending = true;
      try {
        await onPathUnlocked(NECRO_PATH_SECRET.id);
        this.pathSaved = true;
      } catch (error) {
        this.pathRetryAt = Date.now() + 5000;
        console.error('Could not save Soul Echoes path:', error.message);
      } finally { this.pathPending = false; }
    }

    saveResult() {
      if (!this.match.result || this.resultRecorded) return;
      this.resultRecorded = true;
      const result = { ...structuredClone(this.match.result), roomId: this.roomId, endedAt: new Date().toISOString() };
      Promise.resolve().then(() => recordResult(result)).catch(error => console.error('Could not save match result:', error.message));
    }

    onBeforeShutdown() {
      if (this.registered && this.match) {
        this.match.finish('server-closed');
        this.saveResult();
        this.sendSnapshot();
      }
      super.onBeforeShutdown();
    }

    onDispose() {
      if (!this.registered) return;
      if (this.match && !this.match.result) this.match.finish('server-closed');
      if (this.match) this.saveResult();
      onRoomClose(this);
    }
  };
}
