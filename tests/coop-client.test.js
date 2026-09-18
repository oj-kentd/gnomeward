import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoopSnapshot } from '../src/multiplayer.js';
import { Match } from '../server/match.js';

function match() { const m = new Match({mode:'coop',mapId:'meadow'});m.addPlayer('host','Parent');m.addPlayer('guest','Child');return m; }
test('co-op rendering uses personal wallets and cannot change server state or solo profile', () => {
  const m = match();
  m.command('host',{action:'place',type:'sprout',x:-4,z:0});
  const s=m.snapshot('garden');
  const host=applyCoopSnapshot(null,s,'host');
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
