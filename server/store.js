import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NECRO_PATH_SECRET } from '../src/data.js';

const earnedStrawberry = result => result.mapId === 'strawberry' && Array.isArray(result.players) && result.players.some(player => Number.isSafeInteger(player.completedWaves) && player.completedWaves >= 20);
const knownPaths = values => [...new Set(Array.isArray(values) ? values.filter(id => id === NECRO_PATH_SECRET.id) : [])];

export async function openResultStore(directory) {
  await mkdir(directory, { recursive: true });
  const filename = join(directory, 'results.json');
  let records = [], unlocks = [], pathUnlocks = [];
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.results)) throw new Error('Invalid results.json; restore a backup before starting');
    records = saved.results.slice(-1000);
    unlocks = (Array.isArray(saved.unlocks) ? saved.unlocks : []).filter(id => id === 'strawberry');
    if (!unlocks.includes('strawberry') && records.some(earnedStrawberry)) unlocks.push('strawberry');
    pathUnlocks = knownPaths([...(Array.isArray(saved.pathUnlocks) ? saved.pathUnlocks : []), ...records.flatMap(result => knownPaths(result.earnedPathUnlocks))]);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const probe = join(directory, `.write-test-${randomUUID()}`);
  await writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
  await unlink(probe);
  let pending = Promise.resolve(), healthy = true;
  async function persist(nextRecords, nextUnlocks, nextPaths) {
    const temp = `${filename}.tmp`;
    await writeFile(temp, JSON.stringify({ version: 1, results: nextRecords, unlocks: nextUnlocks, pathUnlocks: nextPaths }, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, filename);
    records = nextRecords; unlocks = nextUnlocks; pathUnlocks = nextPaths; healthy = true;
  }
  return {
    get healthy() { return healthy; },
    get count() { return records.length; },
    get unlocks() { return [...unlocks]; },
    get pathUnlocks() { return [...pathUnlocks]; },
    grantUnlock(type) {
      if (type !== 'strawberry') return Promise.reject(new Error('Unknown encounter reward'));
      const task = pending.then(async () => {
        if (unlocks.includes(type)) return;
        await persist(records, [...unlocks, type], pathUnlocks);
      });
      pending = task.catch(error => { healthy = false; console.error('Could not save encounter reward:', error.message); });
      return task;
    },
    grantPathUnlock(id) {
      if (id !== NECRO_PATH_SECRET.id) return Promise.reject(new Error('Unknown secret upgrade path'));
      const task = pending.then(async () => {
        if (pathUnlocks.includes(id)) return;
        await persist(records, unlocks, [...pathUnlocks, id]);
      });
      pending = task.catch(error => { healthy = false; console.error('Could not save secret path:', error.message); });
      return task;
    },
    record(result) {
      const item = structuredClone(result);
      const task = pending.then(async () => {
        const next = [...records, { ...item, recordedAt: new Date().toISOString() }].slice(-1000);
        const nextUnlocks = earnedStrawberry(item) && !unlocks.includes('strawberry') ? [...unlocks, 'strawberry'] : unlocks;
        const nextPaths = knownPaths([...pathUnlocks, ...knownPaths(item.earnedPathUnlocks)]);
        await persist(next, nextUnlocks, nextPaths);
      });
      pending = task.catch(error => { healthy = false; console.error('Could not save match results:', error.message); });
      return task;
    },
    async flush() { await pending; },
  };
}
