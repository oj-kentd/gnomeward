const recipe = (name, types, catalogVersion = 1, secret = false) => {
  const key = [...types].sort().join('-');
  return Object.freeze({ name, types: Object.freeze([...types].sort()), modelName: `gnome-fusion-${key}`, portrait: `fusion-${key}`, catalogVersion, secret });
};

export const FUSIONS = Object.freeze({
  'multi-sprout': recipe('Sproutstorm', ['multi', 'sprout']),
  'necro-sprout': recipe('Gravebloom', ['necro', 'sprout']),
  'multi-necro': recipe('Soulstorm', ['multi', 'necro']),
  'multi-necro-sprout': recipe('Trinity', ['multi', 'necro', 'sprout']),
  'boom-spore': recipe('Sporeburst', ['boom', 'spore'], 2),
  'sniper-stun': recipe('Starshot', ['sniper', 'stun'], 2),
  'gravity-strawberry': recipe('Cosmic Berry', ['gravity', 'strawberry'], 2),
  'crystal-sprout': recipe('Emerald Keeper', ['crystal', 'sprout'], 2),
  'necro-spore': recipe('Gravecap', ['necro', 'spore'], 2, true),
  'boom-strawberry': recipe('Jamquake', ['boom', 'strawberry'], 2, true),
  'gravity-stun': recipe('Eventide', ['gravity', 'stun'], 2, true),
});

export function fusionKey(types) {
  if (!Array.isArray(types) || types.some(type => typeof type !== 'string')) return null;
  const key = [...types].sort().join('-');
  return Object.hasOwn(FUSIONS, key) ? key : null;
}
