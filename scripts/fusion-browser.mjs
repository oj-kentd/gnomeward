import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Match } from '../server/match.js';
import { enterGarden } from './browser-helpers.mjs';

await mkdir('playtest-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
page.setDefaultTimeout(45000);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
let stage = 'entering the garden';
const progress = setInterval(() => console.log('Fusion browser:', stage), 15000); progress.unref();
async function settle() { await page.waitForTimeout(350); }
async function select(id) { await page.evaluate(id => { gnomeward.state.selectedTowerId = id; }, id); await page.waitForFunction(id => document.getElementById('selection-panel').dataset.towerId === String(id), id); }
async function merge(other, expectedName) {
  await page.locator('[data-merge-open]').click();
  await page.locator(`[data-merge-partner="${other}"]`).click();
  assert.match(await page.locator('.fusion-preview').innerText(), /Keeps every ability and upgrade/);
  assert.match(await page.locator('.fusion-preview').innerText(), /purchases stay yours/);
  assert.match(await page.locator('[data-merge-confirm]').innerText(), new RegExp(expectedName.toUpperCase()));
  await page.locator('[data-merge-confirm]').click();
  await page.waitForFunction(name => document.querySelector('.selected-heading h3')?.textContent === name, expectedName);
}
try {
  await page.goto(process.env.PLAYTEST_URL || 'http://127.0.0.1:5190'); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.renderer.info.render.frame > 0);
  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();
  const fixture = await page.evaluate(() => {
    const { game, state } = gnomeward;
    state.paused = true; state.autoStart = false;
    game.points = 1000; game.gold = 1000;
    Object.assign(game.profile, { unlocks: ['multi', 'necro'], roundCoins: 50, cosmetics: ['necro-skeletor', 'sprout-skeleton'], equippedNecroSkin: 'skeletor', equippedSproutSkin: 'skeleton', tumbleSpeedUnlocked: false });
    const sprout = game._makeTower('sprout', -3, 0, 100), multi = game._makeTower('multi', 0, 0, 290), necro = game._makeTower('necro', 3, 0, 320);
    sprout.levels[0] = 1; multi.levels[0] = 1; necro.levels[0] = 1;
    sprout.kills = 2; multi.kills = 3; necro.kills = 4;
    return { sprout: sprout.id, multi: multi.id, necro: necro.id, cosmetics: [...game.profile.cosmetics] };
  });
  await select(fixture.sprout);
  stage = 'pair fusion through actual confirmation controls';
  await page.locator('[data-merge-open]').click();
  await page.locator(`[data-merge-partner="${fixture.multi}"]`).click();
  assert.equal(await page.evaluate(() => gnomeward.game.towers.filter(t => t.fusionKey).length), 0, 'choosing a partner does not merge without confirmation');
  await page.locator('[data-merge-confirm]').click();
  await page.waitForFunction(() => document.querySelector('.selected-heading h3')?.textContent === 'Sproutstorm');
  assert.equal(await page.locator('[data-fusion-member]').count(), 2);
  assert.match(await page.locator('.selected-heading').innerText(), /5 defeated/);
  const pair = await page.evaluate(id => ({ members: gnomeward.game.getFusionMembers(id), cosmetics: gnomeward.game.profile.cosmetics, equipped: gnomeward.game.profile.equippedSproutSkin }), fixture.sprout);
  assert.equal(pair.members.length, 2); assert.ok(pair.members.every(t => t.skin === null));
  assert.deepEqual(pair.cosmetics, fixture.cosmetics); assert.equal(pair.equipped, 'skeleton');
  checks.push('Explicit confirmation combines placed defenders, preserves upgrades and purchases, removes costumes from fused form.');

  stage = 'each component keeps its upgrade panel';
  await page.locator(`[data-fusion-member="${fixture.multi}"]`).click();
  assert.match(await page.locator('.fusion-component-label').innerText(), /Tumble/);
  await page.locator(`[data-fusion-member="${fixture.multi}"]`).focus();
  await page.evaluate(id => { gnomeward.game.towers.find(t => t.id === id).kills++; }, fixture.sprout);
  await page.waitForFunction(() => document.querySelector('.selected-heading')?.textContent.includes('6 defeated'));
  assert.equal(await page.evaluate(() => Number(document.activeElement?.dataset.fusionMember)), fixture.multi, 'component focus survives combat-driven rerender');
  await page.locator('[data-upgrade="0"]').click();
  assert.deepEqual(await page.evaluate(ids => ids.map(id => gnomeward.game.towers.find(t => t.id === id).levels[0]), [fixture.sprout, fixture.multi]), [1, 2]);
  const targetingBefore = await page.evaluate(() => gnomeward.game.towers[0].targeting);
  await page.locator('[data-targeting]').click();
  const targets = await page.evaluate(id => gnomeward.game.getFusionMembers(id).map(t => t.targeting), fixture.sprout);
  assert.ok(targets.every(t => t !== targetingBefore && t === targets[0]));
  checks.push('Component tabs upgrade only the chosen original member; targeting applies to the full fusion.');

  stage = 'second form merges with the remaining third member';
  await merge(fixture.necro, 'Trinity');
  assert.equal(await page.locator('[data-fusion-member]').count(), 3);
  assert.equal(await page.locator('[data-merge-open]').count(), 0);
  assert.match(await page.locator('.selected-heading').innerText(), /10 defeated/);
  await page.locator(`[data-fusion-member="${fixture.necro}"]`).click();
  assert.match(await page.locator('.necro-ability').innerText(), /Direct attack kills from any merged member/);
  await page.locator('[data-upgrade="0"]').click();
  assert.equal(await page.evaluate(id => gnomeward.game.towers.find(t => t.id === id).levels[0], fixture.necro), 2);
  const beforeTurbo = await page.evaluate(id => {
    const members = gnomeward.game.getFusionMembers(id); members.forEach(t => { t.cooldown = .9; });
    return members.map(t => ({ id: t.id, interval: gnomeward.game.getStats(t).interval }));
  }, fixture.sprout);
  await page.locator('#coin-shop-button').click();
  await page.locator('[data-shop-buy="tumble-speed"]').click();
  await page.locator('[aria-label="Close Round Coin shop"]').click();
  const afterTurbo = await page.evaluate(id => gnomeward.game.getFusionMembers(id).map(t => ({ id: t.id, interval: gnomeward.game.getStats(t).interval, cooldown: t.cooldown })), fixture.sprout);
  for (const before of beforeTurbo) {
    const after = afterTurbo.find(t => t.id === before.id);
    assert.ok(Math.abs(after.interval * 3 - before.interval) < 1e-10);
    assert.ok(Math.abs(after.cooldown - .3) < 1e-10);
  }
  assert.match(await page.locator('.tumble-speed-note').innerText(), /every merged ability/);
  checks.push('Pair plus third creates Trinity; a new Turbo purchase triples every member, including existing attack cooldowns exactly once.');
  await page.screenshot({ path: 'playtest-results/fusion-desktop.png' });

  stage = 'mobile upgrade and sell controls';
  await page.setViewportSize({ width: 320, height: 760 }); await settle();
  await page.locator(`[data-fusion-member="${fixture.sprout}"]`).click();
  assert.match(await page.locator('.fusion-component-label').innerText(), /Sprout/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.locator('[data-sell]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'playtest-results/fusion-mobile.png' });
  const gold = await page.evaluate(() => gnomeward.game.gold);
  assert.match(await page.locator('[data-sell]').innerText(), /532/);
  await page.locator('[data-sell]').click();
  assert.equal(await page.evaluate(() => gnomeward.game.towers.length), 0);
  assert.equal(await page.evaluate(() => gnomeward.game.gold), gold + 532);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gnomeward-profile')));
  assert.deepEqual(saved.cosmetics, fixture.cosmetics); assert.equal(saved.equippedSproutSkin, 'skeleton'); assert.equal(saved.tumbleSpeedUnlocked, true);
  checks.push('320px panel stays within screen; selling a fusion removes all members and returns their combined refund. Permanent collection survives.');
  stage = 'co-op capability and ownership';
  await page.setViewportSize({ width: 1280, height: 800 });
  const match = new Match({ mode: 'coop', mapId: 'meadow' });
  match.addPlayer('one', 'Merger', { tumbleSpeed: true }); match.addPlayer('two', 'Teammate');
  match.manualPause = true;
  const board = match.board(); board.profile.unlocks.push('multi', 'necro');
  const own = board._makeTower('sprout', -3, 0, 100), partner = board._makeTower('multi', 0, 0, 290), theirs = board._makeTower('necro', 3, 0, 320);
  own.ownerId = partner.ownerId = 'one'; theirs.ownerId = 'two';
  for (const player of match.players.values()) player.points = 500;
  match._syncLoadouts(); match._syncWallets();
  async function deliver(snapshot) { await page.evaluate(snapshot => gnomeward.multiplayer.onSnapshot(snapshot, 'one'), snapshot); await settle(); }
  const legacy = match.snapshot('fusion-browser-room'); delete legacy.fusionVersion;
  await deliver(legacy); await select(own.id);
  assert.equal(await page.locator('[data-merge-open]').isDisabled(), true);
  assert.match(await page.locator('.fusion-controls').innerText(), /Update the co-op server/);
  await deliver(match.snapshot('fusion-browser-room'));
  await page.locator('[data-merge-open]').click();
  assert.equal(await page.locator(`[data-merge-partner="${theirs.id}"]`).count(), 0, 'teammate cannot be selected as a merge partner');
  await page.locator(`[data-merge-partner="${partner.id}"]`).click();
  await page.evaluate(() => { gnomeward.multiplayer.command = command => { window.__fusionCommand = command; return true; }; });
  await page.locator('[data-merge-confirm]').click();
  const command = await page.evaluate(() => window.__fusionCommand);
  assert.deepEqual(command, { action: 'merge', towerId: own.id, otherTowerId: partner.id });
  match.command('one', command); await deliver(match.snapshot('fusion-browser-room'));
  assert.match(await page.locator('.selected-heading h3').innerText(), /Sproutstorm/);
  await page.locator(`[data-fusion-member="${partner.id}"]`).click();
  await page.locator('[data-upgrade="0"]').click();
  const upgrade = await page.evaluate(() => window.__fusionCommand);
  assert.deepEqual(upgrade, { action: 'upgrade', towerId: partner.id, path: 0 });
  match.command('one', upgrade); await deliver(match.snapshot('fusion-browser-room'));
  assert.equal(board.towers.find(t => t.id === partner.id).levels[0], 1);
  await select(theirs.id);
  assert.equal(await page.locator('[data-merge-open]').count(), 0);
  assert.equal(await page.locator('[data-upgrade="0"]').isDisabled(), true);
  checks.push('Older servers disable fusion with an update note; current co-op sends authoritative merge and member upgrade commands, and teammate gnomes cannot merge.');
  assert.deepEqual(errors, []);
  await writeFile('playtest-results/fusion-browser.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) { console.error('Fusion browser failed at:', stage, error); await page.screenshot({ path: 'playtest-results/fusion-failure.png' }).catch(() => {}); throw error;
} finally { clearInterval(progress); await browser.close(); }
