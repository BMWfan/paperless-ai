/** Native API contract test. Only fixed internal fixture hosts are accepted. No real LLM. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateFixture } from './safety.mjs';
const fixture = JSON.parse(fs.readFileSync('/fixtures/runtime.json', 'utf8'));
validateFixture(fixture);
const aiHeaders = { 'x-api-key': fixture.apiKey };
const plHeaders = { Authorization: `Token ${fixture.paperlessToken}` };
async function request(base, path, headers, body, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const form = body instanceof FormData;
  const response = await fetch(base + path, { method, redirect: 'error', headers: { ...headers, ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
  return response.json();
}
const ai = (path, body, headers = aiHeaders, status = 200) => request(fixture.aiUrl, path, headers, body, undefined, status);
const pl = (path, body, method, status = 200) => request(fixture.paperlessUrl + '/api', path, plHeaders, body, method, status);
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
async function waitFor(operation, description, limit = 180) {
  for (let i = 0; i < limit; i++) { const result = await operation(); if (result) return result; await pause(); }
  throw new Error(`Timed out: ${description}`);
}
async function upload(content) {
  const name = `synthetic-v4-${Date.now()}.txt`;
  const form = new FormData(); form.set('document', new Blob([content], { type: 'text/plain' }), name);
  await pl('/documents/post_document/', form);
  return waitFor(async () => (await pl('/documents/?ordering=-id&page_size=100')).results.find(doc => doc.original_file_name === name), 'synthetic document ingestion');
}
async function drain() { await waitFor(async () => { const status = await ai('/api/processing/status'); return !status.running && !status.queued && !status.current.length; }, 'selected document processing'); }
const stats = async () => (await fetch('http://mock-ai:11434/stats', { signal: AbortSignal.timeout(20000) })).json();
const expectedFile = '/fixtures/expected.json';
if (fixture.legacyDocumentId) {
  const digest = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  assert.equal(digest('/app/data/documents.db'), fixture.legacyDatabaseDigest, 'legacy database source changed');
  assert.equal(digest('/app/data/.env'), fixture.legacyEnvDigest, 'legacy configuration source changed');
}

if (process.argv[2] === 'restart') {
  const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
  assert.equal(expected.scope, fixture.scope);
  const pending = await ai('/api/learning/events?status=pending&limit=100');
  assert.ok(pending.events.some(row => row.id === expected.pendingEventId && row.document_id === expected.documentId), 'pending correction lost across restart');
  const examples = await ai('/api/learning/examples');
  assert.ok(examples.examples.some(row => row.document_id === expected.documentId), 'confirmed example/audit state lost across restart');
  assert.equal((await stats()).calls, expected.modelCalls, 'restart unexpectedly called the model');
  assert.equal((await ai('/api/learning/settings')).mode, expected.mode, 'learning mode lost across restart');
  console.log('PASS: real app restart preserved pending and confirmed learning without inference.');
  process.exit(0);
}
// Refuse a contaminated fixture before writing any document.
const existing = await pl('/documents/?page_size=100');
assert.ok(existing.results.every(doc => doc.original_file_name?.startsWith('synthetic-v4-')), 'non-fixture documents found; aborting');
const dashboard = await ai('/api/dashboard');
assert.equal(dashboard.paperless.connected, true);
assert.equal(dashboard.paperless.version, process.env.EXPECTED_PAPERLESS_VERSION ?? '3.5.1');
console.log(`Connected to official Paperless-ngx ${dashboard.paperless.version}, API ${dashboard.paperless.apiVersion}.`);
assert.ok(fixture.legacyDocumentId, 'fresh qualification must exercise legacy migration');
const imported = (await ai('/api/learning/legacy?limit=100')).examples.find(row => row.document_id === fixture.legacyDocumentId);
assert.equal(imported?.metadata.title, 'Confirmed imported legacy correction');
const beforeLegacyReplay = (await stats()).calls;
await ai('/api/processing/documents', { ids: [fixture.legacyDocumentId] }); await drain();
assert.equal((await stats()).calls, beforeLegacyReplay, 'legacy correction did not protect automatic replay');
assert.equal((await pl(`/documents/${fixture.legacyDocumentId}/`)).title, 'Confirmed imported legacy correction');
console.log('PASS: legacy user/configuration/correction/archive migrated; sources unchanged and correction protected.');

const longNote = 'Synthetic long text '.repeat(8).trim();
const content = 'SYNTHETIC TEST DATA ONLY\nInvoice number: NEW-42\nPrevious invoice: OLD-17\nTotal: CHF42.50\nCount: 0\nRatio: 1.25\nPaid: false\nCategory: Fixture\nDate: 2032-02-29\nFixture Supplier\nNote: ' + longNote;
const document = await upload(content);
const fields = {};
for (const [key, data_type] of Object.entries({ number: 'string', amount: 'monetary', count: 'integer', keep: 'string', ratio: 'float', flag: 'boolean', category: 'select', note: 'longtext', date: 'date', invalidDate: 'date' })) {
  const name = `Fixture ${key}`;
  fields[key] = (await pl('/custom_fields/?page_size=100')).results.find(row => row.name === name) ?? await pl('/custom_fields/', { name, data_type, ...(key === 'amount' ? { extra_data: { default_currency: 'EUR' } } : data_type === 'select' ? { extra_data: { select_options: [{ label: 'Fixture' }] } } : {}) }, 'POST', 201);
}
await pl(`/documents/${document.id}/`, { custom_fields: [{ field: fields.keep.id, value: 'untouched' }, { field: fields.invalidDate.id, value: '2030-01-01' }] }, 'PATCH');
await ai('/api/processing/documents', { ids: [document.id] }); await drain();
let current = await pl(`/documents/${document.id}/`);
assert.equal(current.title, 'Synthetic native invoice');
assert.ok(current.custom_fields.some(row => row.field === fields.keep.id && row.value === 'untouched'));
assert.ok(!(await ai('/api/learning/examples')).examples.some(row => row.document_id === document.id), 'automatic classification became confirmed human learning');
console.log('PASS: real document classification and preserved native fields, without false human feedback.');

const ordinary = await ai(`/api/documents/${document.id}/apply`, { customFields: [
  { field_name: fields.count.name, value: '1.5' }, { field_name: fields.amount.name, value: 'CHF42.50' },
] });
assert.ok(ordinary.notes.some(note => note.includes(fields.count.name) && note.includes('not valid')), 'fractional ordinary integer was not rejected');
current = await pl(`/documents/${document.id}/`);
assert.ok(!current.custom_fields.some(row => row.field === fields.count.id), 'ordinary integer write rounded 1.5');
assert.ok(current.custom_fields.some(row => row.field === fields.amount.id && row.value === 'CHF42.50'), 'ordinary write relabeled CHF as default EUR');
console.log('PASS: ordinary writes rejected fractional integers and preserved explicit CHF despite EUR default.');

const snapshot = await ai(`/api/documents/${document.id}/fields/preview`, { content: current.content.slice(0, 50000), suggestions: [
  { field_name: fields.number.name, value: 'NEW-42' }, { field_name: fields.amount.name, value: 'CHF42.50' }, { field_name: fields.count.name, value: '1.5' },
  { field_name: fields.ratio.name, value: 1.25 }, { field_name: fields.flag.name, value: false }, { field_name: fields.category.name, value: 'Fixture' },
  { field_name: fields.note.name, value: longNote }, { field_name: fields.date.name, value: '2032-2-29' }, { field_name: fields.invalidDate.name, value: '2031-02-30' },
] });
assert.equal(snapshot.readOnly, true);
assert.equal(snapshot.rows.find(row => row.fieldId === fields.count.id).canApply, false);
assert.equal(snapshot.rows.find(row => row.fieldId === fields.flag.id).normalizedValue, false);
assert.equal(snapshot.rows.find(row => row.fieldId === fields.invalidDate.id).canApply, false);
const review = { snapshotDigest: snapshot.snapshotDigest, reviewFieldIds: snapshot.reviewFieldIds };
await ai(`/api/documents/${document.id}/fields/apply`, { ...review, fields: [{ field: fields.count.id, value: '1.5' }] }, aiHeaders, 400);
await ai(`/api/documents/${document.id}/fields/apply`, { ...review, fields: [{ field: fields.invalidDate.id, value: '2031-02-30' }, { field: fields.number.id, value: 'SHOULD-NOT-SAVE' }] }, aiHeaders, 400);
assert.equal((await pl(`/documents/${document.id}/`)).modified, current.modified, 'preview/invalid value changed the document');
await ai(`/api/documents/${document.id}/fields/apply`, { ...review, fields: [{ field: fields.number.id, value: 'NEW-42' }, { field: fields.amount.id, value: 'CHF42.50' },
  { field: fields.count.id, value: 0 }, { field: fields.ratio.id, value: 1.25 }, { field: fields.flag.id, value: false },
  { field: fields.category.id, value: fields.category.extra_data.select_options.find(option => option.label === 'Fixture').id },
  { field: fields.note.id, value: longNote }, { field: fields.date.id, value: '2032-2-29' },
] });
current = await pl(`/documents/${document.id}/`);
assert.ok(current.custom_fields.some(row => row.field === fields.keep.id && row.value === 'untouched'));
assert.ok(current.custom_fields.some(row => row.field === fields.number.id && row.value === 'NEW-42'));
assert.ok(current.custom_fields.some(row => row.field === fields.amount.id && row.value === 'CHF42.50'));
const saved = new Map(current.custom_fields.map(row => [row.field, row.value]));
assert.equal(saved.get(fields.count.id), 0); assert.equal(saved.get(fields.ratio.id), 1.25);
assert.equal(saved.get(fields.flag.id), false); assert.equal(saved.get(fields.note.id), longNote);
assert.equal(saved.get(fields.category.id), fields.category.extra_data.select_options.find(option => option.label === 'Fixture').id);
assert.equal(saved.get(fields.date.id), '2032-02-29'); assert.equal(saved.get(fields.invalidDate.id), '2030-01-01');
await ai(`/api/documents/${document.id}/fields/apply`, { ...review, fields: [{ field: fields.number.id, value: 'STALE' }] }, aiHeaders, 409);
assert.ok(!(await ai('/api/learning/examples')).examples.some(row => row.document_id === document.id), 'API-key edit was automatically trusted as human');
const pending = (await ai('/api/learning/events?status=pending&limit=100')).events.find(row => row.document_id === document.id);
assert.ok(pending); assert.equal(pending.source, 'unknown');
const login = await fetch(fixture.aiUrl + '/api/auth/login', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'fixture-user', password: 'isolated-v4-password' }), signal: AbortSignal.timeout(20000) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
const session = { Cookie: cookie, Origin: fixture.aiUrl };
await ai(`/api/learning/events/${pending.id}/review`, { decision: 'confirmed' }, session);
assert.ok((await ai('/api/learning/examples')).examples.some(row => row.document_id === document.id));
const callsBefore = (await stats()).calls;
await ai('/api/processing/documents', { ids: [document.id] }); await drain();
assert.equal((await stats()).calls, callsBefore, 'protected correction caused another model request');
console.log('PASS: native typed fields, stale-write rejection, explicit review and confirmed-learning protection.');
const clearSnapshot = await ai(`/api/documents/${document.id}/fields/current`, { content: current.content.slice(0, 50000) });
await ai(`/api/documents/${document.id}/fields/clear`, { snapshotDigest: clearSnapshot.snapshotDigest, reviewFieldIds: clearSnapshot.reviewFieldIds, fields: [fields.count.id, fields.date.id, fields.flag.id] });
const cleared = new Map((await pl(`/documents/${document.id}/`)).custom_fields.map(row => [row.field, row.value]));
for (const key of ['count', 'date', 'flag']) assert.equal(cleared.get(fields[key].id), null, `explicit ${key} clear failed`);
assert.equal(cleared.get(fields.keep.id), 'untouched'); assert.equal(cleared.get(fields.invalidDate.id), '2030-01-01');
assert.equal(cleared.get(fields.number.id), 'NEW-42'); assert.equal(cleared.get(fields.amount.id), 'CHF42.50');
assert.equal((await stats()).calls, callsBefore, 'explicit field clearing called a model');
console.log('PASS: all eight typed fields including 0/false, real dates/select/longtext; explicit clears retained unselected values.');

await ai('/api/learning/settings', { mode: 'automatic' });
await pl(`/documents/${document.id}/`, { title: 'External automated title change' }, 'PATCH');
await ai('/api/learning/scan', {});
const external = (await ai('/api/learning/events?status=pending&limit=100')).events.find(row => row.document_id === document.id);
assert.ok(external); assert.equal(external.source, 'unknown');
const target = await upload('SYNTHETIC TEST DATA ONLY\nInvoice number: NEW-99\nPrior invoice: NEW-42\nFixture Supplier');
await pl(`/documents/${target.id}/`, { correspondent: current.correspondent, document_type: current.document_type }, 'PATCH');
const targetNow = await pl(`/documents/${target.id}/`);
const hints = await ai(`/api/documents/${target.id}/fields/hints`, { content: targetNow.content.slice(0, 50000) });
assert.ok(hints.rows.some(row => row.fieldId === fields.number.id && row.normalizedValue === 'NEW-99'), 'label pattern did not read the current document number');
assert.ok(!hints.rows.some(row => row.normalizedValue === 'NEW-42'), 'old learned value was copied into the new document');
assert.equal((await stats()).calls, callsBefore, 'field hints called a model');
fs.writeFileSync(expectedFile, JSON.stringify({ scope: fixture.scope, documentId: document.id, pendingEventId: external.id, modelCalls: callsBefore, mode: (await ai('/api/learning/settings')).mode }), { mode: 0o600 });
console.log('PASS: external metadata stayed pending in automatic mode; learned pattern extracted NEW-99 instead of copying NEW-42.');
