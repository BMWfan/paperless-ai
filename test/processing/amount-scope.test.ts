import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { configSchema } from '../../src/server/config/schema.js';
import { buildAnalysisPrompt } from '../../src/server/processing/prompt.js';

interface ScopeFixture {
  document: string;
  cases: { id: string; description: string; expected: string | null }[];
}

const fixture = JSON.parse(readFileSync(new URL('./amount-scope.fixture.json', import.meta.url), 'utf8')) as ScopeFixture;

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
