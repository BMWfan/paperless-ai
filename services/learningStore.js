'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { normalizeDocumentMetadata, compareDocumentMetadata } = require('./documentSnapshotService');

function openLearningStore(databasePath = path.join(process.cwd(), 'data', 'documents.db')) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS learning_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS learning_document_snapshots (
        document_id INTEGER PRIMARY KEY, metadata_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'observed', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS learning_change_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL,
        changes_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT);
      CREATE INDEX IF NOT EXISTS idx_learning_change_events_status ON learning_change_events(status,created_at);
      CREATE TABLE IF NOT EXISTS learning_examples (
        document_id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, metadata_json TEXT NOT NULL,
        content_preview TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS learning_settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      INSERT OR IGNORE INTO learning_settings VALUES(1, '{"mode":"hybrid","enabled":false,"intervalMs":900000,"stabilizationMs":30000}');
      CREATE TABLE IF NOT EXISTS learning_candidates (
        document_id INTEGER PRIMARY KEY, metadata_json TEXT NOT NULL, first_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS learning_prediction_history (
        id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS learning_review_history (
        id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, decision TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    const columns = new Set(db.prepare('PRAGMA table_info(learning_change_events)').all().map(c => c.name));
    for (const [name, type] of Object.entries({ metadata_json: "TEXT NOT NULL DEFAULT '{}'", source: "TEXT NOT NULL DEFAULT 'unknown'", content_preview: "TEXT NOT NULL DEFAULT ''" })) {
      if (!columns.has(name)) db.exec(`ALTER TABLE learning_change_events ADD COLUMN ${name} ${type}`);
    }
    db.prepare('INSERT OR IGNORE INTO learning_migrations VALUES(2)').run();
  })();
  const settings = () => JSON.parse(db.prepare('SELECT json FROM learning_settings WHERE id=1').get().json);
  const saveExample = db.prepare(`INSERT INTO learning_examples(document_id,event_id,metadata_json,content_preview)
    VALUES(@document_id,@id,@metadata_json,@content_preview) ON CONFLICT(document_id) DO UPDATE SET
    event_id=excluded.event_id, metadata_json=excluded.metadata_json,
    content_preview=excluded.content_preview, updated_at=CURRENT_TIMESTAMP`);
  const review = db.transaction((id, decision) => {
    if (!['confirmed', 'rejected', 'deleted'].includes(decision)) throw new TypeError('Invalid review decision');
    const event = db.prepare('SELECT * FROM learning_change_events WHERE id=?').get(id);
    if (!event || (decision !== 'deleted' && event.status !== 'pending')) return false;
    if (decision === 'confirmed') {
      // Do not resurrect stale corrections after a later document edit.
      const latest = db.prepare('SELECT metadata_json FROM learning_document_snapshots WHERE document_id=?').get(event.document_id);
      if (!latest || latest.metadata_json !== event.metadata_json) throw new Error('Stale correction; refresh document first');
      saveExample.run(event);
    }
    if (decision === 'deleted') db.prepare('DELETE FROM learning_examples WHERE event_id=?').run(id);
    db.prepare('UPDATE learning_change_events SET status=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(decision, id);
    db.prepare('INSERT INTO learning_review_history(event_id,decision) VALUES(?,?)').run(id, decision);
    return true;
  });
  const observe = db.transaction((document, source = 'observed', options = {}) => {
    const documentId = Number(document.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new TypeError('Invalid document ID');
    const normalized = normalizeDocumentMetadata(document);
    const json = JSON.stringify(normalized);
    const prior = db.prepare('SELECT metadata_json FROM learning_document_snapshots WHERE document_id=?').get(documentId);
    const changes = prior ? compareDocumentMetadata(JSON.parse(prior.metadata_json), normalized) : {};
    const changed = Object.keys(changes).length > 0;
    if (prior && changed && source !== 'self_write' && options.stabilizationMs > 0) {
      const candidate = db.prepare('SELECT * FROM learning_candidates WHERE document_id=?').get(documentId);
      if (!candidate || candidate.metadata_json !== json) {
        db.prepare('INSERT OR REPLACE INTO learning_candidates VALUES(?,?,?)').run(documentId, json, Date.now());
        return { documentId, stabilizing: true, pendingReview: false };
      }
      if (Date.now() - candidate.first_seen < options.stabilizationMs) return { documentId, stabilizing: true, pendingReview: false };
    }
    db.prepare('DELETE FROM learning_candidates WHERE document_id=?').run(documentId);
    db.prepare(`INSERT INTO learning_document_snapshots(document_id,metadata_json,source) VALUES(?,?,?)
      ON CONFLICT(document_id) DO UPDATE SET metadata_json=excluded.metadata_json,source=excluded.source,updated_at=CURRENT_TIMESTAMP`).run(documentId,json,source);
    let eventId;
    if (changed && source !== 'self_write') {
      eventId = Number(db.prepare(`INSERT INTO learning_change_events(document_id,changes_json,metadata_json,source,content_preview)
        VALUES(?,?,?,?,?)`).run(documentId,JSON.stringify(changes),json,source,String(document.content || '').slice(0,2000)).lastInsertRowid);
      // Only authenticated, explicit in-app feedback can qualify for automatic acceptance.
      if (source === 'confirmed_ui' && ['automatic','hybrid'].includes(settings().mode)) review(eventId,'confirmed');
    }
    return { documentId, baselineCreated: !prior, changes, eventId, pendingReview: changed && source !== 'self_write' };
  });
  return {
    observe, review, settings,
    configure(value) {
      const next = { ...settings(), ...value };
      if (!['automatic','manual','hybrid','disabled'].includes(next.mode) || typeof next.enabled !== 'boolean' ||
        !Number.isFinite(next.intervalMs) || next.intervalMs < 1000 || next.intervalMs > 86400000 ||
        !Number.isFinite(next.stabilizationMs) || next.stabilizationMs < 0 || next.stabilizationMs > 3600000) throw new TypeError('Invalid learning settings');
      db.prepare('UPDATE learning_settings SET json=? WHERE id=1').run(JSON.stringify(next));
      return next;
    },
    list(status, query = '', limit = 100) {
      return db.prepare(`SELECT * FROM learning_change_events WHERE (?='' OR status=?)
        AND (CAST(document_id AS TEXT) LIKE ? OR metadata_json LIKE ?) ORDER BY id DESC LIMIT ?`)
        .all(status || '',status || '',`%${String(query).slice(0,100)}%`,`%${String(query).slice(0,100)}%`,Math.max(1,Math.min(200,Number(limit)||100)))
        .map(row => ({ ...row, changes: JSON.parse(row.changes_json), metadata: JSON.parse(row.metadata_json) }));
    },
    listPending(limit = 50) { return this.list('pending','',limit); },
    examples() { return db.prepare('SELECT e.* FROM learning_examples e JOIN learning_document_snapshots s ON s.document_id=e.document_id AND s.metadata_json=e.metadata_json ORDER BY e.updated_at DESC LIMIT 500').all().map(row => ({ ...row, metadata: JSON.parse(row.metadata_json) })); },
    protectedMetadata(id) { const row = db.prepare('SELECT metadata_json FROM learning_examples WHERE document_id=?').get(id); return row ? JSON.parse(row.metadata_json) : null; },
    prediction(id, value) { db.prepare('INSERT INTO learning_prediction_history(document_id,metadata_json) VALUES(?,?)').run(id,JSON.stringify(value)); },
    close() { db.close(); }
  };
}
module.exports = { openLearningStore };
