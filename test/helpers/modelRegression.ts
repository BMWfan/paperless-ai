import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { analyzeContent } from '../../src/server/processing/analyzer.js';
import { learningContext } from '../../src/server/learning/runtime.js';
import { createHarness } from './appHarness.js';
import { limits, meterRegression, snapshots } from './modelRegressionBudget.js';
import type { DocumentSuggestion } from '../../src/shared/api.js';

const corpus = readFileSync(new URL('../../tests/quality/extraction/cases.json', import.meta.url));
const caseIds = [
  'confirmation-invoice-en-0', 'confirmation-invoice-de-0',
  'confirmation-contract-en-0', 'confirmation-letter-en-1',
];
const fields = {
  invoice_number: 'string', contract_number: 'string', policy_number: 'string',
  amount: 'monetary', due_date: 'date', end_date: 'date',
} as const;
const fieldNames = Object.keys(fields) as (keyof typeof fields)[];
interface Sample {
  id: string;
  split: string;
  content: string;
  expected: {
    custom_fields: Record<keyof typeof fields, string | null>;
    tags: string[];
    correspondent: string;
    document_type: string;
    language: string;
  };
  forbiddenCurrentIdentifiers: string[];
}

const identifierFields = fieldNames.filter((name) => name.endsWith('_number'));
const normalize = (value: string) => value.trim().toLowerCase();

export function scoreRegression(sample: Sample, suggestion: DocumentSuggestion, referenceValues: Set<string>) {
  const actual = Object.fromEntries(suggestion.custom_fields.map(({ field_name, value }) => [field_name, value]));
  const expected = {
    ...sample.expected.custom_fields, correspondent: sample.expected.correspondent,
    document_type: sample.expected.document_type, language: sample.expected.language,
    tags: [...sample.expected.tags].map(normalize).sort().join(','),
  };
  Object.assign(actual, {
    correspondent: suggestion.correspondent, document_type: suggestion.document_type, language: suggestion.language,
    tags: suggestion.tags.map(normalize).sort().join(','),
  });
  const metrics = Object.entries(expected).map(([field, target]) => {
    const value = actual[field] || null;
    const matches = value === target || (value !== null && target !== null && normalize(value) === normalize(target));
    const incorrectIdentifier = identifierFields.some((name) => name === field) && value !== null && !matches;
    return {
      field, expected: target, actual: value,
      status: matches ? 'correct' : value === null ? 'missing' : 'wrong',
      copiedReference: incorrectIdentifier && referenceValues.has(normalize(value)),
      inventedIdentifier: incorrectIdentifier && !normalize(sample.content).includes(normalize(value)) &&
        !referenceValues.has(normalize(value)),
      forbiddenIdentifier: incorrectIdentifier && sample.forbiddenCurrentIdentifiers.some((item) => normalize(item) === normalize(value)),
    };
  });
  return metrics;
}

export async function measureRegression(sha: string, key: string, transport = globalThis.fetch, maxCalls?: number) {
  const { revision, cases } = JSON.parse(corpus.toString()) as { revision: string; cases: Sample[] };
  const training = cases.filter((item) => item.split === 'training');
  const evaluation = caseIds.map((id) => {
    const sample = cases.find((item) => item.id === id && item.split === 'confirmation');
    if (!sample) throw new Error(`Missing confirmation case: ${id}`);
    return sample;
  });
  const references = new Set(training.flatMap((item) => Object.values(item.expected.custom_fields).filter(
    (value): value is string => value !== null).map(normalize)));
  const harness = await createHarness({
    env: { OPENAI_API_KEY: key },
    config: {
      ai: { provider: 'openai', responseTokens: 300 },
      processing: { customFields: fieldNames.map((name) => ({ name, type: fields[name], description: '' })) },
    },
  });
  const originalFetch = globalThis.fetch;
  const meter = meterRegression(transport, new URL(harness.paperless.url).origin, maxCalls);
  globalThis.fetch = meter.fetch;
  try {
    for (const [index, name] of fieldNames.entries()) harness.paperless.addCustomField(name, fields[name], null, index + 10);
    harness.ctx.learning.configure({ mode: 'hybrid', enabled: false });
    training.forEach((item, index) => {
      const document = { id: index + 100, title: 'Unreviewed', content: item.content, tags: [], correspondent: null, document_type: null };
      harness.ctx.learning.observe(document);
      harness.ctx.learning.observe({
        ...document, title: item.id,
        custom_fields: fieldNames.flatMap((name, fieldIndex) => {
          const value = item.expected.custom_fields[name];
          return value === null ? [] : [{ field: fieldIndex + 10, value }];
        }),
      }, 'confirmed_ui', { actor: 'user:1' });
    });
    if (!harness.ctx.learning.examples().length) throw new Error('Missing confirmed synthetic references');
    const rows = [];
    for (const model of Object.keys(snapshots)) {
      for (const sample of evaluation) {
        for (const arm of ['without', 'with'] as const) {
          if (meter.totals().stopped) {
            rows.push({ model, caseId: sample.id, arm, status: 'unmeasured', reason: 'budget-or-contract-stop', attempts: [] });
            continue;
          }
          harness.ctx.learning.configure({ mode: arm === 'with' ? 'hybrid' : 'disabled' });
          const context = await learningContext(harness.ctx, sample.content);
          if (Boolean(context) !== (arm === 'with')) throw new Error('Synthetic learning arm did not load as expected');
          const firstAttempt = meter.attempts.length;
          const started = performance.now();
          try {
            const result = await analyzeContent(harness.ctx, sample.content, { feature: 'manual', model });
            rows.push({ model, caseId: sample.id, arm, status: 'measured', returnedModel: result.model,
              durationMs: Math.round(performance.now() - started), usage: result.usage, suggestion: result.suggestion,
              fields: scoreRegression(sample, result.suggestion, references), attempts: meter.attempts.slice(firstAttempt) });
          } catch (error) {
            rows.push({ model, caseId: sample.id, arm, status: 'unmeasured',
              reason: meter.totals().stopped ? 'budget-or-contract-stop' : error instanceof Error ? error.name : 'unknown',
              durationMs: Math.round(performance.now() - started), attempts: meter.attempts.slice(firstAttempt) });
          }
        }
      }
    }
    const writes = ['POST', 'PUT', 'PATCH', 'DELETE'].flatMap((method) => harness.paperless.calls(method, /.*/));
    if (writes.length) throw new Error('Unexpected Paperless write in model regression');
    return {
      protocol: 'v44-model-regression-v1', sha, corpus: { revision, sha256: createHash('sha256').update(corpus).digest('hex'),
        training, evaluation }, snapshots, limits, budget: meter.totals(), rows,
    };
  } finally {
    globalThis.fetch = originalFetch;
    await harness.close();
  }
}
