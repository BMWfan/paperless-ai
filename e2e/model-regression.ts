import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { OpenAiCompatibleClient } from '../src/server/ai/openai.js';
import { defaultConfig, customFieldSchema } from '../src/server/config/schema.js';
import type { AppContext } from '../src/server/context.js';
import { analyzeContent } from '../src/server/processing/analyzer.js';

const require = createRequire(import.meta.url);
type Fixture = {
  id: string;
  content: string;
  language: string;
  expected: {
    document_type: string;
    tags: string[];
    correspondent: string;
    custom_fields: Record<string, string | null>;
  };
};
const { corpus, fieldTypes, revision } = require('../tests/quality/corpus.js') as {
  corpus(split: string): Fixture[];
  fieldTypes: Record<string, string>;
  revision: string;
};
const { evaluate } = require('../tests/quality/scoring.js') as {
  evaluate(actual: Fixture['expected'], fixture: Fixture, training: Fixture[]): {
    fields: Record<string, string>;
    errors: Record<string, string | null>;
  };
};
const models = [
  { id: 'gpt-4.1-mini-2025-04-14', input: 0.40, output: 1.60 },
  { id: 'gpt-5.4-mini-2026-03-17', input: 0.75, output: 4.50 },
];
const training = corpus('training');
const fixtures = corpus('confirmation').filter((_, index) => index % 2 === 0);
const outputLimit = 768;
const byteLimit = 15000;
const inputBound = byteLimit + 2048;
const eurPerUsd = 2;
const callsPerModel = fixtures.length * 2;
const maxEur = models.reduce((total, model) =>
  total + callsPerModel * (inputBound * model.input + outputLimit * model.output) * eurPerUsd / 1e6, 0);
const endpoint = 'https://api.openai.com/v1/chat/completions';
const live = process.argv.includes('--live');
const key = live ? process.env.OPENAI_TEST_API_KEY : 'offline-fixture';
const output = process.env.MODEL_REGRESSION_OUTPUT;
const sha = process.env.GITHUB_SHA ?? null;
const plan = {
  sha, revision, models, calls: callsPerModel * models.length, inputBound, outputLimit, maxEur,
  digest: createHash('sha256').update(JSON.stringify({ training, fixtures })).digest('hex'),
};
assert.equal(plan.calls, 40);
assert.ok(maxEur <= 1);
if (live) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  assert.match(sha ?? '', /^[0-9a-f]{40}$/);
  assert.ok(key && output);
}
if (output) writeFileSync(output, JSON.stringify({ plan, live }) + '\n', { flag: 'wx' });
const record = (row: object) => {
  if (output) appendFileSync(output, JSON.stringify(row) + '\n');
};
console.log(JSON.stringify(plan));

const names = (values: string[]) => [...new Set(values)].map((name, index) => ({ name, id: index + 1 }));
const all = [...training, ...fixtures];
const metadata = {
  tags: names(all.flatMap(row => row.expected.tags)),
  documentTypes: names(all.map(row => row.expected.document_type)),
  correspondents: names(training.map(row => row.expected.correspondent)),
  customFields: [],
};
const findId = (rows: ReturnType<typeof names>, name: string) => rows.find(row => row.name === name)?.id;
const examples = training.map((row, index) => ({
  document_id: index + 1,
  content_preview: row.content,
  metadata: {
    tags: row.expected.tags.map(tag => findId(metadata.tags, tag)),
    correspondent: findId(metadata.correspondents, row.expected.correspondent),
    document_type: findId(metadata.documentTypes, row.expected.document_type),
    custom_fields: row.expected.custom_fields,
  },
}));
const cfg = defaultConfig();
cfg.ai.responseTokens = outputLimit;
cfg.processing.functions.customFields = true;
cfg.processing.customFields = Object.entries(fieldTypes).map(([name, type]) => customFieldSchema.parse({ name, type }));
const realFetch = globalThis.fetch;
let measured = 0;

