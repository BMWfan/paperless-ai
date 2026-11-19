/** Synthetic input using the pre-v4 learning_feedback schema. Never call on production. */
import type { Db } from '../../src/server/db/database.js';
export function seedLegacyLearning(db: Db, documentId: number, title = 'Imported synthetic correction') {
  db.exec(`CREATE TABLE IF NOT EXISTS learning_feedback (
    id INTEGER PRIMARY KEY,document_id INTEGER,title TEXT,content_preview TEXT,tags TEXT,
    correspondent TEXT,document_type TEXT,corrected_by_user INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_feedback_document_id ON learning_feedback(document_id);`);
  db.prepare('INSERT INTO learning_feedback(document_id,title,tags,corrected_by_user) VALUES(?,?,?,1)').run(documentId, title, '["synthetic"]');
}
