// Round Coins belong to the browser's collection, separate from a garden's gold.
export const MAX_ROUND_COINS = 1_000_000_000;
const MAX_RECEIPTS = 128;
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_ROUND_COINS;
const validReceipt = key => typeof key === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);

export const COSTUMES = Object.freeze([
  Object.freeze({ itemId: 'necro-skeletor', towerType: 'necro', skin: 'skeletor', profileKey: 'equippedNecroSkin', modelName: 'gnome-necro-skeletor', portrait: 'necro-skeletor' }),
  Object.freeze({ itemId: 'boom-orange-knight', towerType: 'boom', skin: 'orange-knight', profileKey: 'equippedBoomSkin', modelName: 'gnome-boom-orange-knight', portrait: 'boom-orange-knight' }),
  Object.freeze({ itemId: 'sprout-skeleton', towerType: 'sprout', skin: 'skeleton', profileKey: 'equippedSproutSkin', modelName: 'gnome-sprout-skeleton', portrait: 'sprout-skeleton' }),
]);

export const SHOP_ITEMS = Object.freeze([
  Object.freeze({ id: 'necro-skeletor', name: 'Skeletor Morrow', cost: 100, description: 'A skull-faced, purple-hooded look for Morrow. Cosmetic only; discover Morrow to use it.' }),
  Object.freeze({ id: 'boom-orange-knight', name: 'Orange Knight Bramble', cost: 100, description: 'Orange armor and a knight’s helmet for Bramble. Cosmetic only; the same explosive guardian underneath.' }),
  Object.freeze({ id: 'sprout-skeleton', name: 'Skeleton Sprout', cost: 100, description: 'skeleton vs skeletons who wins ???' }),
  Object.freeze({ id: 'boss-damage', name: 'Boss Breaker', cost: 50, description: 'Permanently doubles your gnomes’ damage against bosses, including poison and summoned guardians.' }),
]);

export function getTowerSkin(profile, type) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Array.isArray(profile.cosmetics)) return null;
  const costume = COSTUMES.find(costume => costume.towerType === type && costume.skin === profile[costume.profileKey] && profile.cosmetics.includes(costume.itemId));
  return costume?.skin || null;
}

export function normalizeEconomy(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  profile.roundCoins = validCount(profile.roundCoins) ? profile.roundCoins : 0;
  profile.cosmetics = [...new Set((Array.isArray(profile.cosmetics) ? profile.cosmetics : []).filter(id => COSTUMES.some(costume => costume.itemId === id)))];
  profile.bossDamageUnlocked = profile.bossDamageUnlocked === true;
  for (const costume of COSTUMES) profile[costume.profileKey] = getTowerSkin(profile, costume.towerType);
  const ledger = profile.coopRoundReceipts;
  profile.coopRoundReceipts = Object.fromEntries(
    (ledger && typeof ledger === 'object' && !Array.isArray(ledger) ? Object.entries(ledger) : [])
      .filter(([key, value]) => validReceipt(key) && validCount(value)).slice(-MAX_RECEIPTS),
  );
  return profile;
}

export function buyShopItem(profile, id) {
  if (!normalizeEconomy(profile)) return false;
  const item = SHOP_ITEMS.find(item => item.id === id);
  if (!item || profile.roundCoins < item.cost) return false;
  if (id === 'boss-damage' ? profile.bossDamageUnlocked : profile.cosmetics.includes(id)) return false;
  profile.roundCoins -= item.cost;
  if (id === 'boss-damage') profile.bossDamageUnlocked = true;
  else profile.cosmetics.push(id);
  return true;
}

export function equipTowerSkin(profile, type, skin) {
  if (!normalizeEconomy(profile)) return false;
  const costume = COSTUMES.find(costume => costume.towerType === type && (skin === null || costume.skin === skin));
  if (!costume || (skin !== null && !profile.cosmetics.includes(costume.itemId))) return false;
  profile[costume.profileKey] = skin;
  return true;
}

export function equipNecroSkin(profile, skin) {
  return equipTowerSkin(profile, 'necro', skin);
}

// A room/run receipt carries a cumulative count, so refreshes, duplicate packets,
// and out-of-order snapshots cannot pay for the same completed rounds again.
export function applyCoopRoundReward(profile, receiptKey, completedWaves) {
  if (!normalizeEconomy(profile) || !validReceipt(receiptKey) || !validCount(completedWaves)) return 0;
  const previous = profile.coopRoundReceipts[receiptKey] || 0;
  const delta = Math.max(0, completedWaves - previous);
  delete profile.coopRoundReceipts[receiptKey];
  profile.coopRoundReceipts[receiptKey] = Math.max(previous, completedWaves);
  const keys = Object.keys(profile.coopRoundReceipts);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_RECEIPTS))) delete profile.coopRoundReceipts[key];
  const awarded = Math.min(delta, MAX_ROUND_COINS - profile.roundCoins);
  profile.roundCoins += awarded;
  return awarded;
}
