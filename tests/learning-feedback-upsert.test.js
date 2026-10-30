const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// Reproduces the learning_feedback upsert contract in an isolated in-memory database.
// This guards the SQL invariant without opening the application's persistent database.
test('AI predictions cannot overwrite user-confirmed feedback', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE learning_feedback (
      document_id INTEGER PRIMARY KEY,
      title TEXT,
      corrected_by_user INTEGER DEFAULT 0
    )`);
    const save = db.prepare(`INSERT INTO learning_feedback
      (document_id, title, corrected_by_user) VALUES (?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        title = excluded.title,
        corrected_by_user = excluded.corrected_by_user
      WHERE learning_feedback.corrected_by_user = 0
         OR excluded.corrected_by_user = 1`);
    save.run(42, 'AI first guess', 0);
    save.run(42, 'User correction', 1);
    assert.equal(save.run(42, 'Later AI guess', 0).changes, 0);
    assert.deepEqual(db.prepare('SELECT title, corrected_by_user FROM learning_feedback WHERE document_id = 42').get(), {
      title: 'User correction', corrected_by_user: 1
    });
    assert.equal(save.run(42, 'New user correction', 1).changes, 1);
    assert.equal(db.prepare('SELECT title FROM learning_feedback WHERE document_id = 42').get().title, 'New user correction');
  } finally {
    db.close();
  }
});

test('Unconfirmed AI predictions may be updated', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE learning_feedback (document_id INTEGER PRIMARY KEY, title TEXT, corrected_by_user INTEGER DEFAULT 0)');
    const save = db.prepare(`INSERT INTO learning_feedback (document_id, title, corrected_by_user)
      VALUES (?, ?, 0)
      ON CONFLICT(document_id) DO UPDATE SET title = excluded.title
      WHERE learning_feedback.corrected_by_user = 0`);
    save.run(10, 'First');
    assert.equal(save.run(10, 'Second').changes, 1);
    assert.equal(db.prepare('SELECT title FROM learning_feedback WHERE document_id = 10').get().title, 'Second');
  } finally {
    db.close();
  }
});
