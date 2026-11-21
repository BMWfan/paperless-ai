/** Read-only source import. Never replace source files or merge into an existing learning history. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import BetterSqlite3 from 'better-sqlite3';
import type { Db } from '../db/database.js';
import { openLearningStore } from './store.js';
const require = createRequire(import.meta.url);
const { normalizeDocumentMetadata } = require('./legacy/documentSnapshotService.cjs') as {
  normalizeDocumentMetadata(value: unknown): { correspondent: unknown; document_type: unknown; custom_fields: { field: number; value: unknown }[] };
};
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
const legacyArchive = `CREATE TABLE IF NOT EXISTS learning_feedback_archive (
 id INTEGER PRIMARY KEY, original_id INTEGER NOT NULL, document_id INTEGER NOT NULL,
 payload_json TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;
const optionalTables = [
  { name: 'learning_feedback', ddl: legacyFeedback },
  { name: 'learning_feedback_archive', ddl: legacyArchive },
];
/** Same confirmed-first duplicate policy as legacy models/document.js; target only. */
function normalizeLegacyFeedback(db: Db): number {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='learning_feedback'").get()) return 0;
  db.exec(legacyArchive);
  const duplicates = db.prepare(`SELECT * FROM learning_feedback WHERE document_id IN (
    SELECT document_id FROM learning_feedback WHERE document_id IS NOT NULL GROUP BY document_id HAVING count(*)>1
  ) ORDER BY document_id,corrected_by_user DESC,id DESC`).all() as { id: number; document_id: number }[];
  const retained = new Set<number>(); let archived = 0;
  for (const row of duplicates) {
    if (!retained.has(row.document_id)) { retained.add(row.document_id); continue; }
    db.prepare('INSERT INTO learning_feedback_archive(original_id,document_id,payload_json) VALUES(?,?,?)').run(row.id, row.document_id, JSON.stringify(row));
    db.prepare('DELETE FROM learning_feedback WHERE id=?').run(row.id); archived++;
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_feedback_document_id ON learning_feedback(document_id)');
  return archived;
}
/** Reject broken references before reopening can normalize or discard any imported proof. */
function assertLearningIntegrity(db: Db) {
  const invalid = [
    `SELECT 1 FROM learning_change_events WHERE status NOT IN ('pending','confirmed','rejected','deleted') LIMIT 1`,
    `SELECT 1 FROM learning_examples e LEFT JOIN learning_change_events c ON c.id=e.event_id
       WHERE c.id IS NULL OR c.document_id!=e.document_id OR c.status!='confirmed' OR c.metadata_json!=e.metadata_json LIMIT 1`,
    `SELECT 1 FROM learning_review_history h LEFT JOIN learning_change_events c ON c.id=h.event_id WHERE c.id IS NULL LIMIT 1`,
    `SELECT 1 FROM learning_event_fields f LEFT JOIN learning_change_events c ON c.id=f.event_id
       WHERE c.id IS NULL OR c.document_id!=f.document_id OR f.field_id<=0 OR f.generation<=0 LIMIT 1`,
    `SELECT 1 FROM learning_field_state f LEFT JOIN learning_document_snapshots d ON d.document_id=f.document_id
       WHERE d.document_id IS NULL OR f.synced_revision!=d.revision LIMIT 1`,
    `SELECT 1 FROM learning_field_sources f
       LEFT JOIN learning_change_events c ON c.id=f.event_id
       LEFT JOIN learning_field_state s ON s.document_id=f.document_id AND s.field_id=f.field_id
       LEFT JOIN learning_event_fields m ON m.event_id=f.event_id AND m.document_id=f.document_id AND m.field_id=f.field_id
       WHERE c.id IS NULL OR c.document_id!=f.document_id OR c.status!='confirmed'
         OR s.document_id IS NULL OR s.generation!=f.generation OR s.present!=1
         OR m.event_id IS NULL OR m.generation!=f.generation LIMIT 1`,
  ];
  if (invalid.some(query => db.prepare(query).get())) throw new Error('Inconsistent learning references; source left untouched');
  for (const row of db.prepare(`SELECT f.*,d.metadata_json FROM learning_field_state f
    JOIN learning_document_snapshots d ON d.document_id=f.document_id`).iterate() as Iterable<{ field_id: number; value_json: string; present: number; scope_json: string; metadata_json: string }>) {
    const metadata = normalizeDocumentMetadata(JSON.parse(row.metadata_json));
    const field = metadata.custom_fields.find(field => field.field === row.field_id);
    if (row.present !== Number(!!field) || row.value_json !== (field ? JSON.stringify(field.value) : 'null') ||
        row.scope_json !== JSON.stringify([metadata.correspondent, metadata.document_type]))
      throw new Error('Inconsistent learning references; source left untouched');
  }
}
export function initializeLearning(db: Db, legacyFile?: string) {
  openLearningStore(':memory:', { database: db }).close();
  if (!legacyFile || !fs.existsSync(legacyFile)) return openLearningStore(':memory:', { database: db });
  if (db.prepare('SELECT 1 FROM kv WHERE key=?').get(IMPORT_KEY)) return openLearningStore(':memory:', { database: db });
  const source = new BetterSqlite3(legacyFile, { readonly: true, fileMustExist: true });
  try {
    source.transaction(() => {
      const available = new Set((source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
      const tables = [...LEARNING_TABLES, ...optionalTables.map(table => table.name)].filter(name => available.has(name));
      if (!tables.length) return;
      if (available.has('learning_migrations')) {
        const versions = source.prepare('SELECT version FROM learning_migrations').all() as { version: number }[];
        if (versions.some(row => row.version > 4)) throw new Error('Unsupported future learning schema; source left untouched');
      }
      db.transaction(() => {
        for (const table of LEARNING_TABLES.filter(name => name !== 'learning_migrations' && name !== 'learning_settings')) {
          if ((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n) throw new Error('Refusing to overwrite existing Learning v2 history');
        }
        for (const table of optionalTables) {
          const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table.name);
          if (exists && (db.prepare(`SELECT count(*) AS n FROM ${table.name}`).get() as { n: number }).n)
            throw new Error('Refusing to overwrite existing legacy learning history');
          if (available.has(table.name)) db.exec(table.ddl);
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
            for (const column of columns) if ((column.endsWith('_json') || column === 'json') && row[column] != null) {
              let value: unknown;
              try { value = JSON.parse(String(row[column])); }
              catch { throw new Error(`Invalid JSON in learning table ${table}, column ${column}`); }
              if (['metadata_json', 'changes_json'].includes(column) && (!value || typeof value !== 'object' || Array.isArray(value)))
                throw new Error(`Invalid learning object in ${table}`);
            }
            insert.run(...columns.map(column => row[column])); counts[table]++;
          }
        }
        const archivedDuplicates = normalizeLegacyFeedback(db);
        assertLearningIntegrity(db);
        // Re-run additive migrations/backfill for older Learning v2 schemas inside this transaction.
        const store = openLearningStore(':memory:', { database: db });
        store.configure(store.settings()); store.examples(true); store.fieldCorrections();
        assertLearningIntegrity(db);
        db.prepare('INSERT INTO kv (key,value) VALUES (?,?)').run(IMPORT_KEY, JSON.stringify({ version: 1, counts, archivedDuplicates }));
      })();
    })();
  } finally { source.close(); }
  return openLearningStore(':memory:', { database: db });
}
