import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function openResultStore(directory) {
  await mkdir(directory, { recursive: true });
  const filename = join(directory, 'results.json');
  let records = [];
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.results)) throw new Error('Invalid results.json; restore a backup before starting');
    records = saved.results.slice(-1000);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const probe = join(directory, `.write-test-${randomUUID()}`);
  await writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
  await unlink(probe);
  let pending = Promise.resolve(), healthy = true;
  return {
    get healthy() { return healthy; },
    get count() { return records.length; },
    record(result) {
      const item = structuredClone(result);
      const task = pending.then(async () => {
        const next = [...records, { ...item, recordedAt: new Date().toISOString() }].slice(-1000);
        const temp = `${filename}.tmp`;
        await writeFile(temp, JSON.stringify({ version: 1, results: next }, null, 2) + '\n', { mode: 0o600 });
        await rename(temp, filename);
        records = next; healthy = true;
      });
      pending = task.catch(error => { healthy = false; console.error('Could not save match results:', error.message); });
      return task;
    },
    async flush() { await pending; },
  };
}
