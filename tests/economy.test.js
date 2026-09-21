import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { SHOP_ITEMS, COSTUMES, MAX_ROUND_COINS, normalizeEconomy, buyShopItem, equipNecroSkin, getTowerSkin, equipTowerSkin, applyCoopRoundReward } from '../src/economy.js';

const clearRound = game => {
  assert.equal(game.startWave(), true);
  game._queue = [];
  game.enemies = [];
  game.update(.05);
};

test('legacy and malformed saves normalize economy without changing earned unlocks', () => {
  for (const value of [undefined, null, -1, 1.5, Infinity, NaN, '100', MAX_ROUND_COINS + 1, {}, []]) {
    const profile = { unlocks: ['necro'], roundCoins: value, cosmetics: ['fake'], bossDamageUnlocked: 'true', equippedNecroSkin: 'skeletor', coopRoundReceipts: [] };
    normalizeEconomy(profile);
    assert.equal(profile.roundCoins, 0);
    assert.equal(profile.bossDamageUnlocked, false);
    assert.equal(profile.equippedNecroSkin, null);
    assert.deepEqual(profile.cosmetics, []);
    assert.deepEqual(profile.coopRoundReceipts, {});
    assert.deepEqual(profile.unlocks, ['necro']);
  }
  for (const value of [null, undefined, [], 1, 'profile']) assert.equal(normalizeEconomy(value), null);
  assert.equal(new Game('meadow', []).profile.roundCoins, 0);
});

test('catalog cannot be mutated and purchases charge exactly once', () => {
  assert.ok(Object.isFrozen(SHOP_ITEMS));
  assert.ok(SHOP_ITEMS.every(Object.isFrozen));
  const profile = { roundCoins: 200 };
  assert.equal(buyShopItem(profile, 'boss-damage'), true);
  assert.equal(profile.roundCoins, 150);
  assert.equal(buyShopItem(profile, 'boss-damage'), false);
  assert.equal(profile.roundCoins, 150);
  assert.equal(buyShopItem(profile, 'necro-skeletor'), true);
  assert.equal(profile.roundCoins, 50);
  assert.equal(buyShopItem(profile, 'necro-skeletor'), false);
  assert.equal(profile.roundCoins, 50);
});

test('insufficient coins and unknown items cannot purchase anything', () => {
  const profile = { roundCoins: 49 };
  for (const id of ['boss-damage', 'necro-skeletor', 'unknown', '__proto__', null, ['boss-damage']]) assert.equal(buyShopItem(profile, id), false);
  assert.equal(profile.roundCoins, 49);
  assert.deepEqual(profile.cosmetics, []);
  assert.equal(profile.bossDamageUnlocked, false);
});

test('skins equip only when owned and never unlock Morrow or change its stats', () => {
  const profile = { roundCoins: 100 };
  assert.equal(equipNecroSkin(profile, 'skeletor'), false);
  assert.equal(buyShopItem(profile, 'necro-skeletor'), true);
  assert.equal(equipNecroSkin(profile, 'skeletor'), true);
  const game = new Game('meadow', profile);
  assert.equal(game.isUnlocked('necro'), false);
  assert.equal(game.placeTower('necro', -4, 0), null);
  profile.unlocks.push('necro');
  const dressed = game.placeTower('necro', -4, 0);
  assert.equal(dressed.skin, 'skeletor');
  const normal = new Game('meadow', { unlocks: ['necro'] }).placeTower('necro', -4, 0);
  assert.deepEqual(game.getStats(dressed), game.getStats(normal));
  assert.equal(equipNecroSkin(profile, null), true);
  assert.equal(profile.equippedNecroSkin, null);
  assert.equal(equipNecroSkin(profile, 'fake'), false);
});

test('new costumes each cost 100 coins and preserve the requested Sprout description', () => {
  assert.ok(Object.isFrozen(COSTUMES));
  assert.ok(COSTUMES.every(Object.isFrozen));
  for (const [id, name] of [['boom-orange-knight', 'Orange Knight Bramble'], ['sprout-skeleton', 'Skeleton Sprout']]) {
    const item = SHOP_ITEMS.find(item => item.id === id);
    assert.equal(item.cost, 100);
    assert.equal(item.name, name);
    const profile = { roundCoins: 199 };
    assert.equal(buyShopItem(profile, id), true);
    assert.equal(profile.roundCoins, 99);
    assert.equal(buyShopItem(profile, id), false);
    profile.roundCoins = 100;
    assert.equal(buyShopItem(profile, id), false);
    assert.equal(profile.roundCoins, 100);
  }
  assert.equal(SHOP_ITEMS.find(item => item.id === 'sprout-skeleton').description, 'skeleton vs skeletons who wins ???');
});

