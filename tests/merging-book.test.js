import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWERS } from '../src/data.js';
import { FUSIONS } from '../src/fusions.js';
import { BOOK_LOCATION, BOOK_ENTRIES, normalizeBook, discoverBook, recordBookDiscoveries, bookEntryDiscovered } from '../src/merging-book.js';

test('the hidden book catalogs all four forms and three special combinations', () => {
  assert.deepEqual(BOOK_LOCATION, { id: 'merging-book', mapId: 'creek', x: 9.65, z: 5.75 });
  assert.equal(BOOK_ENTRIES.length, 7);
  assert.equal(new Set(BOOK_ENTRIES.map(entry => entry.id)).size, 7);
  assert.deepEqual(BOOK_ENTRIES.filter(entry => entry.kind === 'fusion').map(entry => entry.id).sort(), Object.keys(FUSIONS).sort());
  assert.deepEqual(BOOK_ENTRIES.filter(entry => entry.kind === 'combo').map(entry => entry.id).sort(), ['berry-singularity', 'prismstorm', 'sporefire']);
  for (const entry of BOOK_ENTRIES) {
    assert.ok(entry.name && entry.hint && entry.recipe && entry.description);
    assert.ok(entry.types.every(type => TOWERS[type]));
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.types));
    assert.ok(!entry.hint.includes(entry.name), 'undiscovered hint does not reveal the entry name');
    if (entry.kind === 'fusion') assert.equal(entry.portrait, FUSIONS[entry.id].portrait);
  }
});

test('normalizing old or malformed profiles only adds safe book fields', () => {
  const profile = { unlocks: ['necro'], pathUnlocks: ['necro-echoes'], roundCoins: 125, cosmetics: ['necro-skeletor'] };
  const existing = structuredClone(profile);
  assert.equal(normalizeBook(profile), profile);
  assert.deepEqual(profile, { ...existing, mergingBookFound: false, fusionDiscoveries: [], comboDiscoveries: [] });
  profile.mergingBookFound = 'true';
  profile.fusionDiscoveries = ['multi-sprout', 'multi-sprout', 'sporefire', '__proto__', null, {}, 1];
  profile.comboDiscoveries = ['sporefire', 'sporefire', 'multi-necro', 'unknown', true];
  normalizeBook(profile);
  assert.equal(profile.mergingBookFound, false);
  assert.deepEqual(profile.fusionDiscoveries, ['multi-sprout']);
  assert.deepEqual(profile.comboDiscoveries, ['sporefire']);
  for (const invalid of [null, undefined, false, 3, 'profile', []]) {
    assert.deepEqual(normalizeBook(invalid), { mergingBookFound: false, fusionDiscoveries: [], comboDiscoveries: [] });
    assert.equal(discoverBook(invalid), false);
    assert.equal(recordBookDiscoveries(invalid, {}), false);
  }
});

test('finding the book is permanent, idempotent, and grants no gameplay unlocks', () => {
  const profile = { unlocks: [], pathUnlocks: [], roundCoins: 9 };
  assert.equal(discoverBook(profile), true);
  assert.equal(discoverBook(profile), false);
  const reloaded = JSON.parse(JSON.stringify(profile));
  assert.equal(discoverBook(reloaded), false);
  assert.equal(reloaded.mergingBookFound, true);
  assert.deepEqual(reloaded.unlocks, []);
  assert.deepEqual(reloaded.pathUnlocks, []);
  assert.equal(reloaded.roundCoins, 9);
});

test('discoveries made before finding the book survive reload without repeated writes', () => {
  const profile = normalizeBook({});
  const game = new Game();
  const sprout = game._makeTower('sprout', 0, 0, 100);
  const tumble = game._makeTower('multi', 2, 0, 290);
  game.mergeTowers(sprout.id, tumble.id);
  game._announceCombo('prismstorm', 'A discovery');
  assert.equal(recordBookDiscoveries(profile, game, game.events), true);
  assert.equal(profile.mergingBookFound, false);
  assert.equal(bookEntryDiscovered(profile, 'multi-sprout'), true);
  assert.equal(bookEntryDiscovered(profile, BOOK_ENTRIES.find(entry => entry.id === 'prismstorm')), true);
  assert.equal(bookEntryDiscovered(profile, 'berry-singularity'), false);
  assert.equal(recordBookDiscoveries(profile, game, game.events), false);
  const reloaded = normalizeBook(JSON.parse(JSON.stringify(profile)));
  assert.equal(recordBookDiscoveries(reloaded, game, game.events), false);
  assert.equal(discoverBook(reloaded), true);
  assert.deepEqual(reloaded.fusionDiscoveries, ['multi-sprout']);
  assert.deepEqual(reloaded.comboDiscoveries, ['prismstorm']);
});

