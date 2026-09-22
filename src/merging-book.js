import { FUSIONS } from './fusions.js';
import { TOWERS } from './data.js';
import { PRISMSTORM } from './combos.js';

export const BOOK_LOCATION = Object.freeze({ id: 'merging-book', mapId: 'creek', x: 9.65, z: 5.75 });

const pairHints = {
  'multi-sprout': 'A little green courage meets a whirlwind of surprises.',
  'necro-sprout': 'New growth stirs where the old garden sleeps.',
  'multi-necro': 'Many little surprises answer a whisper from the cottage.',
  'multi-necro-sprout': 'Three familiar hearts can beat beneath one hat.',
};
const path = (type, index) => `${TOWERS[type].name}: ${TOWERS[type].paths[index].name} 3`;
const freezeEntry = entry => Object.freeze({ ...entry, types: Object.freeze([...entry.types]) });

export const BOOK_ENTRIES = Object.freeze([
  ...Object.entries(FUSIONS).map(([id, fusion]) => freezeEntry({
    id, kind: 'fusion', name: fusion.name, types: fusion.types, portrait: fusion.portrait,
    hint: pairHints[id],
    recipe: fusion.types.length === 3
      ? 'Merge Sproutstorm with Morrow, Gravebloom with Tumble, or Soulstorm with Sprout. Each guardian must belong to you; no upgrade tiers are required.'
      : `Merge ${fusion.types.map(type => TOWERS[type].name).join(' + ')} using the selected gnome’s Merge controls. Both guardians must belong to you; no upgrade tiers are required.`,
    description: `Every member keeps their attacks and upgrades in one form. Costumes are put aside for this game.${fusion.types.includes('necro') ? ' Direct attack defeats from any member call Morrow’s reborn guardians; helper defeats never summon more helpers.' : ''}${fusion.types.includes('multi') ? ' Purchased Turbo Tumble triples every member’s attack speed, without speeding up guardian dispatch or helper attacks.' : ''}`,
  })),
  freezeEntry({
    id: 'sporefire', kind: 'combo', name: 'Sporefire', types: ['spore', 'boom'],
    hint: 'Something growing on the trail is waiting for a spark.',
    recipe: `${path('spore', 3)} + ${path('boom', 1)}. Let a skeleton catch poison from Morel’s upgraded mushrooms, then hit that still-poisoned skeleton with a direct Bramble acorn.`,
    description: 'The poisoned target erupts in a spreading burst that damages nearby skeletons. Explosions alone cannot trigger it; the same target needs a short recovery before another burst.',
  }),
  freezeEntry({
    id: 'prismstorm', kind: 'combo', name: 'Prismstorm', types: ['multi', 'crystal'],
    hint: 'A whirlwind finds its reflection in shattered light.',
    recipe: `${path('multi', 0)} + ${path('crystal', 1)}. Place Tumble within ${PRISMSTORM.partnerRange} map units of Prism, then let Tumble attack skeletons in range. A merged form containing Tumble also works.`,
    description: 'Tumble periodically launches magical crystal shards that ricochet between skeletons. The special volley has its own recovery time between bursts.',
  }),
  freezeEntry({
    id: 'berry-singularity', kind: 'combo', name: 'Berry Singularity', types: ['strawberry', 'gravity'],
    hint: 'A fallen fruit dreams of stars in a place where nothing escapes.',
    recipe: `${path('strawberry', 1)} + ${path('gravity', 0)}. A strawberry must land inside one of Orbit’s active, capturing black holes. The gnomes themselves do not have to stand beside each other.`,
    description: 'Seeds orbit the black hole, then shoot outward as powerful piercing shrapnel. Each hole briefly recovers before it can charge another strawberry.',
  }),
]);

const fusionIds = new Set(BOOK_ENTRIES.filter(entry => entry.kind === 'fusion').map(entry => entry.id));
const comboIds = new Set(BOOK_ENTRIES.filter(entry => entry.kind === 'combo').map(entry => entry.id));
const validProfile = profile => profile && typeof profile === 'object' && !Array.isArray(profile);
const validIds = (value, allowed) => [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && allowed.has(id)))];
const sameArray = (a, b) => Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);

export function normalizeBook(profile) {
  if (!validProfile(profile)) profile = {};
  profile.mergingBookFound = profile.mergingBookFound === true;
  profile.fusionDiscoveries = validIds(profile.fusionDiscoveries, fusionIds);
  profile.comboDiscoveries = validIds(profile.comboDiscoveries, comboIds);
  return profile;
}

export function discoverBook(profile) {
  if (!validProfile(profile)) return false;
  normalizeBook(profile);
  if (profile.mergingBookFound) return false;
  profile.mergingBookFound = true;
  return true;
}

export function recordBookDiscoveries(profile, game, events = []) {
  if (!validProfile(profile)) return false;
  const previous = { found: profile.mergingBookFound, fusions: profile.fusionDiscoveries, combos: profile.comboDiscoveries };
  normalizeBook(profile);
  const fusions = new Set(profile.fusionDiscoveries), combos = new Set(profile.comboDiscoveries);
  for (const tower of Array.isArray(game?.towers) ? game.towers : []) {
    if (!tower || typeof tower !== 'object') continue;
    if (tower.fusionParentId == null && fusionIds.has(tower.fusionKey)) fusions.add(tower.fusionKey);
    const active = tower.comboActive;
    if (comboIds.has(active?.kind) && Number.isFinite(game?.time) && Number.isFinite(active.until) && active.until > game.time &&
        (!Number.isFinite(active.startedAt) || active.startedAt <= game.time)) combos.add(active.kind);
  }
  for (const id of Array.isArray(game?.comboDiscoveries) ? game.comboDiscoveries : []) if (comboIds.has(id)) combos.add(id);
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type === 'merged' && fusionIds.has(event.fusionKey)) fusions.add(event.fusionKey);
    if (event?.type === 'combo' && comboIds.has(event.combo)) combos.add(event.combo);
  }
  profile.fusionDiscoveries = [...fusions];
  profile.comboDiscoveries = [...combos];
  return previous.found !== profile.mergingBookFound || !sameArray(previous.fusions, profile.fusionDiscoveries) || !sameArray(previous.combos, profile.comboDiscoveries);
}

export function bookEntryDiscovered(profile, entry) {
  const known = BOOK_ENTRIES.find(candidate => candidate.id === (typeof entry === 'string' ? entry : entry?.id));
  if (!known || !validProfile(profile)) return false;
  const collection = known.kind === 'fusion' ? profile.fusionDiscoveries : profile.comboDiscoveries;
  return Array.isArray(collection) && collection.includes(known.id);
}
