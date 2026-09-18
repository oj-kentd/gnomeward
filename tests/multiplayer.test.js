import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, validateIdentity } from '../server/match.js';
import { SECRETS } from '../src/data.js';
import { createGnomewardRoom } from '../server/room.js';

function pair(mode = 'coop', mapId = 'meadow') {
  const match = new Match({ mode, mapId });
  match.addPlayer('a', 'Alice');
  match.addPlayer('b', 'Bob');
  return match;
}
const command = (match, id, action, args = {}) => match.command(id, { action, ...args });
function start(match) { command(match, 'a', 'ready'); command(match, 'b', 'ready'); }

test('multiplayer identity and room options reject unsupported protocol or maps', () => {
  assert.equal(validateIdentity({ protocol: 1, name: ' Alice ' }), 'Alice');
  for (const options of [null, {}, { protocol: 2, name: 'A' }, { protocol: 1, name: '<b>' }, { protocol: 1, name: 'x'.repeat(25) }]) assert.throws(() => validateIdentity(options));
  assert.throws(() => new Match({ mode: 'admin', mapId: 'meadow' }));
  assert.throws(() => new Match({ mode: 'coop', mapId: 'missing' }));
});

test('co-op splits starting wallet, owns towers, and rejects forged resources and identities', () => {
  const match = pair();
  command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0, playerId: 'b', gold: 99999 });
  const tower = match.board().towers[0];
  assert.equal(tower.ownerId, 'a');
  assert.equal(match.players.get('a').gold, 225);
  assert.equal(match.players.get('b').gold, 325);
  assert.equal(match.board().gold, 550);
  for (const action of ['sell', 'upgrade', 'target']) assert.throws(() => command(match, 'b', action, { towerId: tower.id, path: 0, mode: 'last' }), /own gnomes/);
  command(match, 'a', 'target', { towerId: tower.id, mode: 'strong' });
  assert.equal(tower.targeting, 'strong');
  assert.throws(() => command(match, 'a', 'upgrade', { towerId: tower.id, path: 0, points: 1000 }));
  command(match, 'a', 'sell', { towerId: tower.id });
  assert.equal(match.players.get('a').gold, 300);
  assert.equal(match.players.get('b').gold, 325);
});

test('validation rejects locked units, bad coordinates, tower IDs, inherited keys and unknown actions', () => {
  const match = pair();
  for (const message of [null, [], { action: 'place', type: 'constructor', x: -4, z: 0 }, { action: 'place', type: 'sprout', x: NaN, z: 0 }, { action: 'place', type: 'sniper', x: -4, z: 0, unlocks: ['sniper'] }, { action: 'upgrade', towerId: '1', path: 0 }, { action: '_damage', hp: 0 }, { action: 'load', profile: {} }]) assert.throws(() => match.command('a', message));
  assert.deepEqual(match.board().profile.unlocks, []);
  assert.equal(match.board().towers.length, 0);
  assert.throws(() => match.command('forged', { action: 'ready' }));
});

test('two ready votes start one synchronized round; only host controls speed', () => {
  const match = pair();
  command(match, 'a', 'ready');
  assert.equal(match.board().wave, 0);
  command(match, 'a', 'ready');
  assert.equal(match.board().wave, 0);
  command(match, 'b', 'ready');
  assert.equal(match.board().wave, 1);
  assert.equal(match.players.get('a').ready, false);
  assert.throws(() => command(match, 'b', 'speed', { speed: 3 }));
  assert.throws(() => command(match, 'a', 'speed', { speed: 100 }));
  command(match, 'a', 'speed', { speed: 3 });
  match.step();
  assert.equal(match.tick, 1);
  assert.ok(Math.abs(match.board().time - 0.15) < 1e-7);
  assert.throws(() => command(match, 'b', 'ready'));
});

test('co-op earnings and upgrade points split equally, purchases spend only personal wallet', () => {
  const match = pair();
  start(match);
  const game = match.board();
  game._queue = [];
  match.step();
  assert.equal(game.completedWaves, 1);
  assert.equal(match.players.get('a').gold, 360);
  assert.equal(match.players.get('b').gold, 360);
  assert.equal(match.players.get('a').points, 3);
  assert.equal(game.gold, 720);
  // Seed server-earned points to inspect transaction accounting, not browser input.
  match.players.get('a').points = 10;
  match._syncWallets();
  command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0 });
  command(match, 'a', 'upgrade', { towerId: game.towers[0].id, path: 0 });
  assert.equal(match.players.get('a').points, 0);
  assert.equal(match.players.get('b').points, 3);
  assert.equal(game.points, 3);
});

