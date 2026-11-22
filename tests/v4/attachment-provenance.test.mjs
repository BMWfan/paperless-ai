import assert from 'node:assert/strict';
import test from 'node:test';
import { locateProposal, scoreProposals } from './attachment-provenance.mjs';

test('retains an unheaded OCR label with a verifiable line and holds an attachment value', () => {
  const content = 'Rechnungsnummer   READY-007\nGesamtbetrag: EUR 20.00\nEin alter Beleg ist beigefügt:\nBetrag: EUR 900.00';
  assert.deepEqual(locateProposal(content, 'invoice_number', 'READY-007').sources, [
    { line: 1, text: 'Rechnungsnummer   READY-007', scope: 'body' },
  ]);
  assert.equal(locateProposal(content, 'amount', '20 EUR').decision, 'supported');
  assert.equal(locateProposal(content, 'amount', '900 EUR').decision, 'hold');
});

test('routes repeated, missing and unqualified evidence to review', () => {
  const content = 'Invoice number: CUR-19\nTotal amount: EUR 20.00\n[Attachment]\nInvoice number: CUR-19';
  assert.equal(locateProposal(content, 'invoice_number', 'CUR-19').decision, 'review');
  assert.equal(locateProposal(content, 'invoice_number', 'CUR-1').decision, 'review');
  assert.equal(locateProposal(content, 'amount', '20.00').decision, 'review');
});

test('allows explicit current sections after attachments and keeps ambiguous sections reviewable', () => {
  const body = '[Attachment]\nInvoice number: OLD-42\n[Current document]\nInvoice number: CUR-19';
  assert.equal(locateProposal(body, 'invoice_number', 'CUR-19').decision, 'supported');
  assert.equal(locateProposal(body + '\n[Current document]', 'invoice_number', 'CUR-19').decision, 'review');
  assert.equal(locateProposal('[Other]\nInvoice number: CUR-19', 'invoice_number', 'CUR-19').decision, 'review');
});

test('separates true retention, false support and abstention', () => {
  const rows = [
    { content: 'Invoice number: CUR-19', proposed: 'CUR-19', correct: true },
    { content: 'Invoice number: WRONG-42', proposed: 'WRONG-42', correct: false },
    { content: 'An old receipt is attached:\nInvoice number: OLD-42', proposed: 'OLD-42', correct: false },
    { content: 'No readable label', proposed: 'CUR-19', correct: true },
  ].map((row) => ({ ...row, field: 'invoice_number' }));
  assert.deepEqual(scoreProposals(rows), {
    correct: { supported: 1, review: 1, hold: 0 }, wrong: { supported: 1, review: 0, hold: 1 },
  });
});
