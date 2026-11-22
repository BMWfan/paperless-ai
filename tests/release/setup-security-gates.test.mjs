// Static release-gate checks for #42. These deliberately fail when a security
// invariant is not implemented. They are NOT substitutes for HTTP integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/server/http/app.ts', import.meta.url), 'utf8');
const system = readFileSync(new URL('../../src/server/routes/system.ts', import.meta.url), 'utf8');

test('setup requires a user session once an account exists', () => {
  assert.match(app, /if \(ctx\.needsSetup\(\) && ctx\.repos\.users\.count\(\) === 0\) return/);
  assert.match(app, /level = 'session'/);
  assert.match(app, /req\.principal\.kind !== 'user'/);
});

test('setup rejects cross-site requests and preflight', () => {
  assert.match(app, /isSetupRequest\(req\)/);
  assert.match(app, /req\.method === 'OPTIONS' \|\| isFromOtherSite\(req\)/);
});

test('setup rejects a mismatched Origin header independently of Fetch Metadata', () => {
  // Sec-Fetch-Site is not always sent. Origin must be validated independently.
  assert.match(app, /req\.headers\.origin/, 'Missing explicit Origin verification for setup');
});

test('first-run setup has an exclusive lease across awaited connection tests', () => {
  // Checking needsSetup after awaits is insufficient: concurrent requests can
  // both reach external connection tests and race the configuration update.
  assert.match(system, /setup(?:Lease|Lock|Mutex)|acquireSetup/i, 'Missing setup-wide exclusive lease');
});

test('first-user creation and configuration completion are failure-atomic', () => {
  // The setup path must not persist setupCompleted before a potentially failing
  // account creation without an explicit rollback/transaction mechanism.
  const save = system.indexOf('ctx.config.update({ ...patch, setupCompleted: true })');
  const create = system.indexOf('ctx.repos.users.create(');
  assert.ok(save >= 0 && create >= 0, 'Expected setup persistence and account creation');
  assert.ok(create < save || /(?:transaction|rollback|restoreSetup)/i.test(system.slice(save, create)),
    'Configuration is committed before account creation without an explicit rollback');
});
