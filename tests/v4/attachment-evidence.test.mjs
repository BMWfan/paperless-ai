import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attachmentEvidence, scoreAttachmentCases } from './attachment-evidence.mjs';

test('retains a current identifier and omits an old attachment amount', () => {
  const result = attachmentEvidence('Invoice number: CUR-123\nAn old receipt is attached for information:\nAmount: EUR 777.77', {
    invoice_number: 'CUR-123', amount: 'EUR777.77',
  });
  assert.deepEqual({ ...result.accepted }, { invoice_number: 'CUR-123' });
  assert.ok(result.rejected.amount);
});

test('requires an unambiguous explicit current section if headings claim one', () => {
  const content = '[Aktuelles Dokument]\nRechnungsnummer: CUR-123\n[Aktuelles Dokument]\nRechnungsnummer: OTHER-19';
  assert.ok(attachmentEvidence(content, { invoice_number: 'CUR-123' }).rejected.invoice_number);
});

test('scores retained values and false acceptances separately on frozen splits', () => {
  const { cases } = JSON.parse(readFileSync(new URL('../quality/section-evidence/cases.json', import.meta.url)));
  for (const split of ['development', 'confirmation']) {
    const result = scoreAttachmentCases(cases.filter((row) => row.split === split));
    assert.equal(result.cases, 20);
    assert.equal(result.correctProposed, 10);
    assert.equal(result.wrongProposed, 10);
    assert.equal(result.correctRetained + result.wrongAccepted <= result.cases, true);
  }
});