test('co-op discoveries are shared and the discoverer owns the free crystal guardian', () => {
  const match = pair('coop', 'quarry');
  for (const spot of SECRETS.quarry.spots) command(match, 'b', 'discover', { id: spot.id });
  assert.ok(match.board().isUnlocked('crystal'));
  assert.equal(match.board().towers[0].ownerId, 'b');
  assert.equal(match.players.get('b').gold, 325);
  const snapshot = match.snapshot('code');
  assert.ok(snapshot.boards[0].state.profile.unlocks.includes('crystal'));
  snapshot.boards[0].state.profile.unlocks.push('sniper');
  assert.equal(match.board().isUnlocked('sniper'), false);
});

test('disconnect pauses all simulation and commands, reconnect restores same state', () => {
  const match = pair();
  start(match);
  match.step();
  const time = match.board().time;
  match.setConnected('b', false);
  match.step();
  assert.equal(match.board().time, time);
  assert.throws(() => command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0 }), /paused/);
  assert.throws(() => command(match, 'b', 'pause', { paused: false }), /connected/);
  match.setConnected('b', true);
  match.step();
  assert.ok(match.board().time > time);
  command(match, 'b', 'pause', { paused: true });
  assert.equal(match.paused, true);
  command(match, 'a', 'pause', { paused: false });
  assert.equal(match.paused, false);
});

test('co-op endless continuation requires both votes and final defeat records cleared rounds', () => {
  const match = pair();
  const game = match.board();
  game.wave = game.completedWaves = 20;
  game.status = 'won';
  command(match, 'a', 'endless');
  assert.equal(game.status, 'won');
  command(match, 'b', 'endless');
  assert.equal(game.status, 'planning');
  assert.equal(game.endless, true);
  start(match);
  game.lives = 0;
  match.step();
  assert.equal(match.result.reason, 'defeat');
  assert.equal(match.result.players[0].completedWaves, 20);
  assert.throws(() => command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0 }), /ended/);
});

test('PvP boards have separate wallets, discoveries, towers and synchronized waves', () => {
  const match = pair('pvp');
  assert.equal(match.players.get('a').gold, 650);
  command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0 });
  assert.equal(match.board('a').gold, 550);
  assert.equal(match.board('b').gold, 650);
  assert.equal(match.board('b').towers.length, 0);
  for (const spot of SECRETS.meadow.spots) command(match, 'a', 'discover', { id: spot.id });
  assert.equal(match.board('a').isUnlocked('gravity'), true);
  assert.equal(match.board('b').isUnlocked('gravity'), false);
  assert.throws(() => command(match, 'a', 'pause', { paused: true }));
  start(match);
  assert.equal(match.board('a').wave, 1);
  assert.equal(match.board('b').wave, 1);
  match.step();
  assert.deepEqual(match.board('a').enemies.map(({ id, ...enemy }) => enemy), match.board('b').enemies.map(({ id, ...enemy }) => enemy));
  match.board('a').status = 'planning';
  assert.throws(() => command(match, 'a', 'ready'));
});

test('PvP last-standing, same-tick draw, automatic endless and departure forfeit', () => {
  const match = pair('pvp');
  for (const game of match.boards.values()) { game.status = 'won'; game.wave = game.completedWaves = 20; }
  match.started = true;
  match.step();
  for (const game of match.boards.values()) assert.equal(game.endless, true);
  start(match);
  match.board('a').lives = 0;
  match.step();
  assert.equal(match.result.winnerId, 'b');
  assert.equal(match.result.reason, 'last-standing');
  const draw = pair('pvp');
  start(draw);
  for (const game of draw.boards.values()) game.lives = 0;
  draw.step();
  assert.equal(draw.result.reason, 'draw');
  const forfeit = pair('pvp');
  forfeit.leave('b');
  assert.equal(forfeit.result.reason, 'forfeit');
  assert.equal(forfeit.result.winnerId, 'a');
  assert.throws(() => forfeit.addPlayer('c', 'Replacement'));
});

