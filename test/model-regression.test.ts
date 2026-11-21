import { expect, it } from 'vitest';
import { endpoint, limits, meterRegression } from './helpers/modelRegressionBudget.js';
import { measureRegression } from './helpers/modelRegression.js';

const model = 'gpt-5.4-mini-2026-03-17';
const request = (output = 100) => ({
  method: 'POST',
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'synthetic' }], max_completion_tokens: output }),
});

it('never forwards a retry after the call budget and prohibits redirects', async () => {
  let sent = 0;
  const meter = meterRegression(async (_, init) => {
    expect(init?.redirect).toBe('error');
    sent++;
    return new Response(null, { status: 429 });
  }, 'http://localhost:19000', 1);
  await meter.fetch(endpoint, request());
  await expect(meter.fetch(endpoint, request())).rejects.toThrow('budget exhausted');
  expect(sent).toBe(1);
});

it('enforces token and shared cost limits before dispatch', async () => {
  let sent = 0;
  const transport = async () => { sent++; return new Response(null, { status: 500 }); };
  const meter = meterRegression(transport, 'http://localhost:19000');
  await expect(meter.fetch(endpoint, request(limits.outputTokens + 1))).rejects.toThrow('Unbounded');
  expect(sent).toBe(0);
  const costMeter = meterRegression(transport, 'http://localhost:19000');
  for (let index = 0; index < 8; index++) await costMeter.fetch(endpoint, request(limits.outputTokens));
  await expect(costMeter.fetch(endpoint, request(limits.outputTokens))).rejects.toThrow('budget exhausted');
  expect(sent).toBe(8);
  expect(costMeter.totals().reservedDollars).toBeLessThan(limits.dollars);
});

it('exercises both learning arms through the real analyzer without external requests', async () => {
  const prompts: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    if (String(input) !== endpoint) return fetchLocal(input, init);
    const body = JSON.parse(String(init?.body));
    prompts.push(JSON.stringify(body.messages));
    return Response.json({
      model: body.model, choices: [{ message: { content: '{"title":"Document","custom_fields":{"invoice_number":"SYNTHETIC"}}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
    });
  };
  const fetchLocal = globalThis.fetch;
  const report = await measureRegression('offline-fixture', 'fake-key', transport);
  expect(report.rows).toHaveLength(16);
  expect(report.rows.every((row) => row.status === 'measured')).toBe(true);
  expect(prompts).toHaveLength(16);
  for (let index = 0; index < prompts.length; index += 2) expect(prompts[index + 1]).not.toBe(prompts[index]);
  expect(report.rows[0].fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'invoice_number', status: 'wrong', inventedIdentifier: true }),
  ]));
}, 30_000);

it('blocks an analyzer retry at the transport boundary after the shared cap', async () => {
  const fetchLocal = globalThis.fetch;
  let sent = 0;
  const report = await measureRegression('offline-retry', 'fake-key', async (input, init) => {
    if (String(input) !== endpoint) return fetchLocal(input, init);
    sent++;
    return Response.json({
      model: JSON.parse(String(init?.body)).model,
      choices: [{ message: { content: 'no JSON object here' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
    });
  }, 1);
  expect(sent).toBe(1);
  expect(report.budget.stopped).toBe(true);
  expect(report.rows).toHaveLength(16);
  expect(report.rows.every((row) => row.status === 'unmeasured')).toBe(true);
}, 30_000);
