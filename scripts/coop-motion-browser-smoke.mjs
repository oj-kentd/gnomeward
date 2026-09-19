import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Client } from '@colyseus/sdk';
import { enterGarden } from './browser-helpers.mjs';

// Keep one real WebGL player and a normal SDK teammate so software rendering in
// CI does not compete with a second canvas. The full co-op smoke covers both UIs.
const baseURL = process.env.PLAYTEST_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let peer, stage = 'loading the garden';
const errors = [], commandErrors = [];
const progress = setInterval(() => console.log(`Co-op motion check: ${stage}`), 15000);
progress.unref();
try {
  await mkdir('playtest-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL); await enterGarden(page);
  await page.waitForFunction(() => window.gnomeward?.ready && gnomeward.renderer.motion && gnomeward.renderer.renderer.info.render.frame > 0);

  if (await page.locator('#dismiss-tip').isVisible()) await page.locator('#dismiss-tip').click();

  stage = 'checking steady motion with deterministic packet jitter';
  const synthetic = await page.evaluate(() => {
    // Exercise the shipped controller with independent fixtures; never advance
    // or alter the live Game, room, renderer, or its interpolation buffer.
    const Controller = gnomeward.renderer.motion.constructor;
    const controller = new Controller();
    const frames = [], jitter = [0, .035, .005, .02, .01];
    let packet = 0, before, oldX = 0, oldTarget = 0, maxMutation = 0;
    const originals = [];
    for (let index = 0; index <= 480; index++) {
      const now = index / 60;
      while (packet * .2 + jitter[packet % jitter.length] <= now + 1e-9) {
        const serverTime = packet * .2;
        const game = { map: { id: 'fixture' }, time: serverTime,
          enemies: [{ id: 1, x: serverTime, z: 0, progress: serverTime, routeIndex: 0 }],
          allies: [], projectiles: [], effects: [], holes: [], barriers: [] };
        originals.push({ game, value: JSON.stringify(game) });
        controller.capture(game, { roomId: 'fixture', connected: true, paused: false,
          snapshotTick: packet * 4, snapshotSequence: packet + 1,
          snapshotReceivedAt: serverTime + jitter[packet % jitter.length] });
        oldTarget = serverTime; packet++;
      }
      oldX += (oldTarget - oldX) * (1 - Math.exp(-18 / 60));
      const x = controller.sample(now, progress => ({ x: progress, z: 0 }))?.enemies[0]?.x;
      if (index > 90 && before) frames.push({ velocity: (x - before.x) * 60, oldVelocity: (oldX - before.oldX) * 60, samePacket: before.packet === packet });
      before = { x, oldX, packet };
    }
    for (const original of originals) if (JSON.stringify(original.game) !== original.value) maxMutation++;
    const spread = key => {
      const values = frames.map(frame => frame[key]).sort((a, b) => a - b);
      return { low: values[Math.floor(values.length * .1)], high: values[Math.floor(values.length * .9)] };
    };
    return { frames: frames.length, movingBetweenPackets: frames.filter(frame => frame.samePacket && frame.velocity > .9).length, buffered: spread('velocity'), oldLerp: spread('oldVelocity'), mutations: maxMutation };
  });
  assert.ok(synthetic.movingBetweenPackets > 250, 'presentation advances between network packets at a deterministic render cadence');
  assert.equal(synthetic.mutations, 0, 'presentation must not alter supplied snapshots');
  assert.ok(synthetic.buffered.low > .9 && synthetic.buffered.high < 1.1, JSON.stringify(synthetic));
  assert.ok(synthetic.oldLerp.high / synthetic.oldLerp.low > 4, 'the measurement must detect the previous packet-paced easing');

  stage = 'creating a real shared round';
  await page.locator('#coop-button').click();
  await page.locator('#coop-name').fill('Motion gardener');
  await page.locator('#coop-map').selectOption('meadow');
  await page.locator('[data-coop-create]').click();
  await page.waitForFunction(() => gnomeward.state.multiplayer?.roomId);
  const connection = await page.evaluate(() => ({ roomId: gnomeward.state.multiplayer.roomId, url: gnomeward.multiplayer.url }));
  if (await page.locator('#game-dialog').isVisible()) await page.locator('#game-dialog [data-close]').first().click();
  peer = await new Client(process.env.SERVER_URL || connection.url).joinById(connection.roomId, { protocol: 1, name: 'Motion teammate' });
  peer.onMessage('snapshot', () => {});
  peer.onMessage('command-error', error => commandErrors.push(error.message));
  await page.waitForFunction(() => gnomeward.state.multiplayer.players.length === 2);
  await page.locator('#start-button').click();
  peer.send('command', { action: 'ready' });
  await page.waitForFunction(() => gnomeward.game.status === 'wave' && gnomeward.game.enemies.length > 0);

  stage = 'measuring displayed and authoritative positions across live packets';
  const measured = await page.evaluate(() => new Promise(resolve => {
    const world = gnomeward.renderer, records = [], packets = new Map();
    const id = gnomeward.game.enemies[0].id;
    const started = performance.now();
    // Capture packet values before any subsequent render can alter them.
    const removeListener = gnomeward.multiplayer.activeRoom.onMessage('snapshot', snapshot => {
      const enemy = snapshot.boards.find(board => board.playerId === null)?.state.enemies.find(enemy => enemy.id === id);
      if (enemy) packets.set(snapshot.tick, { x: enemy.x, z: enemy.z, progress: enemy.progress });
    });
    function frame(now) {
      const { game, state } = gnomeward, enemy = game.enemies.find(enemy => enemy.id === id);
      const object = world.entities.get(`e${id}`), online = state.multiplayer;
      if (enemy && object && online && packets.has(online.snapshotTick)) {
        // A separate controller view samples the identical rAF timestamp. This
        // detects accidental extra easing in the actual Three.js scene objects.
        const reference = Object.assign(new world.motion.constructor(), world.motion);
        const expected = reference.sample(now / 1000, (progress, route) => game.pointAt(progress, route))?.enemies.find(enemy => enemy.id === id);
        if (expected) records.push({ now: now / 1000, elapsed: (now - started) / 1000,
          sequence: online.snapshotSequence, tick: online.snapshotTick, receivedAt: online.snapshotReceivedAt,
          authoritative: { x: enemy.x, z: enemy.z, progress: enemy.progress }, packet: packets.get(online.snapshotTick),
          display: { x: object.position.x, z: object.position.z }, expected: { x: expected.x, z: expected.z, progress: expected.progress }, speed: enemy.speed });
      }
      if (now - started < 9000) requestAnimationFrame(frame);
      else { removeListener(); resolve({ records, packets: packets.size, elapsed: (performance.now() - started) / 1000 }); }
    }
    requestAnimationFrame(frame);
  }));
  await writeFile('playtest-results/coop-motion-raw.json', JSON.stringify({ synthetic, ...measured }, null, 2));
  // Count network packets over the actual listener window. A slow GPU may
  // leave the final render record earlier than the final received packet.
  const packetRate = measured.packets / measured.elapsed;
  assert.ok(packetRate > 3 && packetRate < 7, `observe roughly 5 Hz server updates, received ${packetRate.toFixed(2)}Hz`);
  assert.ok(measured.records.length >= 12, 'collect enough real rendered positions without requiring a particular FPS');
  const warmed = measured.records.filter(record => record.elapsed > 1);
  const traveled = warmed.at(-1).expected.progress - warmed[0].expected.progress;
  assert.ok(traveled > 5, `enemy should visibly traverse the route, traveled ${traveled}`);
  let maxMutation = 0, maxRenderError = 0;
  const movements = [], samePacketMovements = [];
  for (let index = 0; index < warmed.length; index++) {
    const record = warmed[index];
    maxMutation = Math.max(maxMutation, ...['x', 'z', 'progress'].map(key => Math.abs(record.authoritative[key] - record.packet[key])));
    maxRenderError = Math.max(maxRenderError, Math.hypot(record.display.x - record.expected.x, record.display.z - record.expected.z));
    const previous = warmed[index - 1];
    if (!previous) continue;
    const elapsed = record.now - previous.now;
    // Exact scene-position equality above lets path distance measure travel even
    // when a slow software-rendered frame crosses a corner.
    const distance = record.expected.progress - previous.expected.progress;
    if (elapsed > 0) {
      movements.push(distance / elapsed);
      if (record.sequence === previous.sequence) samePacketMovements.push(distance / elapsed);
    }
  }
  assert.equal(maxMutation, 0, 'rendering must preserve authoritative coordinates and route progress');
  assert.ok(maxRenderError < .00001, `scene must use buffered positions directly, error ${maxRenderError}`);
  // At less than the server's 5 Hz cadence there cannot be two real frames
  // within a packet. The deterministic browser fixture above checks this
  // property independently of GPU speed; retain the live count in the report.
  if (samePacketMovements.length >= 3) assert.ok(samePacketMovements.filter(speed => speed > .1).length >= 3, 'enemies advance between received packets');
  // Network stalls may exhaust the short buffer. Allow isolated stalls without
  // accepting the recurring sharp acceleration/decay of the previous easing.
  const speeds = movements.sort((a, b) => a - b);
  const median = speeds[Math.floor(speeds.length / 2)];
  const steadyFraction = speeds.filter(speed => speed > median * .65 && speed < median * 1.35).length / speeds.length;
  assert.ok(median > .5, `enemy should traverse the route, median speed ${median}`);
  assert.ok(steadyFraction > .7, `movement should remain steady across packets: ${(steadyFraction * 100).toFixed(1)}%`);
  const report = { synthetic, actual: { packets: measured.packets, packetRate, traveled, frames: measured.records.length,
    samePacketFrames: samePacketMovements.length, medianSpeed: median, steadyFraction, maxMutation, maxRenderError }, records: measured.records };
  await writeFile('playtest-results/coop-motion.json', JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'playtest-results/coop-motion.png' });
  assert.deepEqual(commandErrors, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ synthetic, actual: report.actual }, null, 2));
  console.log('Co-op browser motion checks passed.');
} finally {
  clearInterval(progress);
  if (peer) { peer.reconnection.enabled = false; await peer.leave().catch(() => {}); }
  await browser.close();
}
