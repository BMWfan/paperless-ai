/** Offline audit only. Does not import the analyzer, provider, writer or live harness. */
import { createHash } from 'node:crypto';

type Obj = Record<string, unknown>;
export interface AmountAuditCase { id: string; document: string; description: string; expected: string | null }
export interface AmountAuditContract { sha: string; document: string; cases: AmountAuditCase[] }
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const money = (v: unknown): v is string => typeof v === 'string' && /^(?:[A-Z]{3})?-?\d{1,10}\.\d{2}$/.test(v);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const model = 'gpt-5.4-mini-2026-03-17';
const protocol = 'amount-scope-confirmation-v1';

/** Build only the existing eight-case v1 contract, not a new scoring protocol. */
export function confirmationContract(sha: string, pair: unknown, confirmation: unknown): AmountAuditContract {
  if (!/^[a-f0-9]{40}$/.test(sha) || !object(pair) || typeof pair.document !== 'string' || !Array.isArray(pair.cases) || pair.cases.length !== 2 ||
      !pair.cases.every(c => object(c) && typeof c.description === 'string') || !Array.isArray(confirmation) || confirmation.length !== 8) {
    throw new Error('Expected the frozen eight-case confirmation-v1 fixture and exact source SHA');
  }
  const scopes = pair.cases as { description: string }[];
  const cases = confirmation.map(c => {
    if (!object(c) || typeof c.id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(c.id) || typeof c.document !== 'string' || ![0, 1].includes(Number(c.scope)) || typeof c.scope !== 'number' ||
        !(c.expected === null || money(c.expected))) throw new Error('Invalid frozen confirmation fixture');
    return { id: c.id, document: c.document, expected: c.expected as string | null,
      description: scopes[c.scope].description + (c.scope === 1 ? ' Omit the field when more than one receipt qualifies.' : '') };
  });
  if (new Set(cases.map(c => c.id)).size !== 8 || cases.filter(c => c.expected !== null).length !== 4) throw new Error('Invalid frozen confirmation case set');
  return { sha, document: pair.document, cases };
}

export interface AmountAuditRow {
  id: string;
  expected: string | null;
  actual?: string | null;
  outcome: 'correct-value' | 'correct-omission' | 'wrong-value' | 'missing-value' | 'unexpected-value' | 'invalid-value' | 'multiple-proposals' | 'unmeasured' | 'missing-case';
  recordedStatus?: string;
  attempts: number;
}

