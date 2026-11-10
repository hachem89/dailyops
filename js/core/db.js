// IndexedDB access. Schema changes are expressed as numbered migrations so that
// existing users are upgraded step by step when DB_VERSION increases.

const DB_NAME = 'dailyops';
export const DB_VERSION = 3;

export const STORES = ['tasks', 'groups', 'categories', 'settings', 'projects', 'projectSubtasks', 'recurrenceRules', 'timeSessions'];

const MIGRATIONS = {
  1(db) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('scheduledDate', 'scheduledDate');
    tasks.createIndex('parentTaskId', 'parentTaskId');
    tasks.createIndex('status', 'status');

    const groups = db.createObjectStore('groups', { keyPath: 'id' });
    groups.createIndex('type', 'type');

    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'key' });
  },

  // Projects, project subtasks and recurrence rules. Existing tasks need no
  // rewrite: the new optional fields (projectId, recurrenceRuleId,
  // occurrenceDate) are read as null when absent.
  2(db, tx) {
    db.createObjectStore('projects', { keyPath: 'id' });
    const subtasks = db.createObjectStore('projectSubtasks', { keyPath: 'id' });
    subtasks.createIndex('projectId', 'projectId');
    db.createObjectStore('recurrenceRules', { keyPath: 'id' });

    const tasks = tx.objectStore('tasks');
    tasks.createIndex('projectId', 'projectId');
    tasks.createIndex('recurrenceRuleId', 'recurrenceRuleId');
  },

  // Time tracking. Each session is one interval of work on a task or project;
  // the running timer is the session whose `end` is null.
  3(db) {
    const sessions = db.createObjectStore('timeSessions', { keyPath: 'id' });
    sessions.createIndex('taskId', 'taskId');
    sessions.createIndex('projectId', 'projectId');
    sessions.createIndex('date', 'date');
  },
};

let connection = null;

const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export function openDatabase() {
  if (connection) return Promise.resolve(connection);
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('This browser does not support IndexedDB.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let version = event.oldVersion + 1; version <= DB_VERSION; version++) {
        MIGRATIONS[version]?.(db, request.transaction);
      }
    };
    request.onblocked = () =>
      reject(new Error('DailyOps is open in another tab with an older version. Close other tabs and reload.'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      connection = request.result;
      // Another tab is upgrading the schema: release the connection so it can proceed.
      connection.onversionchange = () => {
        connection.close();
        connection = null;
      };
      resolve(connection);
    };
  });
}

function transaction(storeNames, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        result = work(tx);
      }),
  );
}

export function getAll(storeName) {
  return openDatabase().then((db) => promisify(db.transaction(storeName).objectStore(storeName).getAll()));
}

export function putMany(storeName, records) {
  return transaction([storeName], 'readwrite', (tx) => {
    const store = tx.objectStore(storeName);
    records.forEach((record) => store.put(record));
  });
}

export function deleteMany(storeName, keys) {
  return transaction([storeName], 'readwrite', (tx) => {
    const store = tx.objectStore(storeName);
    keys.forEach((key) => store.delete(key));
  });
}

export function clearStores(storeNames = STORES) {
  return transaction(storeNames, 'readwrite', (tx) => {
    storeNames.forEach((name) => tx.objectStore(name).clear());
  });
}
