import { readFileSync } from 'node:fs';
import { analyzeContent } from '../../src/server/processing/analyzer.js';
import { normalizeFieldValue } from '../../src/server/learning/fields.js';
import { createHarness } from './appHarness.js';
import { meterRegression } from './modelRegressionBudget.js';

export const amountScopeFixture = JSON.parse(readFileSync(
  new URL('../processing/amount-scope.fixture.json', import.meta.url), 'utf8',
)) as { document: string; cases: { id: string; description: string; expected: string | null }[] };

const model = 'gpt-5.4-mini-2026-03-17';

const importedPdfCases = [
  {
    id: 'current-demand',
    document: 'Bergpfad Auskunft Ltd\nPlease pay EUR 45.00 for the current service.\nHistorical receipt, attached for information only\nAmount: EUR 777.77',
    description: amountScopeFixture.cases[0].description,
    expected: 'EUR45.00',
  },
  {
    id: 'unclear-roles',
    document: 'Bergpfad Auskunft Ltd\nReference A\nAmount: EUR 45.00\nBergpfad Auskunft Ltd\nReference B\nAmount: EUR 777.77',
    description: amountScopeFixture.cases[0].description,
    expected: null,
  },
  {
    id: 'multiple-receipts',
    document: 'Bergpfad Auskunft Ltd\nReceipt A\nAmount: EUR 45.00\nReceipt B\nAmount: EUR 777.77',
    description: amountScopeFixture.cases[1].description + ' Omit the field when more than one receipt qualifies.',
    expected: null,
  },
];

export async function measureAmountScope(sha: string, key: string, transport = globalThis.fetch, includeImportedPdfs = false) {
  if (amountScopeFixture.cases.length !== 2) throw new Error('Exactly two amount scopes are required');
  const pair = amountScopeFixture.cases.map((sample) => ({ ...sample, document: amountScopeFixture.document }));
  const cases = includeImportedPdfs ? [...pair, ...importedPdfCases] : pair;
  const harness = await createHarness({
    env: { OPENAI_API_KEY: key },
    config: { ai: { provider: 'openai', responseTokens: 300 } },
  });
  const originalFetch = globalThis.fetch;
  const rows = [];
  try {
    harness.ctx.learning.configure({ enabled: false, mode: 'disabled' });
    const field = { id: 10, name: 'Amount', data_type: 'monetary' as const };
    harness.paperless.addCustomField(field.name, field.data_type, null, field.id);
    for (const { document, ...sample } of cases) {
      const meter = meterRegression(transport, new URL(harness.paperless.url).origin, 1);
      globalThis.fetch = meter.fetch;
      let actual: unknown;
      let status = 'unmeasured';
      try {
        const processing = { ...harness.ctx.cfg.processing,
          customFields: [{ name: 'Amount', type: 'monetary' as const, currency: 'EUR', description: sample.description }] };
        const result = await analyzeContent(harness.ctx, document, { feature: 'manual', model, processing });
        const amounts = result.suggestion.custom_fields.filter(({ field_name }) => field_name.toLowerCase() === 'amount');
        actual = amounts.length === 0 ? null : amounts.length === 1 ? normalizeFieldValue(amounts[0].value, field) : amounts;
        const matches = sample.expected === null ? amounts.length === 0 : actual === sample.expected;
        status = matches ? 'match' : 'mismatch';
      } catch (error) {
        status = meter.totals().stopped ? 'budget-or-contract-stop' : `unmeasured:${error instanceof Error ? error.name : 'unknown'}`;
      }
      rows.push({ ...sample, ...(includeImportedPdfs ? { document } : {}), actual, status, attempts: meter.attempts, budget: meter.totals() });
    }
    return { sha, protocol: includeImportedPdfs ? 'amount-scope-pdf-v1' : 'amount-scope-pair-v1', model, document: amountScopeFixture.document, rows };
  } finally {
    globalThis.fetch = originalFetch;
    await harness.close();
  }
}