measurement: for (const model of models) {
  const client = new OpenAiCompatibleClient({
    provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: key,
    model: model.id, contextWindow: 32_768, timeoutMs: 25_000,
    extraBody: {
      max_completion_tokens: outputLimit, store: false, service_tier: 'default',
      ...(model.id.startsWith('gpt-5.') ? { reasoning_effort: 'none' } : {}),
    },
  });
  for (const withReferences of [false, true]) {
    for (const fixture of fixtures) {
      const ctx = {
        cfg, metadata: () => ({ snapshot: async () => metadata }),
        learning: {
          settings: () => ({ mode: withReferences ? 'suggest' : 'disabled' }),
          examples: () => examples, legacyExamples: () => [],
        },
        llm: () => client, recordUsage: () => undefined,
      } as unknown as AppContext;
      const identity = { model: model.id, id: fixture.id, language: fixture.language, withReferences };
      let sent = false;
      let providerFailure = false;
      let offlineRequest: RequestInit | undefined;
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), endpoint);
        assert.equal(init?.method, 'POST');
        assert.equal(typeof init?.body, 'string');
        const body = String(init?.body);
        const parsed = JSON.parse(body);
        assert.ok(Buffer.byteLength(body) <= byteLimit, 'Request exceeds byte limit: ' + Buffer.byteLength(body));
        assert.equal(parsed.model, model.id);
        assert.equal(parsed.max_completion_tokens, outputLimit);
        assert.equal(parsed.max_tokens, undefined);
        assert.equal(parsed.tools, undefined);
        assert.equal(parsed.service_tier, 'default');
        assert.equal(parsed.store, false);
        assert.equal(body.includes('Reference classification data'), withReferences);
        assert.equal(sent, false, 'Only one outbound request per case and arm');
        sent = true;
        if (live) {
          record({ attempt: identity });
          try {
            const response = await realFetch(endpoint, { ...init, redirect: 'error' });
            if (!response.ok) {
              providerFailure = true;
              record({ ...identity, status: response.status, requestId: response.headers.get('x-request-id') });
              throw new Error('OpenAI request failed');
            }
            return response;
          } catch {
            providerFailure = true;
            throw new Error('OpenAI measurement failed');
          }
        }
        offlineRequest = init;
        return Response.json({
          model: model.id,
          choices: [{ message: { content: JSON.stringify(fixture.expected) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
        });
      };
      const started = performance.now();
      try {
        const analysis = await analyzeContent(ctx, fixture.content, { feature: 'playground' });
        assert.ok(sent);
        assert.equal(analysis.model, model.id);
        assert.ok(analysis.usage.promptTokens > 0 && analysis.usage.promptTokens <= inputBound);
        assert.ok(analysis.usage.completionTokens > 0 && analysis.usage.completionTokens <= outputLimit);
        const actual = {
          ...analysis.suggestion,
          custom_fields: Object.fromEntries(analysis.suggestion.custom_fields.map(field => [field.field_name, field.value])),
        };
        const { fields, errors } = evaluate(actual as Fixture['expected'], fixture, training);
        delete fields.language;
        if (!live) {
          assert.ok(Object.values(fields).every(value => value === 'correct'));
          await assert.rejects(globalThis.fetch(endpoint, offlineRequest), /Only one outbound request/);
        }
        record({ ...identity, expected: fixture.expected, actual, fields, errors, usage: analysis.usage,
          usdWithoutCacheDiscount: (analysis.usage.promptTokens * model.input +
            analysis.usage.completionTokens * model.output) / 1e6,
          durationMs: Math.round(performance.now() - started) });
        measured++;
      } catch (error) {
        record({ ...identity, missingMeasurement: true, providerFailure });
        if (!live) throw error;
        break measurement;
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  }
}
assert.equal(measured, plan.calls, 'Model regression stopped. Inspect the run artifact.');
record({ complete: true, measured });
