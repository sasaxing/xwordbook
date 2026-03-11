const DB_NAME = "xwordbook-db";
const DB_VERSION = 1;
const STORE_NAME = "words";

let dbPromise;

function generateId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `word-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("remembered", "remembered", { unique: false });
        store.createIndex("level", "level", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function runTransaction(mode, handler) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        let result;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);

        result = handler(store, transaction);
      }),
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getCategoryData(category) {
  switch (category) {
    case "needs-review":
      return { level: 1, remembered: false };
    case "confident":
      return { level: 5, remembered: true };
    case "learning":
    default:
      return { level: 3, remembered: false };
  }
}

export function createWordRecord(data) {
  const now = new Date().toISOString();
  const categoryData = typeof data.category === "string" ? getCategoryData(data.category) : {};

  return {
    id: data.id || generateId(),
    chinese: data.chinese.trim(),
    german: data.german.trim(),
    note: (data.note || "").trim(),
    remembered: typeof data.category === "string" ? categoryData.remembered : Boolean(data.remembered),
    level: typeof data.category === "string" ? categoryData.level : clampLevel(data.level),
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

export function clampLevel(level) {
  const normalized = Number.parseInt(level, 10);

  if (Number.isNaN(normalized)) {
    return 3;
  }

  return Math.min(5, Math.max(1, normalized));
}

export async function getAllWords() {
  return runTransaction("readonly", (store) => requestToPromise(store.getAll()));
}

export async function getWordById(id) {
  return runTransaction("readonly", (store) => requestToPromise(store.get(id)));
}

export async function saveWord(data) {
  const existing = data.id ? await getWordById(data.id) : null;
  const record = createWordRecord({
    ...existing,
    ...data,
    createdAt: existing?.createdAt || data.createdAt,
  });

  await runTransaction("readwrite", (store) => requestToPromise(store.put(record)));
  return record;
}

export async function deleteWord(id) {
  await runTransaction("readwrite", (store) => requestToPromise(store.delete(id)));
}

export async function importWords(records) {
  if (!Array.isArray(records)) {
    throw new Error("Import data must be an array.");
  }

  const normalizedRecords = records
    .filter((record) => record && typeof record.chinese === "string" && typeof record.german === "string")
    .map((record) =>
      createWordRecord({
        ...record,
        id: record.id || generateId(),
        createdAt: record.createdAt || new Date().toISOString(),
      }),
    );

  await runTransaction("readwrite", (store) => {
    normalizedRecords.forEach((record) => {
      store.put(record);
    });
  });

  return normalizedRecords.length;
}

export async function clearWords() {
  await runTransaction("readwrite", (store) => requestToPromise(store.clear()));
}