test('departures end co-op and empty lobbies; invalid simulation deltas do not change state', () => {
  const match = pair();
  start(match);
  for (const dt of [NaN, Infinity, -1, 0]) match.step(dt);
  assert.equal(match.tick, 0);
  match.leave('a');
  assert.equal(match.result.reason, 'abandoned');
  const lobby = new Match({ mode: 'coop', mapId: 'meadow' });
  lobby.addPlayer('a', 'Alice');
  assert.throws(() => command(lobby, 'a', 'ready'));
  lobby.leave('a');
  assert.equal(lobby.result.reason, 'abandoned');
});

test('a combat kill splits gold and fractional upgrade points without double credit', () => {
  const match = pair();
  command(match, 'a', 'place', { type: 'sprout', x: -4, z: 0 });
  start(match);
  const game = match.board();
  game._spawnTimer = 10;
  const enemy = game._spawn('bone');
  enemy.poison = { dps: 1000, remaining: 1, sourceId: game.towers[0].id, spreadTargetsLeft: 0 };
  match.step();
  assert.equal(match.players.get('a').gold, 228);
  assert.equal(match.players.get('b').gold, 328);
  assert.equal(match.players.get('a').points, 0.5);
  assert.equal(match.players.get('b').points, 0.5);
  assert.equal(game.towers[0].kills, 1);
  match.step();
  assert.equal(match.players.get('a').points, 0.5);
});


test('capacity-rejected rooms produce no bogus results or room-close callback', () => {
  let closed = 0, saved = 0;
  const RoomType = createGnomewardRoom({ onRoomClose: () => closed++ });
  const context = { registered: false, match: pair(), saveResult: () => saved++ };
  RoomType.prototype.onDispose.call(context);
  assert.equal(saved, 0);
  assert.equal(closed, 0);
  assert.equal(context.match.result, null);
  context.registered = true;
  RoomType.prototype.onDispose.call(context);
  assert.equal(saved, 1);
  assert.equal(closed, 1);
  assert.equal(context.match.result.reason, 'server-closed');
});

test('graceful server shutdown records server-closed before leave can award a forfeit', () => {
  let saved = 0, sent = 0, disconnected = 0;
  const RoomType = createGnomewardRoom();
  const context = {
    registered: true, match: pair('pvp'),
    saveResult: () => saved++, sendSnapshot: () => sent++,
    disconnect: () => { disconnected++; return Promise.resolve(); },
  };
  RoomType.prototype.onBeforeShutdown.call(context);
  context.match.leave('a');
  assert.equal(context.match.result.reason, 'server-closed');
  assert.equal(context.match.result.winnerId, null);
  assert.equal(saved, 1);
  assert.equal(sent, 1);
  assert.equal(disconnected, 1);
});


test('snapshot backpressure skips blocked sockets and terminates persistent blockage', () => {
  const RoomType = createGnomewardRoom();
  const sends = [], terminated = [];
  const client = (id, bufferedAmount = 0) => ({
    sessionId: id,
    ref: { bufferedAmount, terminate: () => terminated.push(id) },
    send: (type, payload) => sends.push({ id, type, payload }),
  });
  const a = client('a', 1024 * 1024 + 1), b = client('b');
  const context = { match: pair(), roomId: 'test', clients: [a, b], pendingJoins: new Map(), backpressure: new Map() };
  RoomType.prototype.sendSnapshot.call(context);
  assert.deepEqual(sends.map(s => s.id), ['b']);
  assert.equal(context.backpressure.has('a'), true);
  assert.deepEqual(terminated, []);
  context.backpressure.set('a', Date.now() - 10_001);
  // An explicitly requested snapshot uses exactly the same guard.
  RoomType.prototype.sendSnapshot.call(context, a);
  assert.deepEqual(sends.map(s => s.id), ['b']);
  assert.deepEqual(terminated, ['a']);
  assert.equal(context.backpressure.has('a'), false);
});

