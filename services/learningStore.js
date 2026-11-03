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
      CREATE TABLE IF NOT EXISTS learning_candidates (
        document_id INTEGER PRIMARY KEY, metadata_json TEXT NOT NULL, first_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS learning_prediction_history (
        id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS learning_review_history (
        id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, decision TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS learning_legacy_overrides (
        document_id INTEGER PRIMARY KEY, reason TEXT NOT NULL, actor TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS idx_learning_events_document ON learning_change_events(document_id,id);`);
    db.prepare('INSERT OR IGNORE INTO learning_settings VALUES(1,?)').run(JSON.stringify({
      mode: 'hybrid', enabled: process.env.LEARNING_MONITOR_ENABLED === 'true', intervalMs: 900000, stabilizationMs: 30000
    }));
    const columns = new Set(db.prepare('PRAGMA table_info(learning_change_events)').all().map(c => c.name));
    for (const [name, type] of Object.entries({ metadata_json: "TEXT NOT NULL DEFAULT '{}'", source: "TEXT NOT NULL DEFAULT 'unknown'", content_preview: "TEXT NOT NULL DEFAULT ''" })) {
      if (!columns.has(name)) db.exec(`ALTER TABLE learning_change_events ADD COLUMN ${name} ${type}`);
    }
    db.prepare('INSERT OR IGNORE INTO learning_migrations VALUES(2)').run();
    const snapshotColumns = db.prepare('PRAGMA table_info(learning_document_snapshots)').all();
    if (!snapshotColumns.some(column => column.name === 'revision')) {
      db.exec('ALTER TABLE learning_document_snapshots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    }
    const reviewColumns = db.prepare('PRAGMA table_info(learning_review_history)').all();
    if (!reviewColumns.some(column => column.name === 'actor')) {
      db.exec("ALTER TABLE learning_review_history ADD COLUMN actor TEXT NOT NULL DEFAULT 'system'");
    }
    db.prepare('INSERT OR IGNORE INTO learning_migrations VALUES(3)').run();
  })();
  const settings = () => JSON.parse(db.prepare('SELECT json FROM learning_settings WHERE id=1').get().json);
  const suppressLegacy = (id, reason, actor = 'system') => db.prepare(
    'INSERT OR IGNORE INTO learning_legacy_overrides(document_id,reason,actor) VALUES(?,?,?)'
  ).run(id, reason, String(actor).slice(0,100));
  const hasLegacy = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='learning_feedback'").get();
  const parseTags = value => {
    try { const tags = JSON.parse(value || '[]'); return Array.isArray(tags) ? tags : []; }
    catch { return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean); }
  };
  const saveExample = db.prepare(`INSERT INTO learning_examples(document_id,event_id,metadata_json,content_preview)
    VALUES(@document_id,@id,@metadata_json,@content_preview) ON CONFLICT(document_id) DO UPDATE SET
    event_id=excluded.event_id, metadata_json=excluded.metadata_json,
    content_preview=excluded.content_preview, updated_at=CURRENT_TIMESTAMP`);
  const review = db.transaction((id, decision, actor = 'system') => {
    if (!['confirmed', 'rejected', 'deleted'].includes(decision)) throw new TypeError('Invalid review decision');
    const event = db.prepare('SELECT * FROM learning_change_events WHERE id=?').get(id);
    if (!event || (decision === 'deleted' ? event.status !== 'confirmed' : event.status !== 'pending')) return false;
    if (decision === 'confirmed') {
      // Do not resurrect stale corrections after a later document edit.
      const latest = db.prepare('SELECT metadata_json FROM learning_document_snapshots WHERE document_id=?').get(event.document_id);
      if (!latest || latest.metadata_json !== event.metadata_json) throw new Error('Stale correction; refresh document first');
      saveExample.run(event);
      suppressLegacy(event.document_id, 'v2_managed', actor);
    }
    if (decision === 'deleted') {
      db.prepare('DELETE FROM learning_examples WHERE event_id=?').run(id);
      suppressLegacy(event.document_id, 'revoked', actor);
    }
    db.prepare('UPDATE learning_change_events SET status=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(decision, id);
    db.prepare('INSERT INTO learning_review_history(event_id,decision,actor) VALUES(?,?,?)').run(id, decision, String(actor).slice(0,100));
    return true;
  });
  const observe = db.transaction((document, source = 'observed', options = {}) => {
    const documentId = Number(document.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new TypeError('Invalid document ID');
    const normalized = normalizeDocumentMetadata(document);
    const json = JSON.stringify(normalized);
    const prior = db.prepare('SELECT metadata_json,revision FROM learning_document_snapshots WHERE document_id=?').get(documentId);
    if (options.expectedRevision !== undefined && options.expectedRevision !== (prior?.revision || 0)) return { documentId, skipped: true };
    const changes = prior ? compareDocumentMetadata(JSON.parse(prior.metadata_json), normalized) : {};
    const changed = Object.keys(changes).length > 0;
    if (source === 'confirmed_ui' && changed) suppressLegacy(documentId, 'v2_managed', options.actor);
    if (prior && changed && source !== 'self_write' && options.stabilizationMs > 0) {
      const candidate = db.prepare('SELECT * FROM learning_candidates WHERE document_id=?').get(documentId);
      if (!candidate || candidate.metadata_json !== json) {
        db.prepare('INSERT OR REPLACE INTO learning_candidates VALUES(?,?,?)').run(documentId, json, Date.now());
        return { documentId, stabilizing: true, pendingReview: false };
      }
      if (Date.now() - candidate.first_seen < options.stabilizationMs) return { documentId, stabilizing: true, pendingReview: false };
    }
    db.prepare('DELETE FROM learning_candidates WHERE document_id=?').run(documentId);
    db.prepare(`INSERT INTO learning_document_snapshots(document_id,metadata_json,source,revision) VALUES(?,?,?,1)
      ON CONFLICT(document_id) DO UPDATE SET metadata_json=excluded.metadata_json,source=excluded.source,updated_at=CURRENT_TIMESTAMP,revision=revision+1`).run(documentId,json,source);
    let eventId;
    let pendingReview = false;
    if (changed && source !== 'self_write' && settings().mode !== 'disabled') {
      eventId = Number(db.prepare(`INSERT INTO learning_change_events(document_id,changes_json,metadata_json,source,content_preview)
        VALUES(?,?,?,?,?)`).run(documentId,JSON.stringify(changes),json,source,String(document.content || '').slice(0,2000)).lastInsertRowid);
      // Only authenticated, explicit in-app feedback can qualify for automatic acceptance.
      const automatic = source === 'confirmed_ui' && ['automatic','hybrid'].includes(settings().mode);
      if (automatic) review(eventId,'confirmed',options.actor);
      pendingReview = !automatic;
    }
    return { documentId, baselineCreated: !prior, changes, eventId, pendingReview };
  });
  const eventsQuery = (status, query) => [status || '',status || '',`%${String(query || '').slice(0,100)}%`,`%${String(query || '').slice(0,100)}%`];
  const eventWhere = "WHERE (?='' OR status=?) AND (CAST(document_id AS TEXT) LIKE ? OR metadata_json LIKE ?)";
  const limitValue = limit => Math.max(1,Math.min(200,Math.floor(Number(limit)||100)));
  const offsetValue = offset => Math.max(0,Math.min(10000000,Math.floor(Number(offset)||0)));
  return {
    observe, review, settings,
    snapshotRevisions() { return new Map(db.prepare('SELECT document_id,revision FROM learning_document_snapshots').all().map(row => [row.document_id,row.revision])); },
    needsContent(document) {
      const prior = db.prepare('SELECT metadata_json FROM learning_document_snapshots WHERE document_id=?').get(Number(document.id));
      return !!prior && Object.keys(compareDocumentMetadata(JSON.parse(prior.metadata_json),document)).length > 0;
    },
    configure(value) {
      if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !['mode','enabled','intervalMs','stabilizationMs'].includes(key))) throw new TypeError('Invalid learning settings');
      const next = { ...settings(), ...value };
      if (!['automatic','manual','hybrid','disabled'].includes(next.mode) || typeof next.enabled !== 'boolean' ||
        !Number.isFinite(next.intervalMs) || next.intervalMs < 1000 || next.intervalMs > 86400000 ||
        !Number.isFinite(next.stabilizationMs) || next.stabilizationMs < 0 || next.stabilizationMs > 3600000) throw new TypeError('Invalid learning settings');
      db.prepare('UPDATE learning_settings SET json=? WHERE id=1').run(JSON.stringify(next));
      return next;
    },
    list(status, query = '', limit = 100, offset = 0) {
      return db.prepare(`SELECT *,EXISTS(SELECT 1 FROM learning_examples e WHERE e.event_id=learning_change_events.id) AS retainedExample,
        EXISTS(SELECT 1 FROM learning_examples e JOIN learning_document_snapshots s ON s.document_id=e.document_id
          WHERE e.event_id=learning_change_events.id AND e.metadata_json=s.metadata_json) AS activeExample
        FROM learning_change_events ${eventWhere} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...eventsQuery(status,query),limitValue(limit),offsetValue(offset))
        .map(row => ({ ...row, changes: JSON.parse(row.changes_json), metadata: JSON.parse(row.metadata_json) }));
    },
    page(status, query, limit = 50, offset = 0) {
      const total = db.prepare(`SELECT COUNT(*) AS n FROM learning_change_events ${eventWhere}`).get(...eventsQuery(status,query)).n;
      const events = this.list(status,query,limit,offset);
      return { events, total, limit: limitValue(limit), offset: offsetValue(offset), hasMore: offsetValue(offset) + events.length < total };
    },
    listPending(limit = 50) { return this.list('pending','',limit); },
    event(id) { return db.prepare('SELECT document_id,status FROM learning_change_events WHERE id=?').get(id) || null; },
    examples(includeStale = false) {
      return db.prepare(`SELECT e.*,e.metadata_json=s.metadata_json AS active FROM learning_examples e
        LEFT JOIN learning_document_snapshots s ON s.document_id=e.document_id
        ${includeStale ? '' : 'WHERE e.metadata_json=s.metadata_json'} ORDER BY e.updated_at DESC ${includeStale ? '' : 'LIMIT 500'}`)
        .all().map(row => ({ ...row, active: !!row.active, metadata: JSON.parse(row.metadata_json) }));
    },
    protectedMetadata(id) { const row = db.prepare('SELECT metadata_json FROM learning_examples WHERE document_id=?').get(id); return row ? JSON.parse(row.metadata_json) : null; },
    isLegacySuppressed(id) { return !!db.prepare('SELECT 1 FROM learning_legacy_overrides WHERE document_id=?').get(id); },
    legacyExamples() {
      if (!hasLegacy()) return [];
      return db.prepare(`SELECT f.* FROM learning_feedback f WHERE corrected_by_user=1
        AND NOT EXISTS (SELECT 1 FROM learning_legacy_overrides o WHERE o.document_id=f.document_id)
        ORDER BY document_id DESC`).all().map(row => ({ document_id: row.document_id, legacy: true, source: 'legacy_user',
          metadata: { title: row.title || '', tags: parseTags(row.tags), correspondent: row.correspondent || null,
            document_type: row.document_type || null }, content_preview: row.content_preview || '', updated_at: row.updated_at }));
    },
    revokeLegacy: db.transaction((id, actor = 'system') => {
      if (!hasLegacy() || !db.prepare('SELECT 1 FROM learning_feedback WHERE document_id=? AND corrected_by_user=1').get(id)) return false;
      return suppressLegacy(id,'revoked',actor).changes > 0;
    }),
    history(documentId, limit = 50, offset = 0) {
      const id = Number(documentId) || 0;
      return db.prepare(`SELECT h.id,h.event_id,e.document_id,h.decision,h.actor,h.created_at,e.source
        FROM learning_review_history h JOIN learning_change_events e ON e.id=h.event_id
        WHERE (?=0 OR e.document_id=?) UNION ALL
        SELECT NULL AS id,NULL AS event_id,document_id,reason AS decision,actor,created_at,'legacy_user' AS source
        FROM learning_legacy_overrides WHERE reason='revoked' AND (?=0 OR document_id=?)
        ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(id,id,id,id,limitValue(limit),offsetValue(offset));
    },
    summary() {
      const statuses = Object.fromEntries(db.prepare('SELECT status,COUNT(*) AS n FROM learning_change_events GROUP BY status').all().map(row => [row.status,row.n]));
      const activeExamples = db.prepare('SELECT COUNT(*) AS n FROM learning_examples e JOIN learning_document_snapshots s ON s.document_id=e.document_id AND s.metadata_json=e.metadata_json').get().n;
      return { ...statuses, activeExamples, legacyExamples: this.legacyExamples().length };
    },
    prediction(id, value) { db.prepare('INSERT INTO learning_prediction_history(document_id,metadata_json) VALUES(?,?)').run(id,JSON.stringify(value)); },
    close() { db.close(); }
  };
}
module.exports = { openLearningStore };
