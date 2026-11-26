/** Local-only entry point. Run with Node22 --import tsx; never calls a provider. */
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { auditAmountReport, confirmationContract } from '../test/helpers/amountReportAudit.ts';

try {
  const [path, flag, sha, ...extra] = process.argv.slice(2);
  if (!path || flag !== '--source-sha' || !/^[a-f0-9]{40}$/.test(sha ?? '') || extra.length) throw new Error('Usage: node --import tsx scripts/audit-amount-report.mjs report.json --source-sha <reviewed-40-char-SHA>');
  if (statSync(path).size > 1_048_576) throw new Error('Report exceeds 1 MiB');
  const raw = readFileSync(path);
  if (raw.length > 1_048_576) throw new Error('Report exceeds 1 MiB');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = name => execFileSync('git', ['-C', root, 'show', `${sha}:test/processing/${name}`], { encoding: 'utf8', maxBuffer: 1_048_576, stdio: ['ignore', 'pipe', 'pipe'] });
  const pair = fixture('amount-scope.fixture.json'), confirmation = fixture('amount-confirmation.fixture.json');
  const contract = confirmationContract(sha, JSON.parse(pair), JSON.parse(confirmation));
  const result = auditAmountReport(JSON.parse(raw), contract);
  const hash = data => createHash('sha256').update(data).digest('hex');
  console.log(JSON.stringify({ reportSha256: hash(raw), fixtureBlobHashes: { pair: hash(pair), confirmation: hash(confirmation) }, ...result }, null, 2));
  process.exitCode = result.integrity === 'invalid' ? 2 : result.samplePass ? 0 : 1;
} catch {
  // Do not echo untrusted report contents, paths or accidental credentials.
  console.error('Audit refused: invalid arguments/JSON, oversized report, or source fixtures unavailable. Use report.json --source-sha <reviewed-40-char-SHA>; no network fetch is performed.');
  process.exitCode = 2;
}