test('costume migration preserves Morrow, removes unknown ownership, and deduplicates all known costumes', () => {
  const legacy = { roundCoins: 23, cosmetics: ['necro-skeletor'], equippedNecroSkin: 'skeletor', bossDamageUnlocked: true };
  normalizeEconomy(legacy);
  assert.equal(legacy.roundCoins, 23);
  assert.equal(getTowerSkin(legacy, 'necro'), 'skeletor');
  assert.equal(legacy.equippedBoomSkin, null);
  assert.equal(legacy.equippedSproutSkin, null);
  assert.equal(legacy.bossDamageUnlocked, true);
  legacy.cosmetics.push('sprout-skeleton', 'sprout-skeleton', 'boom-orange-knight', '__proto__', 'unknown', ['necro-skeletor']);
  legacy.equippedBoomSkin = 'orange-knight'; legacy.equippedSproutSkin = 'skeleton';
  const game = new Game('meadow', JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(game.profile.cosmetics, ['necro-skeletor', 'sprout-skeleton', 'boom-orange-knight']);
  assert.equal(getTowerSkin(game.profile, 'necro'), 'skeletor');
  assert.equal(getTowerSkin(game.profile, 'boom'), 'orange-knight');
  assert.equal(getTowerSkin(game.profile, 'sprout'), 'skeleton');
  assert.equal(game.profile.roundCoins, 23);
});

test('costumes require matching ownership and cannot be equipped on other tower types', () => {
  const profile = { cosmetics: ['sprout-skeleton'], equippedBoomSkin: 'orange-knight', equippedSproutSkin: 'skeleton' };
  assert.equal(getTowerSkin(profile, 'boom'), null);
  assert.equal(equipTowerSkin(profile, 'boom', 'orange-knight'), false);
  assert.equal(profile.equippedBoomSkin, null);
  assert.equal(equipTowerSkin(profile, 'boom', 'skeleton'), false);
  assert.equal(equipTowerSkin(profile, 'sprout', 'orange-knight'), false);
  assert.equal(equipTowerSkin(profile, 'spore', 'skeleton'), false);
  assert.equal(equipTowerSkin(profile, 'spore', null), false);
  assert.equal(equipTowerSkin(profile, 'sprout', 'skeleton'), true);
  for (const bad of [null, undefined, [], 0, 'profile']) assert.equal(getTowerSkin(bad, 'sprout'), null);
  for (const type of [null, undefined, '__proto__', ['sprout']]) assert.equal(getTowerSkin(profile, type), null);
});

test('all three costume selections equip independently and survive purchases and serialization', () => {
  let profile = { roundCoins: 350 };
  for (const costume of COSTUMES) {
    assert.equal(buyShopItem(profile, costume.itemId), true);
    assert.equal(equipTowerSkin(profile, costume.towerType, costume.skin), true);
  }
  assert.equal(buyShopItem(profile, 'boss-damage'), true);
  assert.equal(profile.roundCoins, 0);
  profile = new Game('quarry', JSON.parse(JSON.stringify(profile))).profile;
  for (const costume of COSTUMES) assert.equal(getTowerSkin(profile, costume.towerType), costume.skin);
  assert.equal(equipTowerSkin(profile, 'boom', null), true);
  assert.equal(getTowerSkin(profile, 'boom'), null);
  assert.equal(getTowerSkin(profile, 'sprout'), 'skeleton');
  assert.equal(getTowerSkin(profile, 'necro'), 'skeletor');
  assert.equal(profile.bossDamageUnlocked, true);
});

test('placed Bramble and Sprout use equipped costumes with unchanged price and combat', () => {
  for (const [type, itemId, skin] of [['boom', 'boom-orange-knight', 'orange-knight'], ['sprout', 'sprout-skeleton', 'skeleton']]) {
    const profile = { roundCoins: 100 };
    buyShopItem(profile, itemId); equipTowerSkin(profile, type, skin);
    const dressedGame = new Game('meadow', profile), normalGame = new Game('meadow');
    const dressed = dressedGame.placeTower(type, -4, 0), normal = normalGame.placeTower(type, -4, 0);
    assert.ok(dressed && normal);
    assert.equal(dressed.skin, skin);
    assert.equal(normal.skin, null);
    assert.equal(dressedGame.gold, normalGame.gold);
    assert.deepEqual(dressedGame.getStats(dressed), normalGame.getStats(normal));
    dressed.levels = [3, 3, 0, 0]; normal.levels = [3, 3, 0, 0];
    assert.deepEqual(dressedGame.getStats(dressed), normalGame.getStats(normal));
    const dressedEnemy = dressedGame._spawn('boss'), normalEnemy = normalGame._spawn('boss');
    dressedGame._launch(dressed, dressedEnemy, dressedGame.getStats(dressed));
    normalGame._launch(normal, normalEnemy, normalGame.getStats(normal));
    dressedGame._advanceProjectiles(2); normalGame._advanceProjectiles(2);
    assert.equal(dressedEnemy.hp, normalEnemy.hp);
    assert.equal(dressed.damageDone, normal.damageDone);
  }
});

test('every completed round earns one coin with no reward for idle updates or starting rounds', () => {
  const game = new Game();
  assert.equal(game.profile.roundCoins, 0);
  game.update(2);
  assert.equal(game.profile.roundCoins, 0);
  clearRound(game);
  assert.equal(game.profile.roundCoins, 1);
  const event = game.events.find(event => event.type === 'wave-complete');
  assert.equal(event.roundCoins, 1);
  assert.equal(event.totalRoundCoins, 1);
  game.update(2);
  assert.equal(game.profile.roundCoins, 1);
  clearRound(game);
  assert.equal(game.profile.roundCoins, 2);
  game.startWave();
  assert.equal(game.profile.roundCoins, 2);
});

test('loss does not award an unfinished round; replayed completed rounds earn fresh coins', () => {
  const profile = {};
  const game = new Game('meadow', profile);
  clearRound(game);
  game.startWave(); game.lives = 0; game._queue = [];
  game.update(.05);
  assert.equal(game.status, 'lost');
  assert.equal(profile.roundCoins, 1);
  const retry = new Game('meadow', profile);
  clearRound(retry);
  assert.equal(profile.roundCoins, 2);
});

test('campaign victory and endless award one coin per clear and no coins for continuing', () => {
  const game = new Game();
  for (let i = 0; i < 20; i++) clearRound(game);
  assert.equal(game.status, 'won');
  assert.equal(game.profile.roundCoins, 20);
  game.update(2);
  assert.equal(game.continueEndless(), true);
  assert.equal(game.profile.roundCoins, 20);
  clearRound(game);
  assert.equal(game.profile.roundCoins, 21);
});

test('coins, purchases, equipped skin, and receipt history survive serialization and new games', () => {
  const profile = { roundCoins: 180, unlocks: ['necro'] };
  buyShopItem(profile, 'boss-damage'); buyShopItem(profile, 'necro-skeletor'); equipNecroSkin(profile, 'skeletor');
  applyCoopRoundReward(profile, 'room:run-1', 2);
  const game = new Game('quarry', JSON.parse(JSON.stringify(profile)));
  assert.equal(game.profile.roundCoins, 32);
  assert.equal(game.profile.bossDamageUnlocked, true);
  assert.equal(game.profile.equippedNecroSkin, 'skeletor');
  assert.equal(game.profile.coopRoundReceipts['room:run-1'], 2);
  assert.equal(game.gold, 650);
  assert.equal(game.points, 0);
});

test('co-op cumulative receipts handle duplicates, reordering, reloads, and distinct runs', () => {
  let profile = {};
  assert.equal(applyCoopRoundReward(profile, 'room:one', 0), 0);
  assert.equal(applyCoopRoundReward(profile, 'room:one', 1), 1);
  assert.equal(applyCoopRoundReward(profile, 'room:one', 1), 0);
  assert.equal(applyCoopRoundReward(profile, 'room:one', 4), 3);
  assert.equal(applyCoopRoundReward(profile, 'room:one', 2), 0);
  profile = JSON.parse(JSON.stringify(profile));
  assert.equal(applyCoopRoundReward(profile, 'room:one', 4), 0);
  assert.equal(applyCoopRoundReward(profile, 'room:two', 1), 1);
  assert.equal(profile.roundCoins, 5);
});

test('receipt validation rejects malformed records and keeps recent active rooms bounded', () => {
  const profile = { coopRoundReceipts: JSON.parse('{"__proto__":50,"good":2,"negative":-1,"fraction":1.5,"string":"3"}') };
  normalizeEconomy(profile);
  assert.deepEqual(profile.coopRoundReceipts, { good: 2 });
  for (const key of [null, {}, '', '__proto__', 'constructor', 'x'.repeat(161), 'a/b']) assert.equal(applyCoopRoundReward(profile, key, 2), 0);
  for (const count of [-1, 1.5, '2', Infinity, MAX_ROUND_COINS + 1]) assert.equal(applyCoopRoundReward(profile, 'valid', count), 0);
  for (let i = 0; i < 200; i++) {
    applyCoopRoundReward(profile, `room:${i}`, 1);
    applyCoopRoundReward(profile, 'active:room', 1);
  }
  assert.equal(Object.keys(profile.coopRoundReceipts).length, 128);
  assert.equal(applyCoopRoundReward(profile, 'active:room', 1), 0);
  assert.equal(profile.roundCoins, 201);
});

test('wallet remains bounded at its cap for solo and co-op awards', () => {
  const game = new Game('meadow', { roundCoins: MAX_ROUND_COINS });
  clearRound(game);
  assert.equal(game.profile.roundCoins, MAX_ROUND_COINS);
  assert.equal(applyCoopRoundReward(game.profile, 'full:wallet', 20), 0);
  assert.equal(game.profile.coopRoundReceipts['full:wallet'], 20);
});

test('permanent upgrade doubles every damage category only against bosses', () => {
  for (const upgraded of [false, true]) for (const kind of ['physical', 'magic', 'poison']) {
    const game = new Game('meadow', { bossDamageUnlocked: upgraded });
    const tower = game._makeTower('sprout', 0, 0, 0);
    for (const type of ['boss', 'king', 'bone']) {
      const enemy = game._spawn(type);
      enemy.hp = enemy.maxHp = 1000;
      game._damage(enemy, 10, tower.id, { damageKind: kind });
      assert.equal(enemy.hp, 1000 - (upgraded && enemy.boss ? 20 : 10));
    }
  }
});

test('co-op uses the firing owner instead of the shared board profile perk', () => {
  const game = new Game('meadow', { bossDamageUnlocked: true });
  game.bossDamageOwners = ['buyer'];
  for (const [ownerId, damage] of [['buyer', 20], ['friend', 10], [undefined, 10]]) {
    const tower = game._makeTower('sprout', 0, 0, 0); tower.ownerId = ownerId;
    const boss = game._spawn('boss'), hp = boss.hp;
    game._damage(boss, 10, tower.id);
    assert.equal(hp - boss.hp, damage);
  }
  game.bossDamageOwners = [];
  const boss = game._spawn('boss'), hp = boss.hp;
  game._damage(boss, 10, game.towers[0].id);
  assert.equal(hp - boss.hp, 10);
});

test('projectiles and poison preserve co-op ownership after their tower is sold', () => {
  for (const ownerId of ['buyer', 'friend']) {
    const game = new Game(); game.bossDamageOwners = ['buyer'];
    const tower = game._makeTower('sprout', 0, 0, 0); tower.ownerId = ownerId;
    const boss = game._spawn('boss'), hp = boss.hp;
    game._launch(tower, boss, game.getStats(tower));
    assert.equal(game.sellTower(tower.id), true);
    // Browser/server fixtures restore serialized game fields over a fresh Game.
    game._sourceOwners = JSON.parse(JSON.stringify(game._sourceOwners));
    game._advanceProjectiles(2);
    assert.equal(hp - boss.hp, ownerId === 'buyer' ? 10 : 5);
    const poisoner = game._makeTower('spore', 0, 0, 0); poisoner.ownerId = ownerId;
    boss.poison = { dps: 20, remaining: 1, sourceId: poisoner.id };
    game.sellTower(poisoner.id);
    const before = boss.hp;
    game.status = 'wave'; game.update(.05);
    assert.equal(before - boss.hp, ownerId === 'buyer' ? 2 : 1);
  }
});

test('summoned guardians inherit the necromancer owner boss boost without creating extra summons', () => {
  const game = new Game(); game.bossDamageOwners = ['buyer'];
  for (const ownerId of ['buyer', 'friend']) {
    game.enemies = []; game.allies = [];
    const tower = game._makeTower('necro', 0, 0, 0); tower.ownerId = ownerId;
    const boss = game._spawn('boss'); boss.progress = 4; Object.assign(boss, game.pointAt(4));
    const ally = game._spawnReborn(tower, 0); ally.phase = 'marching'; ally.progress = 4; Object.assign(ally, game.pointAt(4));
    const before = boss.hp;
    game._fightReborn();
    assert.equal(before - boss.hp, ally.damage * (ownerId === 'buyer' ? 2 : 1));
    assert.equal(tower.soulQueue.length, 0);
  }
});