test('co-op board observation records teammate forms and active combo markers in the local collection', () => {
  const local = normalizeBook({ roundCoins: 23, unlocks: [] });
  const board = {
    time: 12, profile: { unlocks: ['necro'] },
    towers: [
      { id: 1, ownerId: 'teammate', type: 'necro', fusionKey: 'necro-sprout' },
      { id: 2, ownerId: 'teammate', type: 'sprout', fusionParentId: 1 },
      { id: 3, ownerId: 'teammate', type: 'multi', comboActive: { kind: 'prismstorm', startedAt: 11, until: 14 } },
    ],
  };
  const original = structuredClone(board);
  assert.equal(recordBookDiscoveries(local, board), true);
  assert.deepEqual(local.fusionDiscoveries, ['necro-sprout']);
  assert.deepEqual(local.comboDiscoveries, ['prismstorm']);
  assert.equal(local.roundCoins, 23);
  assert.deepEqual(local.unlocks, []);
  assert.deepEqual(board, original, 'observations must never mutate authoritative game or server profile');
  assert.equal(recordBookDiscoveries(local, structuredClone(board)), false);
});

test('all seven entries can be learned from validated events even after actors leave the board', () => {
  const profile = normalizeBook({});
  const events = BOOK_ENTRIES.map(entry => entry.kind === 'fusion'
    ? { type: 'merged', fusionKey: entry.id }
    : { type: 'combo', combo: entry.id });
  assert.equal(recordBookDiscoveries(profile, { towers: [], comboDiscoveries: [] }, events), true);
  for (const entry of BOOK_ENTRIES) assert.equal(bookEntryDiscovered(profile, entry), true);
  assert.equal(recordBookDiscoveries(profile, {}, events), false);
  assert.equal(profile.fusionDiscoveries.length, 4);
  assert.equal(profile.comboDiscoveries.length, 3);
  assert.equal(bookEntryDiscovered(profile, 'unknown'), false);
  assert.equal(bookEntryDiscovered(null, BOOK_ENTRIES[0]), false);
});

test('expired, future, malformed and unknown markers or mismatched event kinds reveal nothing', () => {
  const profile = normalizeBook({});
  const board = { time: 10, towers: [
    { fusionKey: 'multi-sprout', fusionParentId: 50 },
    { fusionKey: 'sporefire' },
    { comboActive: { kind: 'sporefire', until: 10 } },
    { comboActive: { kind: 'prismstorm', until: 9 } },
    { comboActive: { kind: 'berry-singularity', startedAt: 20, until: 23 } },
    { comboActive: { kind: 'sporefire', until: Infinity } },
    { comboActive: { kind: 'sporefire', until: '12' } },
    { comboActive: { kind: 'made-up-combo', until: 12 } },
    { type: 'multi', levels: [3] },
    { type: 'crystal', levels: [0, 3, 0, 0] },
    null,
  ], comboDiscoveries: ['multi-sprout', 'made-up-combo', null] };
  const events = [
    { type: 'merged', fusionKey: 'sporefire' },
    { type: 'combo', combo: 'multi-necro' },
    { type: 'unrelated', combo: 'sporefire', fusionKey: 'multi-sprout' },
    { type: 'combo', message: 'Sporefire' }, null,
  ];
  assert.equal(recordBookDiscoveries(profile, board, events), false);
  assert.deepEqual(profile.fusionDiscoveries, []);
  assert.deepEqual(profile.comboDiscoveries, []);
  assert.equal(recordBookDiscoveries(profile, { time: NaN, towers: [{ comboActive: { kind: 'sporefire', until: 12 } }] }), false);
});

test('runtime combo history learns legitimate past discoveries without active effects', () => {
  const profile = normalizeBook({});
  assert.equal(recordBookDiscoveries(profile, { comboDiscoveries: ['sporefire', 'sporefire', 'prismstorm'] }), true);
  assert.deepEqual(profile.comboDiscoveries, ['sporefire', 'prismstorm']);
  assert.equal(recordBookDiscoveries(profile, null, null), false);
});

test('disclosed recipes name the exact tier-three paths and actual activation conditions', () => {
  const entries = Object.fromEntries(BOOK_ENTRIES.map(entry => [entry.id, entry]));
  for (const [id, requirements] of [
    ['sporefire', [['spore', 3], ['boom', 1]]],
    ['prismstorm', [['multi', 0], ['crystal', 1]]],
    ['berry-singularity', [['strawberry', 1], ['gravity', 0]]],
  ]) {
    for (const [type, index] of requirements) assert.ok(entries[id].recipe.includes(`${TOWERS[type].paths[index].name} 3`));
    assert.equal((entries[id].recipe.match(/ 3\b/g) || []).length, 2);
  }
  assert.match(entries.sporefire.recipe, /still-poisoned.*direct Bramble acorn/);
  assert.match(entries.prismstorm.recipe, /within 7 map units/);
  assert.match(entries['berry-singularity'].recipe, /land inside.*active, capturing black holes/);
  assert.match(entries['multi-necro-sprout'].recipe, /Sproutstorm with Morrow, Gravebloom with Tumble, or Soulstorm with Sprout/);
  assert.ok(BOOK_ENTRIES.filter(entry => entry.kind === 'fusion').every(entry => entry.recipe.includes('no upgrade tiers are required')));
});
