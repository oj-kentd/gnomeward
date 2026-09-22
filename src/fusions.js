const recipe = (name, types) => {
  const key = [...types].sort().join('-');
  return Object.freeze({ name, types: Object.freeze([...types].sort()), modelName: `gnome-fusion-${key}`, portrait: `fusion-${key}` });
};

export const FUSIONS = Object.freeze({
  'multi-sprout': recipe('Sproutstorm', ['multi', 'sprout']),
  'necro-sprout': recipe('Gravebloom', ['necro', 'sprout']),
  'multi-necro': recipe('Soulstorm', ['multi', 'necro']),
  'multi-necro-sprout': recipe('Trinity', ['multi', 'necro', 'sprout']),
});

export function fusionKey(types) {
  if (!Array.isArray(types) || types.some(type => typeof type !== 'string')) return null;
  const key = [...types].sort().join('-');
  return Object.hasOwn(FUSIONS, key) ? key : null;
}
