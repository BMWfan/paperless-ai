/** Read-only source import. Never replace source files or merge into an existing learning history. */
import fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import type { Db } from '../db/database.js';
import { openLearningStore } from './store.js';
export const IMPORT_KEY = 'fork_learning_v2_import';
export const LEARNING_TABLES = [
  'learning_migrations', 'learning_document_snapshots', 'learning_change_events', 'learning_examples',
  'learning_settings', 'learning_candidates', 'learning_prediction_history', 'learning_review_history',
  'learning_legacy_overrides', 'learning_field_state', 'learning_event_fields', 'learning_field_sources',
] as const;
const legacyFeedback = `CREATE TABLE IF NOT EXISTS learning_feedback (
 id INTEGER PRIMARY KEY, document_id INTEGER, title TEXT, content_preview TEXT, tags TEXT,
 correspondent TEXT, document_type TEXT, corrected_by_user INTEGER DEFAULT 0,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;
export function initializeLearning(db: Db, legacyFile?: string) {
  openLearningStore(':memory:', { database: db }).close();
  if (!legacyFile || !fs.existsSync(legacyFile)) return openLearningStore(':memory:', { database: db });
  if (db.prepare('SELECT 1 FROM kv WHERE key=?').get(IMPORT_KEY)) return openLearningStore(':memory:', { database: db });
  const source = new BetterSqlite3(legacyFile, { readonly: true, fileMustExist: true });
  try {
    source.transaction(() => {
      const available = new Set((source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
      const tables = [...LEARNING_TABLES, 'learning_feedback'].filter(name => available.has(name));
      if (!tables.length) return;
      if (available.has('learning_migrations')) {
        const versions = source.prepare('SELECT version FROM learning_migrations').all() as { version: number }[];
        if (versions.some(row => row.version > 4)) throw new Error('Unsupported future learning schema; source left untouched');
      }
      db.transaction(() => {
        for (const table of LEARNING_TABLES.filter(name => name !== 'learning_migrations' && name !== 'learning_settings')) {
          if ((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n) throw new Error('Refusing to overwrite existing Learning v2 history');
        }
        if (available.has('learning_feedback')) {
          db.exec(legacyFeedback);
          if ((db.prepare('SELECT count(*) AS n FROM learning_feedback').get() as { n: number }).n)
            throw new Error('Refusing to overwrite existing legacy learning history');
        }
        const counts: Record<string, number> = {};
        for (const table of tables) {
          const targetColumns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name));
          const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name);
          if (!columns.length || columns.some(name => !targetColumns.has(name))) throw new Error(`Unsupported columns in ${table}`);
          const quoted = columns.map(name => `"${name.replaceAll('"', '""')}"`);
          const insert = db.prepare(`INSERT INTO ${table} (${quoted.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
          db.prepare(`DELETE FROM ${table}`).run();
          counts[table] = 0;
          for (const row of source.prepare(`SELECT * FROM ${table}`).iterate() as Iterable<Record<string, unknown>>) {
            for (const column of columns) if ((column.endsWith('_json') || column === 'json') && row[column] != null) JSON.parse(String(row[column]));
            insert.run(...columns.map(column => row[column])); counts[table]++;
          }
        }
        // Re-run additive migrations/backfill for older Learning v2 schemas inside this transaction.
        const store = openLearningStore(':memory:', { database: db });
        store.settings(); store.examples(true); store.fieldCorrections();
        db.prepare('INSERT INTO kv (key,value) VALUES (?,?)').run(IMPORT_KEY, JSON.stringify({ version: 1, counts }));
      })();
    })();
  } finally { source.close(); }
  return openLearningStore(':memory:', { database: db });
}
