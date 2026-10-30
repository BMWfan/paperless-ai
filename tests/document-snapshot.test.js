const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDocumentMetadata, compareDocumentMetadata } = require('../services/documentSnapshotService');

test('tag ordering and duplicates do not produce false corrections', () => {
  assert.deepEqual(compareDocumentMetadata(
    { title: 'Invoice', tags: [3, 1, 3] },
    { title: 'Invoice', tags: [1, 3] }
  ), {});
});

test('detects actual metadata changes and retains both values', () => {
  const changes = compareDocumentMetadata(
    { title: 'Invoice', tags: [1] },
    { title: 'Corrected invoice', tags: [1, 2] }
  );
  assert.deepEqual(changes.title, { before: 'Invoice', after: 'Corrected invoice' });
  assert.deepEqual(changes.tags, { before: [1], after: [1, 2] });
});

test('custom fields are compared independent of array order', () => {
  const before = { custom_fields: [{ field: 5, value: 'A' }, { field: 2, value: 10 }] };
  const after = { custom_fields: [{ field: 2, value: 10 }, { field: 5, value: 'A' }] };
  assert.deepEqual(compareDocumentMetadata(before, after), {});
});

test('rejects invalid document input', () => {
  assert.throws(() => normalizeDocumentMetadata(null), TypeError);
});
