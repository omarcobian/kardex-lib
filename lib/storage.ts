import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data', 'storage');

const locks = new Map<string, Promise<void>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.then(() => {}, () => {}));
  return next;
}

async function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function readData<T>(fileName: string, defaultValue: T): Promise<T> {
  await ensureDir();
  const filePath = join(DATA_DIR, fileName);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeData<T>(fileName: string, data: T): Promise<void> {
  return withLock(fileName, async () => {
    await ensureDir();
    const filePath = join(DATA_DIR, fileName);
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  });
}

export async function updateData<T>(
  fileName: string,
  defaultValue: T,
  updater: (current: T) => T,
): Promise<T> {
  return withLock(fileName, async () => {
    await ensureDir();
    const filePath = join(DATA_DIR, fileName);
    let current: T;
    try {
      const raw = await readFile(filePath, 'utf-8');
      current = JSON.parse(raw) as T;
    } catch {
      current = defaultValue;
    }
    const updated = updater(current);
    await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  });
}

export async function deleteData(fileName: string): Promise<void> {
  return withLock(fileName, async () => {
    await ensureDir();
    const filePath = join(DATA_DIR, fileName);
    try {
      await writeFile(filePath, JSON.stringify(null), 'utf-8');
    } catch {
      // ignore
    }
  });
}
