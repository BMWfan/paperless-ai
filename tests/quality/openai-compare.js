'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { appendFileSync, writeFileSync } = require('node:fs');
const { corpus, references, revision } = require('./corpus');
const { schema, system, revision: protocol } = require('./protocol');
const { evaluate } = require('./scoring');

const models = [
  ['gpt-4.1-mini-2025-04-14', 0.40, 1.60],
  ['gpt-5-nano-2025-08-07', 0.05, 0.40],
  ['gpt-5-mini-2025-08-07', 0.25, 2.00],
];
const outputLimit = 1024;
const eurPerUsdIncludingCharges = 2;
const training = corpus('training');
const fixtures = corpus('confirmation');
const confirmed = references();
const tasks = models.flatMap(([model, inputPrice, outputPrice]) =>
  fixtures.flatMap(fixture => [false, true].map(withReferences => {
    const context = withReferences ? '\nConfirmed synthetic references:\n' + JSON.stringify(confirmed) : '';
    const request = {
      model,
      messages: [
        { role: 'system', content: system + context },
        { role: 'user', content: 'CURRENT DOCUMENT:\n' + fixture.content },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'classification', strict: true, schema } },
      max_completion_tokens: outputLimit,
      service_tier: 'default',
      store: false,
      ...(model.startsWith('gpt-5-') ? { reasoning_effort: 'minimal' } : { temperature: 0 }),
    };
    const body = JSON.stringify(request);
    const inputBound = Buffer.byteLength(body) + 2048;
    const maxUsd = (inputBound * inputPrice + outputLimit * outputPrice) / 1e6;
    return { model, fixture, withReferences, body, inputBound, maxUsd, inputPrice, outputPrice };
  })),
);
const maxUsd = tasks.reduce((sum, task) => sum + task.maxUsd, 0);
const plan = {
  sha: process.env.GITHUB_SHA ?? null,
  revision, protocol, models, calls: tasks.length, outputLimit,
  maxUsd, eurPerUsdIncludingCharges, maxEur: maxUsd * eurPerUsdIncludingCharges,
  digest: createHash('sha256').update(JSON.stringify({ training, fixtures, tasks })).digest('hex'),
};

async function main() {
  assert.equal(tasks.length, 120);
  assert.ok(plan.maxEur <= 1, 'Budget exceeded');
  console.log(JSON.stringify(plan));
  if (process.argv[2] !== '--execute') return;
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  assert.match(plan.sha ?? '', /^[0-9a-f]{40}$/);
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/);
  const key = process.env.OPENAI_TEST_API_KEY;
  assert.ok(key, 'GitHub test secret unavailable');
  const path = `openai-quality-${process.env.GITHUB_RUN_ID}.jsonl`;
  writeFileSync(path, JSON.stringify({ plan }) + '\n', { flag: 'wx' });
  const record = row => appendFileSync(path, JSON.stringify(row) + '\n');
  const headers = { Authorization: 'Bearer ' + key };
  for (const [model] of models) {
    const visibility = await fetch('https://api.openai.com/v1/models/' + model, {
      headers, redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    record({ model, visibility: visibility.status });
    if (!visibility.ok) throw new Error('Model visibility check failed');
  }
  for (const task of tasks) {
    const { model, fixture, withReferences, body, inputBound, inputPrice, outputPrice } = task;
    const row = { model, id: fixture.id, language: fixture.language, withReferences, expected: fixture.expected };
    record({ attempt: row, reservedUsd: task.maxUsd });
    const start = performance.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body, redirect: 'error', signal: AbortSignal.timeout(45_000),
    });
    const result = response.ok ? await response.json() : null;
    const durationMs = Math.round(performance.now() - start);
    if (!result) {
      const failure = await response.json().catch(() => null);
      const knownCodes = ['insufficient_quota', 'rate_limit_exceeded', 'model_not_found',
        'invalid_api_key', 'invalid_json_schema', 'unsupported_value'];
      const code = knownCodes.find(candidate => candidate === failure?.error?.code
        || candidate === failure?.error?.type) ?? 'unclassified';
      record({ ...row, durationMs, status: response.status, code });
      console.error('OpenAI request rejected:', response.status, code);
      throw new Error('Inference request failed');
    }
    const { usage, choices } = result;
    const input = usage?.prompt_tokens;
    const output = usage?.completion_tokens;
    const finish = choices?.[0]?.finish_reason;
    const raw = choices?.[0]?.message?.content ?? null;
    const validUsage = Number.isSafeInteger(input) && input >= 0 && input <= inputBound
      && Number.isSafeInteger(output) && output >= 0 && output <= outputLimit;
    let actual = null;
    if (finish === 'stop' && raw) {
      try {
        actual = JSON.parse(raw);
      } catch {
        actual = null;
      }
    }
    record({
      ...row, returnedModel: result.model, durationMs, usage, finish, raw,
      usdWithoutCacheDiscount: validUsage ? (input * inputPrice + output * outputPrice) / 1e6 : null,
      scores: actual ? evaluate(actual, fixture, training) : null,
    });
    if (!validUsage || result.model !== model) throw new Error('Unexpected model or token usage');
  }
  record({ complete: true });
}

main().catch(() => {
  console.error('Comparison stopped. Check the preflight log and any partial JSONL artifact.');
  process.exitCode = 1;
});
