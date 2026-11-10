import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { empty, validate, migrate } from "./model.js";
let native, db;
export async function open() {
  if (Capacitor.isNativePlatform()) {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    native = await sqlite.createConnection(
      "bookledger",
      false,
      "no-encryption",
      1,
      false,
    );
    await native.open();
    await native.execute("PRAGMA synchronous=FULL;", false);
    const version = await native.query("PRAGMA user_version");
    if ((version.values?.[0]?.user_version || 0) > 1)
      throw Error("قاعدة البيانات أحدث من هذا الإصدار؛ حدّث التطبيق");
    await native.execute(
      "CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); PRAGMA user_version=1;",
    );
    return;
  } else {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("bookledger", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("ledger");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (navigator.storage?.persist) await navigator.storage.persist();
  }
}
export async function read() {
  let raw;
  if (native) {
    const r = await native.query("SELECT payload FROM ledger WHERE id=1");
    raw = r.values?.[0]?.payload;
  } else
    raw = await new Promise((resolve, reject) => {
      const r = db.transaction("ledger").objectStore("ledger").get(1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  return raw ? migrate(JSON.parse(raw)) : empty();
}
export async function write(state) {
  validate(state);
  const raw = JSON.stringify(state);
  if (native) {
    await native.run(
      "INSERT INTO ledger(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      [raw],
      true,
    );
  } else
    await new Promise((resolve, reject) => {
      const t = db.transaction("ledger", "readwrite", { durability: "strict" });
      t.objectStore("ledger").put(raw, 1);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || Error("لم يكتمل الحفظ"));
    });
}
