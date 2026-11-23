import { expect, it } from 'vitest';
import { configSchema } from '../../src/server/config/schema.js';
import { buildAnalysisPrompt } from '../../src/server/processing/prompt.js';

import { amountScopeFixture as fixture, measureAmountScope } from '../helpers/amountScopeRegression.js';
import { endpoint } from '../helpers/modelRegressionBudget.js';

it('keeps the same document but sends distinct meanings for the same configured amount field', () => {
  const prompts = fixture.cases.map(({ description }) => {
    const config = configSchema.parse({ processing: { customFields: [{ name: 'Amount', type: 'monetary', currency: 'EUR', description }] } });
    return buildAnalysisPrompt(config, fixture.document, {
      tags: [], correspondents: [], documentTypes: [], customFields: config.processing.customFields,
    }, { today: '2026-11-22' });
  });
  expect(fixture.cases.map(({ id, expected }) => [id, expected])).toEqual([
    ['current-amount-due', null], ['invoice-amount-in-file', 'EUR777.77'],
  ]);
  expect(prompts[0].schema).toEqual(prompts[1].schema);
  expect(prompts[0].messages.slice(1)).toEqual(prompts[1].messages.slice(1));
  for (const [index, prompt] of prompts.entries()) {
    expect(prompt.messages[0].content).toContain(fixture.cases[index].description);
    expect(prompt.messages[0].content).not.toContain(fixture.cases[1 - index].description);
    expect(prompt.messages[1].content).toContain(fixture.document);
  }
});

it('measures both scopes and caps invalid-response retries at one HTTP attempt per scope', async () => {
  const localFetch = globalThis.fetch;
  const sent: string[] = [];
  const report = await measureAmountScope('offline-fixture', 'fake-key', async (input, init) => {
    if (String(input) !== endpoint) return localFetch(input, init);
    const body = JSON.parse(String(init?.body));
    sent.push(JSON.stringify(body.messages));
    return Response.json({
      model: body.model,
      choices: [{ message: { content: sent.length === 1 ? 'invalid model output' : '{"custom_fields":[{"field_name":"Amount","value":"777.77 EUR"}]}' },
        finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
    });
  });
  expect(sent).toHaveLength(2);
  expect(sent[0]).toContain(fixture.cases[0].description);
  expect(sent[1]).toContain(fixture.cases[1].description);
  expect(report.rows).toMatchObject([
    { status: 'budget-or-contract-stop', attempts: [expect.anything()] },
    { status: 'match', actual: 'EUR777.77', attempts: [expect.anything()] },
  ]);
}, 30_000);

it('measures five PDF-derived cases and rejects an amount selected for an ambiguous case', async () => {
  const localFetch = globalThis.fetch;
  const outputs = [null, '777.77 EUR', '45.00 EUR', '777.77 EUR', null];
  let calls = 0;
  const report = await measureAmountScope('offline-fixture', 'fake-key', async (input, init) => {
    if (String(input) !== endpoint) return localFetch(input, init);
    const body = JSON.parse(String(init?.body));
    const value = outputs[calls++];
    const custom_fields = value === null ? [] : [{ field_name: 'Amount', value }];
    return Response.json({
      model: body.model,
      choices: [{ message: { content: JSON.stringify({ custom_fields }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
    });
  }, true);
  expect(calls).toBe(5);
  expect(report.rows.map((row) => row.status)).toEqual(['match', 'match', 'match', 'mismatch', 'match']);
}, 30_000);
