import type { Meeting } from "@ryu/core";
import { Directory, File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import type { StoredAudio, Vault } from "./vault.types";

/**
 * Native vault: SQLite for meetings (JSON documents keyed by id, ordered by
 * start time) + the app's document directory for audio files.
 * V1 stores whole meeting documents; the normalised schema from
 * Research 03 §2b arrives with search/sync.
 */
let db: SQLite.SQLiteDatabase | null = null;
const audioDir = () => new Directory(Paths.document, "audio");

function open(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync("ryu.db");
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY NOT NULL, uri TEXT NOT NULL, type TEXT NOT NULL);
  `);
  return db;
}

export const vault: Vault = {
  async init() {
    open();
    const dir = audioDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return { persistent: true };
  },
  async list() {
    const rows = await open().getAllAsync<{ json: string }>("SELECT json FROM meetings ORDER BY started_at DESC");
    return rows.map((r) => JSON.parse(r.json) as Meeting);
  },
  async save(m) {
    await open().runAsync("INSERT OR REPLACE INTO meetings (id, started_at, json) VALUES (?, ?, ?)", m.id, m.startedAt, JSON.stringify(m));
  },
  async remove(id) {
    const a = await this.getAudio(id);
    if (a?.uri) {
      const f = new File(a.uri);
      if (f.exists) f.delete();
    }
    await open().runAsync("DELETE FROM meetings WHERE id = ?", id);
    await open().runAsync("DELETE FROM audio WHERE id = ?", id);
  },
  async saveAudio(id, a: StoredAudio) {
    if (!a.uri) return;
    const ext = a.uri.split(".").pop() || "m4a";
    const dest = new File(audioDir(), `${id}.${ext}`);
    const src = new File(a.uri);
    if (src.uri !== dest.uri) src.moveSync(dest);
    await open().runAsync("INSERT OR REPLACE INTO audio (id, uri, type) VALUES (?, ?, ?)", id, dest.uri, a.type);
  },
  async getAudio(id) {
    const row = await open().getFirstAsync<{ uri: string; type: string }>("SELECT uri, type FROM audio WHERE id = ?", id);
    return row ? { uri: row.uri, type: row.type } : null;
  },
};
