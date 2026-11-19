import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppContext } from '../../src/server/context.js';
import { openDatabase, type Db } from '../../src/server/db/database.js';
import { initializeLearning, IMPORT_KEY, LEARNING_TABLES } from '../../src/server/learning/migration.js';
import { openLearningStore } from '../../src/server/learning/store.js';
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
const document = (title: string, value = 'CURRENT-1') => ({ id: 1, title, tags: [1], correspondent: 2, document_type: 3, custom_fields: [{ field: 4, value }], content: 'Synthetic learning migration document' });
function target() { const db = openDatabase(':memory:'); cleanup.push(() => { if (db.open) db.close(); }); return db; }
function sourceFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperless-learning-migration-'));
  cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'documents.db');
  const store = openLearningStore(file);
  store.configure({ mode: 'hybrid', enabled: true, stabilizationMs: 0 });
  store.observe(document('Before'));
  const event = store.observe(document('Confirmed', 'CURRENT-2'), 'confirmed_ui', { actor: 'user:1' });
  expect(event.eventId).toBeTypeOf('number');
  store.observe(document('Unknown title', 'CURRENT-2'), 'unknown');
  const fields = store.fieldCorrections();
  const examples = store.examples(true);
  store.close();
  return { file, fields, examples };
}
function tableCounts(db: Db) {
  return Object.fromEntries(LEARNING_TABLES.map(name => [name, (db.prepare(`SELECT count(*) AS n FROM ${name}`).get() as { n: number }).n]));
}
function sha(file: string) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

