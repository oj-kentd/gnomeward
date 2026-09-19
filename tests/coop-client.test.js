import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoopSnapshot, coopCountdown } from '../src/multiplayer.js';
import { Match } from '../server/match.js';

function match() { const m = new Match({mode:'coop',mapId:'meadow'});m.addPlayer('host','Parent');m.addPlayer('guest','Child');return m; }
test('snapshot presentation metadata distinguishes repeated ticks without changing authoritative time', () => {
  const m = match();
  const first = applyCoopSnapshot(null, m.snapshot('garden'), 'host', 0, 100);
  const repeated = applyCoopSnapshot(first.game, m.snapshot('garden'), 'host', first.eventId, 100.2);
  assert.equal(first.multiplayer.snapshotTick, m.tick);
  assert.equal(repeated.multiplayer.snapshotTick, m.tick);
  assert.equal(repeated.multiplayer.snapshotReceivedAt, 100.2);
  assert.ok(repeated.multiplayer.snapshotSequence > first.multiplayer.snapshotSequence);
  assert.equal(repeated.game.time, m.board().time);
});
test('the updated browser still accepts 0.2.2 snapshots before an Unraid upgrade', () => {
  const m = match(), snapshot = m.snapshot('old-server');
  const board = snapshot.boards[0].state;
  delete board.necroSpellKills;
  delete board.pathSecretDiscoveries;
  delete board.profile.pathUnlocks;
  delete snapshot.autoStart;
  delete snapshot.autoCountdown;
  delete snapshot.comboVersion;
  const client = applyCoopSnapshot(null, snapshot, 'host', 0, 10);
  assert.equal(client.game.isPathUnlocked('necro', 3), false);
  assert.equal(client.game.canDiscoverNecroPath(), false);
  assert.equal(client.multiplayer.snapshotTick, snapshot.tick);
  assert.equal(client.multiplayer.snapshotReceivedAt, 10);
  assert.equal(client.multiplayer.autoSupported, false);
  assert.equal(client.multiplayer.combosSupported, false);
  assert.equal(coopCountdown(client.multiplayer, 11), null);
});
test('shared countdown is display-only, unscaled and frozen during pause or connection loss', () => {
  const m = match(), snapshot = { ...m.snapshot('garden'), autoStart: true, autoCountdown: 5, speed: 3 };
  const client = applyCoopSnapshot(null, snapshot, 'host', 0, 100);
  assert.equal(client.multiplayer.autoSupported, true);
  assert.equal(coopCountdown(client.multiplayer, 101.25), 3.75);
  assert.equal(coopCountdown(client.multiplayer, 120), 0);
  assert.equal(client.game.wave, 0, 'the browser never starts a round at zero');
  assert.equal(client.multiplayer.autoCountdown, 5, 'authoritative countdown is unchanged');
  for (const flags of [{paused:true}, {reconnecting:true}, {connected:false}]) {
    assert.equal(coopCountdown({...client.multiplayer,...flags}, 102), 5);
  }
  for (const flags of [{autoStart:false}, {autoSupported:false}, {autoCountdown:null}, {result:{reason:'defeat'}}]) {
    assert.equal(coopCountdown({...client.multiplayer,...flags}, 102), null);
  }
  const next = applyCoopSnapshot(client.game, {...snapshot, autoCountdown:2.5}, 'host', 0, 103);
  assert.equal(coopCountdown(next.multiplayer, 103.2).toFixed(1), '2.3');
});
test('co-op rendering uses personal wallets and cannot change server state or solo profile', () => {
  const m = match();
  m.command('host',{action:'place',type:'sprout',x:-4,z:0});
  const s=m.snapshot('garden');
  const host=applyCoopSnapshot(null,s,'host');
  assert.equal(host.multiplayer.combosSupported,true);
  assert.equal(host.game.gold,225);assert.equal(host.game.towers.length,1);
  assert.equal(host.game.towers[0].ownerId,'host');
  assert.equal(host.game.getStats(host.game.towers[0]).range>0,true);
  assert.equal(host.multiplayer.hostId,'host');
  const guest=applyCoopSnapshot(null,m.snapshot('garden'),'guest');
  assert.equal(guest.game.gold,325);
  host.game.gold=99999;host.game.towers[0].levels[0]=3;
  assert.equal(m.players.get('host').gold,225);assert.equal(m.board().towers[0].levels[0],0);
});
test('snapshot announcements have stable IDs and are consumed once', () => {
  const m=match();m.command('host',{action:'place',type:'sprout',x:-4,z:0});
  const first=applyCoopSnapshot(null,m.snapshot('garden'),'host');
  assert.equal(first.game.events.length,1);assert.ok(first.eventId>0);
  const repeated=applyCoopSnapshot(first.game,m.snapshot('garden'),'host',first.eventId);
  assert.equal(repeated.game.events.length,0);
  m.command('host',{action:'ready'});m.command('guest',{action:'ready'});
  const next=applyCoopSnapshot(first.game,m.snapshot('garden'),'host',first.eventId);
  assert.equal(next.game.events.filter(e=>e.type==='wave-start').length,1);
  assert.ok(next.eventId>first.eventId);
});
test('co-op rendering rejects incompatible modes and missing player seats', () => {
  const m=match();
  assert.throws(()=>applyCoopSnapshot(null,{...m.snapshot(),mode:'pvp'},'host'),/compatible/);
  assert.throws(()=>applyCoopSnapshot(null,m.snapshot(),'unknown'),/loaded/);
});

