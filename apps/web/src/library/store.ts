// スクリプトの保存 (docs/design/06-storage.md)。端末の中 (IndexedDB) にだけ置き、元の文字列を持つ。
// 開くたびに検証し直すので、アプリの版が上がって検証が変わっても、その時点の規則で読める
export type ScriptRecord = {
  key: string;
  metadataId: string;
  name: string;
  format: "yaml" | "json";
  source: string;
  updatedAt: number;
};

export type ScriptStore = {
  list(): Promise<ScriptRecord[]>;
  get(key: string): Promise<ScriptRecord | null>;
  put(record: ScriptRecord): Promise<void>;
  delete(key: string): Promise<void>;
};

const newestFirst = (records: ScriptRecord[]) =>
  [...records].sort((a, b) => b.updatedAt - a.updatedAt);

/** 保存が使えないとき (プライベートブラウズ、拒否) とテストのための、記憶の中の置き場 */
export function createMemoryStore(): ScriptStore {
  let records = new Map<string, ScriptRecord>();
  return {
    list: async () => newestFirst([...records.values()]),
    get: async (key) => records.get(key) ?? null,
    put: async (record) => {
      records = new Map(records).set(record.key, record);
    },
    delete: async (key) => {
      const next = new Map(records);
      next.delete(key);
      records = next;
    },
  };
}

const DB_NAME = "cueline";
const DB_VERSION = 1;
const SCRIPTS = "scripts";

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function openDatabase(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  // 版を上げるときは、古い版のデータを消さずに移す (06)
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(SCRIPTS)) {
      db.createObjectStore(SCRIPTS, { keyPath: "key" }).createIndex("metadataId", "metadataId");
    }
  };
  return request(req);
}

/** IndexedDB の置き場。開けなければ投げる (呼ぶ側が記憶の中の置き場に切り替える) */
export async function createIndexedDbStore(): Promise<ScriptStore> {
  const db = await openDatabase();
  const store = (mode: IDBTransactionMode) => db.transaction(SCRIPTS, mode).objectStore(SCRIPTS);
  return {
    list: async () =>
      newestFirst(await request(store("readonly").getAll() as IDBRequest<ScriptRecord[]>)),
    get: async (key) =>
      ((await request(store("readonly").get(key))) as ScriptRecord | undefined) ?? null,
    put: async (record) => void (await request(store("readwrite").put(record))),
    delete: async (key) => void (await request(store("readwrite").delete(key))),
  };
}
