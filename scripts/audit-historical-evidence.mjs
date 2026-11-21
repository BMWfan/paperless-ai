import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const lock = JSON.parse(readFileSync('docs/historical-evidence-lock.json', 'utf8'));
for (const [file, expected] of Object.entries(lock.files)) {
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), expected, file);
}
console.log(`Verified ${Object.keys(lock.files).length} immutable historical files from ${lock.sourceCommit}; no inference or current-runtime qualification.`);
