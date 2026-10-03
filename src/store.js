import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Tiny JSON-file document store. Everything lives in memory and is flushed to
 * disk shortly after each change (atomic write via rename). Good enough for a
 * private server with a handful of players; swap for SQLite if it grows.
 */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    if (file && fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  collection(name) {
    this.data[name] ??= {};
    const docs = this.data[name];
    const store = this;
    return {
      get: (id) => docs[id] ?? null,
      all: () => Object.values(docs),
      find: (pred) => Object.values(docs).find(pred) ?? null,
      filter: (pred) => Object.values(docs).filter(pred),
      insert(doc) {
        const id = doc.id ?? crypto.randomUUID();
        docs[id] = { ...doc, id };
        store.changed();
        return docs[id];
      },
      update(id, patch) {
        if (!docs[id]) return null;
        docs[id] = typeof patch === 'function' ? patch(docs[id]) : { ...docs[id], ...patch };
        store.changed();
        return docs[id];
      },
      remove(id) {
        const existed = id in docs;
        delete docs[id];
        if (existed) store.changed();
        return existed;
      },
    };
  }

  changed() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
