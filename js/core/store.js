// In-memory cache of every record, written through to IndexedDB.
// Personal task data is small, so keeping it in memory makes rendering simple
// and synchronous while IndexedDB remains the source of truth across sessions.
import * as db from './db.js';

const cache = Object.fromEntries(db.STORES.map((name) => [name, new Map()]));
const keyOf = (storeName, record) => (storeName === 'settings' ? record.key : record.id);

const listeners = new Set();
let notifyScheduled = false;
let version = 0;
let errorHandler = (error) => console.error(error);

function notify() {
  version++;
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    listeners.forEach((listener) => listener());
  });
}

async function loadCache() {
  for (const name of db.STORES) {
    const records = await db.getAll(name);
    cache[name].clear();
    records.forEach((record) => cache[name].set(keyOf(name, record), record));
  }
}

export async function init() {
  await db.openDatabase();
  await loadCache();
}

export function snapshot() {
  return Object.fromEntries(db.STORES.map((name) => [name, all(name)]));
}

// Atomically replaces all data (used by backup restore), then reloads memory.
export async function replaceAll(dataByStore) {
  try {
    await db.replaceAllStores(dataByStore);
  } catch (error) {
    errorHandler(error);
    throw error;
  }
  await loadCache();
  notify();
}

export function all(storeName) {
  return Array.from(cache[storeName].values());
}

export function get(storeName, key) {
  return cache[storeName].get(key);
}

// Updates memory immediately (so the UI reacts at once) and persists in the background.
export async function put(storeName, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return;
  list.forEach((record) => cache[storeName].set(keyOf(storeName, record), record));
  notify();
  try {
    await db.putMany(storeName, list);
  } catch (error) {
    errorHandler(error);
    throw error;
  }
}

export async function remove(storeName, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.length) return;
  list.forEach((key) => cache[storeName].delete(key));
  notify();
  try {
    await db.deleteMany(storeName, list);
  } catch (error) {
    errorHandler(error);
    throw error;
  }
}

export async function clearAll() {
  await db.clearStores();
  Object.values(cache).forEach((map) => map.clear());
  notify();
}

// Increases on every change; lets callers cache derived data between writes.
export function currentVersion() {
  return version;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onError(handler) {
  errorHandler = handler;
}