test('Strawberry encounter starts with one free guardian owned by the co-op host', () => {
  const m=new Match({mode:'coop',mapId:'strawberry'});
  assert.equal(m.board().towers.length,1);
  m.addPlayer('host','Parent');m.addPlayer('guest','Child');
  const tower=m.board().towers[0];
  assert.equal(tower.type,'strawberry');assert.equal(tower.purchaseCost,0);assert.equal(tower.ownerId,'host');
  assert.equal(m.players.get('host').gold,325);assert.equal(m.players.get('guest').gold,325);
  assert.throws(()=>m.command('guest',{action:'sell',towerId:tower.id}),/own gnomes/);
  m.command('host',{action:'sell',towerId:tower.id});
  assert.equal(m.players.get('host').gold,325);
});
test('a server-earned Strawberry reward is usable in later co-op gardens', () => {
  const locked=new Match({mode:'coop',mapId:'meadow'});
  assert.equal(locked.board().isUnlocked('strawberry'),false);
  const unlocked=new Match({mode:'coop',mapId:'meadow',unlockedRewards:['strawberry']});
  assert.equal(unlocked.board().isUnlocked('strawberry'),true);
});

test('co-op snapshots hydrate secret path unlocks, progress and direct-spell kills', () => {
  const m = new Match({ mode: 'coop', mapId: 'hollow', unlockedPaths: ['necro-echoes'] });
  m.addPlayer('host', 'Parent'); m.addPlayer('guest', 'Child');
  m.board().necroSpellKills = 12;
  m.board().pathSecretDiscoveries = ['hollow-flame', 'hollow-leaf'];
  const host = applyCoopSnapshot(null, m.snapshot('garden'), 'host');
  const guest = applyCoopSnapshot(null, m.snapshot('garden'), 'guest');
  for (const client of [host, guest]) {
    assert.equal(client.game.isPathUnlocked('necro', 3), true);
    assert.equal(client.game.isUnlocked('necro'), false);
    assert.equal(client.game.necroSpellKills, 12);
    assert.deepEqual(client.game.pathSecretDiscoveries, ['hollow-flame', 'hollow-leaf']);
  }
  host.game.profile.pathUnlocks.length = 0;
  host.game.pathSecretDiscoveries.length = 0;
  assert.equal(guest.game.isPathUnlocked('necro', 3), true);
  assert.equal(m.board().isPathUnlocked('necro', 3), true);
  assert.equal(m.board().pathSecretDiscoveries.length, 2);
});
