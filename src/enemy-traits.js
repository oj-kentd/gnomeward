/** Endless-only resistance/weakness variants. Ordinary skeleton colors still
 * determine their base health; these traits only modify incoming damage. */
export const ENEMY_TRAITS = Object.freeze({
  armored: Object.freeze({ id: 'armored', name: 'Armored', startWave: 25, weak: 'magic', resist: 'physical' }),
  runed: Object.freeze({ id: 'runed', name: 'Runed', startWave: 30, weak: 'poison', resist: 'magic' }),
  toxic: Object.freeze({ id: 'toxic', name: 'Toxic', startWave: 35, weak: 'physical', resist: 'poison' }),
});

const TRAIT_ORDER = Object.freeze(Object.keys(ENEMY_TRAITS));
const TOWER_DAMAGE_KINDS = Object.freeze({
  sprout: 'physical', boom: 'physical', multi: 'physical', sniper: 'physical', strawberry: 'physical',
  stun: 'magic', gravity: 'magic', crystal: 'magic', necro: 'magic',
  spore: 'poison',
});

/** ordinal counts ordinary spawns from zero each wave; bosses do not consume
 * it. One in four receives a trait. Begin with the newest unlocked trait and
 * cycle through available variants so every milestone introduces itself. */
export function traitForSpawn(wave, endless, boss, ordinal) {
  if (endless !== true || boss || !Number.isSafeInteger(wave) || wave < 25 ||
      !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal % 4 !== 0) return null;
  const available = TRAIT_ORDER.filter(id => wave >= ENEMY_TRAITS[id].startWave);
  return available[(available.length - 1 + ordinal / 4) % available.length];
}

/** Missing traits and unrecognized damage kinds leave damage unchanged. */
export function damageMultiplier(trait, kind) {
  if (typeof trait !== 'string' || !Object.hasOwn(ENEMY_TRAITS, trait)) return 1;
  const definition = ENEMY_TRAITS[trait];
  if (kind === definition.weak) return 2;
  if (kind === definition.resist) return .5;
  return 1;
}

export function damageKindForTower(type) {
  return typeof type === 'string' && Object.hasOwn(TOWER_DAMAGE_KINDS, type) ? TOWER_DAMAGE_KINDS[type] : 'physical';
}
