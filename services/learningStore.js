'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { normalizeDocumentMetadata, compareDocumentMetadata } = require('./documentSnapshotService');

function openLearningStore(databasePath = path.join(process.cwd(), 'data', 'documents.db')) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_document_snapshots (
      document_id INTEGER PRIMARY KEY,
      metadata_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'observed',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS learning_change_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      changes_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_learning_change_events_status
      ON learning_change_events(status, created_at);
  `);
  const getSnapshot = db.prepare('SELECT metadata_json FROM learning_document_snapshots WHERE document_id = ?');
  const upsertSnapshot = db.prepare(`INSERT INTO learning_document_snapshots(document_id, metadata_json, source)
    VALUES (?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET metadata_json=excluded.metadata_json,
      source=excluded.source, updated_at=CURRENT_TIMESTAMP`);
  const addEvent = db.prepare('INSERT INTO learning_change_events(document_id, changes_json) VALUES (?, ?)');
  const observe = db.transaction((document, source = 'observed') => {
    const documentId = Number(document.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new TypeError('Invalid document ID');
    const normalized = normalizeDocumentMetadata(document);
    const prior = getSnapshot.get(documentId);
    const changes = prior ? compareDocumentMetadata(JSON.parse(prior.metadata_json), normalized) : {};
    // First observation establishes a baseline. Unknown changes are always pending review.
    if (Object.keys(changes).length && source !== 'self_write') {
      addEvent.run(documentId, JSON.stringify(changes));
    }
    upsertSnapshot.run(documentId, JSON.stringify(normalized), source);
    return { documentId, baselineCreated: !prior, changes, pendingReview: Object.keys(changes).length > 0 && source !== 'self_write' };
  });
  return {
    observe,
    listPending(limit = 50) {
      return db.prepare(`SELECT id, document_id, changes_json, created_at
        FROM learning_change_events WHERE status = 'pending' ORDER BY id DESC LIMIT ?`)
        .all(Math.max(1, Math.min(200, Number(limit) || 50)))
        .map(row => ({ ...row, changes: JSON.parse(row.changes_json) }));
    },
    review(eventId, decision) {
      if (!['confirmed', 'rejected'].includes(decision)) throw new TypeError('Invalid review decision');
      return db.prepare(`UPDATE learning_change_events SET status = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'`).run(decision, eventId).changes > 0;
    },
    close() { db.close(); }
  };
}

module.exports = { openLearningStore };