export function auditAmountReport(input: unknown, contract: AmountAuditContract) {
  const errors: string[] = [];
  const rows: AmountAuditRow[] = [];
  const totals = { attempts: 0, reservedDollars: 0, reportedInputTokens: 0, reportedOutputTokens: 0, attemptsWithUsage: 0 };
  const report = object(input) ? input : {};
  if (report.sha !== contract.sha) errors.push('source-sha-mismatch');
  if (report.protocol !== protocol) errors.push('unsupported-protocol');
  if (report.model !== model) errors.push('model-snapshot-mismatch');
  if (report.document !== contract.document) errors.push('root-fixture-mismatch');
  const sourceRows = Array.isArray(report.rows) ? report.rows : [];
  if (!Array.isArray(report.rows) || sourceRows.length > 8) errors.push('invalid-row-count');
  const index = new Map<string, Obj>();
  for (const row of sourceRows) {
    if (!object(row) || typeof row.id !== 'string' || !contract.cases.some(c => c.id === row.id)) { errors.push('unknown-case'); continue; }
    if (index.has(row.id)) { errors.push('duplicate-case:' + row.id); continue; }
    index.set(row.id, row);
  }
  for (const expected of contract.cases) {
    const row = index.get(expected.id);
    if (!row) { rows.push({ id: expected.id, expected: expected.expected, outcome: 'missing-case', attempts: 0 }); continue; }
    const fail = (reason: string) => errors.push(expected.id + ':' + reason);
    if (row.document !== expected.document || row.description !== expected.description || row.expected !== expected.expected) fail('frozen-case-mismatch');
    const measured = row.status === 'match' || row.status === 'mismatch';
    const validStatus = typeof row.status === 'string' && /^(match|mismatch|budget-or-contract-stop|unmeasured(?::[A-Za-z][A-Za-z0-9]{0,63})?)$/.test(row.status);
    if (!validStatus) fail('invalid-status');
    const attempts = Array.isArray(row.attempts) ? row.attempts : [];
    if (!Array.isArray(row.attempts) || attempts.length > 1 || (measured && attempts.length !== 1)) fail('invalid-attempt-count');
    let reserved = 0;
    for (const a of attempts) {
      totals.attempts++;
      if (!object(a)) { fail('invalid-attempt'); continue; }
      const bounds = integer(a.inputBound, 1, 10_000) && integer(a.outputBound, 1, 300);
      if (!bounds || a.model !== model || typeof a.requestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.requestSha256) || !integer(a.durationMs, 0, Number.MAX_SAFE_INTEGER) ||
          (a.status !== undefined && !integer(a.status, 100, 599))) fail('invalid-attempt');
      if (bounds) reserved += (Number(a.inputBound) * 0.75 + Number(a.outputBound) * 4.5) / 1_000_000;
      const usage = a.usage;
      const validUsage = object(usage) && integer(usage.prompt_tokens, 0, Number(a.inputBound)) && integer(usage.completion_tokens, 0, Number(a.outputBound));
      if (measured && (!integer(a.status, 200, 299) || !validUsage)) fail('unreconciled-measured-attempt');
      // Invalid/missing provider usage on a stopped attempt is evidence of a stop,
      // not proof that zero tokens were used. Never infer usage from reservations.
      if (validUsage) {
        totals.attemptsWithUsage++;
        totals.reportedInputTokens += Number(usage.prompt_tokens);
        totals.reportedOutputTokens += Number(usage.completion_tokens);
      }
    }
    totals.reservedDollars += reserved;
    if (!object(row.budget) || typeof row.budget.reservedDollars !== 'number' || !Number.isFinite(row.budget.reservedDollars) ||
        Math.abs(row.budget.reservedDollars - reserved) > 1e-10 || typeof row.budget.stopped !== 'boolean' ||
        (row.status === 'budget-or-contract-stop' ? row.budget.stopped !== true : row.budget.stopped !== false)) fail('inconsistent-reservation-or-stop');
    const actual = row.actual;
    const multiple = Array.isArray(actual) && actual.length >= 2 && actual.length <= 100 && actual.every(a => object(a) &&
      typeof a.field_name === 'string' && a.field_name.toLowerCase() === 'amount' && typeof a.value === 'string' && a.value.length <= 50_000);
    if (measured && actual !== undefined && actual !== null && !money(actual) && !multiple) fail('invalid-actual-shape');
    // A missing actual on mismatch is permitted: JSON drops undefined values
    // produced by failed normalization. It is not a correct omission.
    const matches = Object.hasOwn(row, 'actual') && (expected.expected === null ? actual === null : actual === expected.expected);
    if (measured && (row.status === 'match') !== matches) fail('status-score-mismatch');
    let outcome: AmountAuditRow['outcome'] = 'unmeasured';
    if (measured) {
      if (Array.isArray(actual)) outcome = 'multiple-proposals';
      else if (actual === undefined) outcome = 'invalid-value';
      else if (expected.expected === null) outcome = actual === null ? 'correct-omission' : 'unexpected-value';
      else outcome = actual === null ? 'missing-value' : actual === expected.expected ? 'correct-value' : 'wrong-value';
    }
    rows.push({ id: expected.id, expected: expected.expected, ...(actual === null || money(actual) ? { actual } : {}),
      recordedStatus: validStatus ? String(row.status) : undefined, outcome, attempts: attempts.length });
  }
  const summary = { positive: { total: 4, correct: 0, wrong: 0, missing: 0, unmeasured: 0 },
    negative: { total: 4, correctOmissions: 0, wrong: 0, unmeasured: 0 } };
  for (const row of rows) {
    const unmeasured = row.outcome === 'unmeasured' || row.outcome === 'missing-case';
    if (row.expected !== null) {
      if (unmeasured) summary.positive.unmeasured++;
      else if (row.outcome === 'correct-value') summary.positive.correct++;
      else if (row.outcome === 'missing-value') summary.positive.missing++;
      else summary.positive.wrong++;
    } else {
      if (unmeasured) summary.negative.unmeasured++;
      else if (row.outcome === 'correct-omission') summary.negative.correctOmissions++;
      else summary.negative.wrong++;
    }
  }
  return { sourceSha: contract.sha, protocol, model, contractSha256: hash(JSON.stringify(contract)),
    integrity: errors.length ? 'invalid' as const : 'valid' as const,
    complete: index.size === 8, errors, rows, summary, totals,
    usageCoverage: totals.attemptsWithUsage + '/' + totals.attempts,
    samplePass: errors.length === 0 && rows.every(r => r.outcome === 'correct-value' || r.outcome === 'correct-omission'),
    qualification: 'UNQUALIFIED diagnostic sample; no automatic promotion; raw provider responses/request bodies are not available in this report' };
}