test('recovered snapshot sockets clear their blockage timer and resume sending', () => {
  const RoomType = createGnomewardRoom();
  let sent = 0, terminated = 0;
  const client = { sessionId: 'a', ref: { bufferedAmount: 1024 * 1024, terminate: () => terminated++ }, send: () => sent++ };
  const context = { match: pair(), roomId: 'test', clients: [client], pendingJoins: new Map(), backpressure: new Map([['a', Date.now() - 20_000]]) };
  RoomType.prototype.sendSnapshot.call(context, client);
  assert.equal(sent, 1);
  assert.equal(terminated, 0);
  assert.equal(context.backpressure.size, 0);
});


test('pre-join snapshots queue once and an unacknowledged handshake expires', () => {
  const RoomType = createGnomewardRoom();
  let terminated = 0;
  const client = {
    sessionId: 'a', _enqueuedMessages: [],
    ref: { bufferedAmount: 0, terminate: () => terminated++ },
    send(type, payload) { this._enqueuedMessages.push({ type, payload }); },
  };
  const context = { match: pair(), roomId: 'test', clients: [client], pendingJoins: new Map(), backpressure: new Map() };
  RoomType.prototype.sendSnapshot.call(context);
  for (let i = 0; i < 20; i++) RoomType.prototype.sendSnapshot.call(context, client);
  assert.equal(client._enqueuedMessages.length, 1);
  assert.equal(terminated, 0);
  context.pendingJoins.set('a', Date.now() - 10_001);
  RoomType.prototype.sendSnapshot.call(context);
  assert.equal(terminated, 1);
  assert.equal(client._enqueuedMessages.length, 1);
});

test('JOIN_ROOM acknowledgement releases the initial snapshot gate', () => {
  const RoomType = createGnomewardRoom();
  let sent = 0, terminated = 0;
  const client = { sessionId: 'a', _enqueuedMessages: [], ref: { bufferedAmount: 0, terminate: () => terminated++ }, send: () => sent++ };
  const context = { match: pair(), roomId: 'test', clients: [client], pendingJoins: new Map(), backpressure: new Map() };
  RoomType.prototype.sendSnapshot.call(context);
  assert.equal(sent, 1);
  delete client._enqueuedMessages; // Colyseus removes this field after the ACK.
  RoomType.prototype.sendSnapshot.call(context);
  assert.equal(sent, 2);
  assert.equal(context.pendingJoins.size, 0);
  assert.equal(terminated, 0);
});

test('encounter reward retries a temporary write failure without duplicate parallel writes', async () => {
  let calls=0;
  const RoomType=createGnomewardRoom({onRewardUnlocked:async () => { calls++; if(calls===1)throw new Error('temporary write failure'); }});
  const context={match:{mapId:'strawberry',boards:new Map([[null,{completedWaves:20,profile:{unlocks:['strawberry']}}]])}};
  await Promise.all([RoomType.prototype.saveEncounterReward.call(context),RoomType.prototype.saveEncounterReward.call(context)]);
  assert.equal(calls,1);assert.equal(!!context.rewardSaved,false);assert.equal(context.rewardPending,false);
  await RoomType.prototype.saveEncounterReward.call(context);
  assert.equal(calls,1,'wait before retrying');
  context.rewardRetryAt=0;
  await RoomType.prototype.saveEncounterReward.call(context);
  assert.equal(context.rewardSaved,true);assert.equal(calls,2);
  await RoomType.prototype.saveEncounterReward.call(context);
  assert.equal(calls,2);
});

test('manual co-op pause permits owned building and upgrades while combat time stays still', () => {
  const m=pair();
  command(m,'a','place',{type:'sprout',x:-4,z:0});
  start(m);
  command(m,'a','pause',{paused:true});
  const time=m.board().time;
  m.players.get('a').points=20;
  const tower=m.board().towers[0];
  command(m,'a','upgrade',{towerId:tower.id,path:0});
  assert.equal(tower.levels[0],1);assert.equal(m.players.get('a').points,10);
  command(m,'b','place',{type:'sprout',x:2,z:0});
  assert.equal(m.board().towers.length,2);
  command(m,'a','target',{towerId:tower.id,mode:'strong'});
  assert.equal(tower.targeting,'strong');
  assert.throws(()=>command(m,'b','sell',{towerId:tower.id}),/own gnomes/);
  m.step();assert.equal(m.board().time,time);
  command(m,'a','sell',{towerId:tower.id});
  assert.equal(m.board().towers.length,1);
});
