import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
    expect(() => initializeLearning(db, source.file)).toThrow();
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
});
