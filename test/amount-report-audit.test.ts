import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { auditAmountReport, confirmationContract } from './helpers/amountReportAudit.js';

const sha = 'a'.repeat(40);
const pair = JSON.parse(readFileSync(new URL('./processing/amount-scope.fixture.json', import.meta.url), 'utf8'));
const frozen = JSON.parse(readFileSync(new URL('./processing/amount-confirmation.fixture.json', import.meta.url), 'utf8'));
const contract = confirmationContract(sha, pair, frozen);
function fixture() {
  return { sha, protocol: 'amount-scope-confirmation-v1', model: 'gpt-5.4-mini-2026-03-17', document: pair.document,
    rows: contract.cases.map(c => ({ ...c, actual: c.expected as unknown, status: 'match',
      attempts: [{ model: 'gpt-5.4-mini-2026-03-17', inputBound: 2000, outputBound: 300,
        requestSha256: 'b'.repeat(64), durationMs: 1, status: 200, usage: { prompt_tokens: 100, completion_tokens: 20 } }],
      budget: { reservedDollars: 0.00285, stopped: false } })) };
}
describe('Offline confirmation report audit', () => {
  it('recomputes the eight-case sample without mutation or network calls', () => {
    const input = fixture(), before = JSON.stringify(input);
    const result = auditAmountReport(input, contract);
    expect(result).toMatchObject({ integrity: 'valid', complete: true, samplePass: true,
      summary: { positive: { total: 4, correct: 4 }, negative: { total: 4, correctOmissions: 4 } }, usageCoverage: '8/8' });
    expect(result.qualification).toContain('UNQUALIFIED');
    expect(result.contractSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('counts real mismatches separately from correct absences', () => {
    const input = fixture();
    input.rows[0].actual = 'EUR210.00'; input.rows[0].status = 'mismatch';
    input.rows[1].actual = null; input.rows[1].status = 'mismatch';
    input.rows[2].actual = 'EUR391.20'; input.rows[2].status = 'mismatch';
    const result = auditAmountReport(input, contract);
    expect(result).toMatchObject({ integrity: 'valid', samplePass: false,
      summary: { positive: { correct: 2, wrong: 1, missing: 1 }, negative: { correctOmissions: 3, wrong: 1 } } });
    expect(result.rows[0].outcome).toBe('wrong-value');
  });
  it('keeps missing cases and budget stops unmeasured, never correct omissions', () => {
    const input = fixture(); input.rows.pop();
    input.rows[2].status = 'budget-or-contract-stop'; input.rows[2].budget.stopped = true;
    input.rows[2].actual = undefined; input.rows[2].attempts[0].status = 429;
    const result = auditAmountReport(input, contract);
    expect(result).toMatchObject({ integrity: 'valid', complete: false, samplePass: false,
      summary: { negative: { correctOmissions: 2, unmeasured: 2 } } });
    expect(result.rows[7].outcome).toBe('missing-case');
  });
  it('retains missing usage as unknown rather than inferring tokens from reservations', () => {
    const input = fixture(); input.rows[0].status = 'unmeasured:TypeError';
    delete (input.rows[0].attempts[0] as { usage?: unknown }).usage;
    delete (input.rows[0].attempts[0] as { status?: unknown }).status;
    const result = auditAmountReport(input, contract);
    expect(result).toMatchObject({ integrity: 'valid', usageCoverage: '7/8', totals: { reportedInputTokens: 700, reportedOutputTokens: 140 } });
    expect(result.summary.positive.unmeasured).toBe(1);
  });
  it('treats a normalization failure and multiple proposals as wrong, not absent', () => {
    const input = fixture(); input.rows[0].actual = undefined; input.rows[0].status = 'mismatch';
    input.rows[2].actual = [{ field_name: 'Amount', value: 'EUR1.00' }, { field_name: 'Amount', value: 'EUR2.00' }]; input.rows[2].status = 'mismatch';
    const result = auditAmountReport(JSON.parse(JSON.stringify(input)), contract);
    expect(result.integrity).toBe('valid'); expect(result.rows[0].outcome).toBe('invalid-value');
    expect(result.rows[2].outcome).toBe('multiple-proposals'); expect(result.summary.negative.wrong).toBe(1);
  });
  it.each(['expected', 'document', 'description'] as const)('rejects changed ground truth/context: %s', key => {
    const input = fixture(); input.rows[0][key] = 'tampered';
    expect(auditAmountReport(input, contract).errors).toContain(input.rows[0].id + ':frozen-case-mismatch');
  });
  it('rejects duplicates, unknown cases, source/model/protocol drift and a false success status', () => {
    const input = fixture(); input.sha = 'c'.repeat(40); input.model = 'other'; input.protocol = 'v2';
    input.rows[1] = structuredClone(input.rows[0]); input.rows[3].id = 'unknown'; input.rows[0].actual = 'EUR1.00';
    const result = auditAmountReport(input, contract);
    expect(result.integrity).toBe('invalid'); expect(result.samplePass).toBe(false);
    for (const error of ['source-sha-mismatch', 'model-snapshot-mismatch', 'unsupported-protocol', 'unknown-case', 'duplicate-case:' + input.rows[0].id,
      input.rows[0].id + ':status-score-mismatch']) expect(result.errors).toContain(error);
  });
  it('rejects changed reservations, retries, invalid usage and non-finite timings', () => {
    const input = fixture(); input.rows[0].budget.reservedDollars = 0;
    input.rows[1].attempts.push(structuredClone(input.rows[1].attempts[0]));
    input.rows[2].attempts[0].usage.prompt_tokens = -1;
    input.rows[3].attempts[0].durationMs = Infinity;
    const result = auditAmountReport(input, contract);
    expect(result.integrity).toBe('invalid');
    expect(result.errors).toContain(input.rows[0].id + ':inconsistent-reservation-or-stop');
    expect(result.errors).toContain(input.rows[1].id + ':invalid-attempt-count');
    expect(result.errors).toContain(input.rows[2].id + ':unreconciled-measured-attempt');
    expect(result.errors).toContain(input.rows[3].id + ':invalid-attempt');
  });
  it('refuses a malformed frozen fixture instead of silently weakening the eight-case contract', () => {
    expect(() => confirmationContract(sha, pair, frozen.slice(1))).toThrow();
    expect(() => confirmationContract('../unsafe', pair, frozen)).toThrow();
    expect(() => confirmationContract(sha, pair, [...frozen.slice(0, 7), frozen[0]])).toThrow();
  });
  it('audits via the real CLI using Git fixtures and leaves the input bytes untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amount-audit-'));
    try {
      const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const input = fixture(); input.sha = source;
      const file = join(dir, 'report.json'), before = JSON.stringify(input);
      writeFileSync(file, before);
      const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/audit-amount-report.mjs', file, '--source-sha', source], { encoding: 'utf8' });
      const result = run(); expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ sourceSha: source, integrity: 'valid', samplePass: true });
      expect(readFileSync(file, 'utf8')).toBe(before);
      input.rows.pop(); writeFileSync(file, JSON.stringify(input));
      expect(run().status).toBe(1);
      input.rows[0].expected = 'EUR1.00'; writeFileSync(file, JSON.stringify(input));
      expect(run().status).toBe(2);
      writeFileSync(file, '{not-json secret-fixture-marker');
      const invalid = run(); expect(invalid.status).toBe(2);
      expect(invalid.stderr).not.toContain('secret-fixture-marker');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