// Legacy schema from models/document.js at fork baseline 363c0c6 (including its duplicate archive).
function legacyRows(file: string, duplicates = false) {
  const source = openLearningStore(file);
  source.database.exec(`CREATE TABLE learning_feedback (
    id INTEGER PRIMARY KEY,document_id INTEGER,title TEXT,content_preview TEXT,tags TEXT,
    correspondent TEXT,document_type TEXT,corrected_by_user INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE learning_feedback_archive (id INTEGER PRIMARY KEY,original_id INTEGER NOT NULL,
      document_id INTEGER NOT NULL,payload_json TEXT NOT NULL,archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const insert = source.database.prepare('INSERT INTO learning_feedback(id,document_id,title,tags,corrected_by_user) VALUES(?,10,?,?,?)');
  insert.run(1, 'Confirmed legacy correction', '["invoice"]', 1);
  if (duplicates) { insert.run(2, 'Newer unconfirmed prediction', '[]', 0); insert.run(3, 'Latest unconfirmed prediction', '[]', 0); }
  source.database.prepare('INSERT INTO learning_feedback_archive(original_id,document_id,payload_json) VALUES(?,?,?)').run(99, 10, JSON.stringify({ title: 'Preserved old prediction', corrected_by_user: 0 }));
  const feedback = source.database.prepare('SELECT * FROM learning_feedback ORDER BY id').all();
  const archive = source.database.prepare('SELECT * FROM learning_feedback_archive ORDER BY id').all();
  source.close(); return { feedback, archive };
}

describe('Learning v2 import into upstream4 database', () => {
  it('initializes isolated memory databases without closing the upstream connection', () => {
    const db = target(), store = initializeLearning(db);
    expect(store.settings().mode).toBe('hybrid'); store.close();
    expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
  });
  it('preserves settings, stale examples, review history and current field-source generations without changing source bytes', () => {
    const source = sourceFixture(), before = sha(source.file), db = target();
    const store = initializeLearning(db, source.file);
    expect(sha(source.file)).toBe(before);
    expect(store.settings()).toMatchObject({ enabled: true, mode: 'hybrid' });
    expect(store.examples()).toHaveLength(0); // A later unknown title made the document example stale.
    expect(store.examples(true)).toEqual(source.examples);
    expect(store.fieldCorrections()).toEqual(source.fields);
    expect(store.fieldCorrections()).toHaveLength(1);
    expect(store.history()).toHaveLength(1);
    expect(store.list('pending')).toHaveLength(1);
    expect(db.prepare('SELECT value FROM kv WHERE key=?').get(IMPORT_KEY)).toBeTruthy();
  });
  it('is idempotent and never replaces later target corrections on a second startup', () => {
    const source = sourceFixture(), db = target(), store = initializeLearning(db, source.file);
    store.observe(document('New after migration', 'CURRENT-3'), 'confirmed_ui', { actor: 'user:2' });
    const counts = tableCounts(db), fields = store.fieldCorrections();
    const again = initializeLearning(db, source.file);
    expect(tableCounts(db)).toEqual(counts); expect(again.fieldCorrections()).toEqual(fields);
  });
  it('refuses to overwrite pre-existing target learning history', () => {
    const source = sourceFixture(), db = target(), store = initializeLearning(db);
    store.observe(document('Existing target'));
    const before = tableCounts(db);
    expect(() => initializeLearning(db, source.file)).toThrow(/Refusing to overwrite/);
    expect(tableCounts(db)).toEqual(before);
    expect(db.prepare('SELECT value FROM kv WHERE key=?').get(IMPORT_KEY)).toBeUndefined();
  });
  it('rolls back copied rows and the import marker if any source JSON is corrupt', () => {
    const source = sourceFixture(), broken = openLearningStore(source.file);
    broken.database.prepare("UPDATE learning_change_events SET metadata_json='invalid-json' WHERE id=(SELECT min(id) FROM learning_change_events)").run(); broken.close();
    const before = sha(source.file), db = target(); initializeLearning(db);
    const counts = tableCounts(db);
    expect(() => initializeLearning(db, source.file)).toThrow(/Invalid JSON in learning table learning_change_events/);
    expect(tableCounts(db)).toEqual(counts); expect(sha(source.file)).toBe(before);
    expect(db.prepare('SELECT value FROM kv WHERE key=?').get(IMPORT_KEY)).toBeUndefined();
  });
  it('rejects unknown future learning schema versions instead of silently dropping fields', () => {
    const source = sourceFixture(), future = openLearningStore(source.file);
    future.database.prepare('INSERT INTO learning_migrations VALUES(99)').run(); future.close();
    expect(() => initializeLearning(target(), source.file)).toThrow(/future learning schema/);
  });
  it('upgrades older schemas and backfills confirmed field proof only inside the target', () => {
    const source = sourceFixture(), old = openLearningStore(source.file);
    // The later unknown title prevents document-level proof; use a separate current confirmed event.
    old.observe({ ...document('Legacy baseline'), id: 2 });
    old.observe({ ...document('Legacy confirmed', 'OLDER-CONFIRMED'), id: 2 }, 'confirmed_ui', { actor: 'user:1' });
    old.database.exec('DELETE FROM learning_migrations WHERE version>=3; DROP TABLE learning_field_sources; DROP TABLE learning_event_fields; DROP TABLE learning_field_state;'); old.close();
    const before = sha(source.file), db = target(), migrated = initializeLearning(db, source.file);
    expect(migrated.fieldCorrections().some((row) => (row as { document_id: number }).document_id === 2)).toBe(true);
    expect(db.prepare('SELECT version FROM learning_migrations WHERE version=4').get()).toEqual({ version: 4 });
    expect(sha(source.file)).toBe(before);
  });
  it('keeps unknown/automatic edits unconfirmed and trusts only explicit confirmed UI correction', () => {
    const db = target(), store = initializeLearning(db); store.configure({ enabled: true, mode: 'hybrid' });
    store.observe(document('Baseline'));
    store.observe(document('Automatic'), 'self_write'); expect(store.list()).toHaveLength(0);
    store.observe(document('External'), 'unknown'); expect(store.list('pending')).toHaveLength(1); expect(store.examples()).toHaveLength(0);
    store.observe(document('Explicit'), 'confirmed_ui', { actor: 'user:1' }); expect(store.examples()).toHaveLength(1);
  });
  it.each([
    'UPDATE learning_examples SET event_id=999999',
    'UPDATE learning_review_history SET event_id=999999',
    'UPDATE learning_field_sources SET generation=generation+1',
    `UPDATE learning_field_state SET value_json='"WRONG"'`,
    `UPDATE learning_field_state SET scope_json='[999,999]'`,
  ])('rejects broken proof without silently dropping imported history: %s', sql => {
    const source = sourceFixture(), broken = openLearningStore(source.file);
    expect(broken.database.prepare(sql).run().changes).toBeGreaterThan(0); broken.close();
    const before = sha(source.file), db = target(); initializeLearning(db);
    const counts = tableCounts(db);
    expect(() => initializeLearning(db, source.file)).toThrow(/Inconsistent learning references/);
    expect(tableCounts(db)).toEqual(counts); expect(sha(source.file)).toBe(before);
    expect(db.prepare('SELECT value FROM kv WHERE key=?').get(IMPORT_KEY)).toBeUndefined();
  });
  it('rejects syntactically valid JSON that cannot be document metadata', () => {
    const source = sourceFixture(), broken = openLearningStore(source.file);
    broken.database.prepare("UPDATE learning_change_events SET metadata_json='[]'").run(); broken.close();
    const before = sha(source.file), db = target(); initializeLearning(db);
    const counts = tableCounts(db);
    expect(() => initializeLearning(db, source.file)).toThrow(/Invalid learning object/);
    expect(tableCounts(db)).toEqual(counts); expect(sha(source.file)).toBe(before);
  });

  it('imports through the real file-backed AppContext and preserves new settings across restart', () => {
    const source = sourceFixture(), before = sha(source.file), dataDir = path.dirname(source.file);
    const first = new AppContext({ dataDir, env: {} });
    try {
      expect(first.learning.examples(true)).toEqual(source.examples);
      first.learning.configure({ mode: 'manual', enabled: false });
    } finally { first.close(); }
    const second = new AppContext({ dataDir, env: {} });
    try {
      expect(second.learning.settings()).toMatchObject({ mode: 'manual', enabled: false });
      expect(second.learning.fieldCorrections()).toEqual(source.fields);
    } finally { second.close(); }
    expect(sha(source.file)).toBe(before);
  });
  it('rolls back invalid persisted settings rather than enabling an unsupported learning mode', () => {
    const source = sourceFixture(), broken = openLearningStore(source.file);
    broken.database.prepare('UPDATE learning_settings SET json=?').run(JSON.stringify({ ...broken.settings(), mode: 'unrecognized' })); broken.close();
    const before = sha(source.file), db = target(); initializeLearning(db); const counts = tableCounts(db);
    expect(() => initializeLearning(db, source.file)).toThrow(/Invalid learning settings/);
    expect(tableCounts(db)).toEqual(counts); expect(sha(source.file)).toBe(before);
    expect(db.prepare('SELECT value FROM kv WHERE key=?').get(IMPORT_KEY)).toBeUndefined();
  });

  it('preserves the original legacy duplicate archive rather than dropping its audit rows', () => {
    const source = sourceFixture(), rows = legacyRows(source.file), before = sha(source.file), db = target();
    const imported = initializeLearning(db, source.file);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='learning_feedback_archive'").get()).toBeDefined();
    expect(db.prepare('SELECT * FROM learning_feedback_archive ORDER BY id').all()).toEqual(rows.archive);
    expect(db.prepare('SELECT * FROM learning_feedback ORDER BY id').all()).toEqual(rows.feedback);
    expect(imported.legacyExamples()).toHaveLength(1);
    expect(sha(source.file)).toBe(before);
  });
  it('retains confirmed legacy feedback ahead of newer predictions and archives duplicates only in the target', () => {
    const source = sourceFixture(), rows = legacyRows(source.file, true), before = sha(source.file), db = target();
    initializeLearning(db, source.file);
    expect(db.prepare('SELECT * FROM learning_feedback').all()).toEqual([rows.feedback[0]]);
    expect(db.prepare('SELECT count(*) AS n FROM learning_feedback_archive').get()).toEqual({ n: 3 });
    initializeLearning(db, source.file);
    expect(db.prepare('SELECT count(*) AS n FROM learning_feedback_archive').get()).toEqual({ n: 3 });
    expect(sha(source.file)).toBe(before);
  });

  it('pages legacy corrections and revokes only the selected document without touching the source', () => {
    const source = sourceFixture(); legacyRows(source.file);
    const legacy = openLearningStore(source.file);
    legacy.database.prepare('INSERT INTO learning_feedback(document_id,title,corrected_by_user) VALUES(?,?,1)').run(20, 'Second correction');
    legacy.database.prepare('INSERT INTO learning_feedback(document_id,title,corrected_by_user) VALUES(?,?,1)').run(30, 'Third correction'); legacy.close();
    const before = sha(source.file), db = target(), store = initializeLearning(db, source.file);
    expect(store.legacyPage(1, 0)).toMatchObject({ total: 3, hasMore: true, examples: [{ document_id: 30 }] });
    expect(store.legacyPage(1, 1).examples[0].document_id).toBe(20);
    expect(store.hasLegacyExample(20)).toBe(true);
    expect(store.revokeLegacy(20, 'user:1')).toBe(true);
    expect(store.hasLegacyExample(20)).toBe(false); expect(store.hasLegacyExample(10)).toBe(true);
    expect(store.legacyPage(10, 0).examples.map(row => row.document_id)).toEqual([30, 10]);
    expect(store.history(20)).toEqual(expect.arrayContaining([expect.objectContaining({ decision: 'revoked', actor: 'user:1' })]));
    initializeLearning(db, source.file);
    expect(store.hasLegacyExample(20)).toBe(false); expect(sha(source.file)).toBe(before);
  });

});
