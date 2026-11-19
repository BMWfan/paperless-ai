import { describe, expect, it } from 'vitest';
import { convertCustomFieldValue, parseNumber, snapshotOf, truncateTitle } from '../../src/server/processing/applier.js';
import type { PaperlessCustomField, PaperlessDocument } from '../../src/server/paperless/types.js';

describe('parseNumber', () => {
  const cases: [string, number | null][] = [
    ['12', 12],
    ['12.50', 12.5],
    ['12,50', 12.5],
    ['12,50 €', 12.5],
    ['€ 12,50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['1.234.567', 1234567],
    ['1,234', 1234],
    ['1,234,567', 1234567],
    ['1 234,56', 1234.56],
    ['-5,5', -5.5],
    ['EUR 99', 99],
    ['USD 1,000.00', 1000],
    ['0,99', 0.99],
    ['abc', null],
    ['', null],
    ['-', null],
    ['€', null],
  ];
  for (const [input, expected] of cases) {
    it(`parses "${input}"`, () => expect(parseNumber(input)).toBe(expected));
  }
});

describe('convertCustomFieldValue', () => {
  const field = (data_type: PaperlessCustomField['data_type'], extra_data: PaperlessCustomField['extra_data'] = null): PaperlessCustomField => ({
    id: 1,
    name: 'F',
    data_type,
    extra_data,
  });

  it('preserves exact text and rejects overflow instead of truncating identifiers', () => {
    expect(convertCustomFieldValue(field('string'), '  hello ')).toBe('hello');
    expect(convertCustomFieldValue(field('string'), 'x'.repeat(129))).toBeUndefined();
    expect(convertCustomFieldValue(field('string'), 'two\nlines')).toBe('two\nlines');
    expect(convertCustomFieldValue(field('longtext'), 'y'.repeat(500))).toHaveLength(500);
  });
  it('retains native URL validation', () => {
    expect(convertCustomFieldValue(field('url'), 'www.example.com')).toBe('https://www.example.com');
    for (const value of ['not a url', 'https://exa mple.com', 'https://']) expect(convertCustomFieldValue(field('url'), value)).toBeUndefined();
  });
  it('requires real calendar dates in the canonical contract', () => {
    expect(convertCustomFieldValue(field('date'), '2024-3-15')).toBe('2024-03-15');
    for (const value of ['15.03.2024', '2025-02-29', 'soon']) expect(convertCustomFieldValue(field('date'), value)).toBeUndefined();
  });
  it('uses explicit boolean values rather than guessing from numbers or prose', () => {
    expect(convertCustomFieldValue(field('boolean'), 'true')).toBe(true);
    expect(convertCustomFieldValue(field('boolean'), 'false')).toBe(false);
    for (const value of ['ja', '1', 'maybe']) expect(convertCustomFieldValue(field('boolean'), value)).toBeUndefined();
  });
  it('never rounds fractional integers or strips unit text', () => {
    expect(convertCustomFieldValue(field('integer'), '42')).toBe(42);
    expect(convertCustomFieldValue(field('float'), '12.5')).toBe(12.5);
    for (const value of ['1.5', '1.234,56', '42 pcs', '2147483648']) expect(convertCustomFieldValue(field('integer'), value)).toBeUndefined();
    expect(convertCustomFieldValue(field('float'), '12,5')).toBeUndefined();
  });
  it('preserves an explicit document currency and only fills missing currency from defaults', () => {
    expect(convertCustomFieldValue(field('monetary', { default_currency: 'EUR' }), 'CHF12.50', 'USD')).toBe('CHF12.50');
    expect(convertCustomFieldValue(field('monetary', { default_currency: 'EUR' }), '12.50', 'USD')).toBe('EUR12.50');
    expect(convertCustomFieldValue(field('monetary'), '12', 'USD')).toBe('USD12.00');
    expect(convertCustomFieldValue(field('monetary'), '7,1')).toBe('7.10');
    for (const value of ['1,234', '1.234,56', 'USD 12 EUR', 'free']) expect(convertCustomFieldValue(field('monetary'), value)).toBeUndefined();
  });
  it('selects an exact unique modern label/id and preserves legacy index compatibility', () => {
    const objects = field('select', { select_options: [{ id: 'aB3', label: 'Open' }, { id: 'zZ9', label: 'Paid' }] });
    expect(convertCustomFieldValue(objects, 'Paid')).toBe('zZ9');
    expect(convertCustomFieldValue(objects, 'zZ9')).toBe('zZ9');
    expect(convertCustomFieldValue(field('select', { select_options: [{ id: 'a', label: 'Paid' }, { id: 'b', label: 'Paid' }] }), 'Paid')).toBeUndefined();
    expect(convertCustomFieldValue(field('select', { select_options: ['Open', 'Paid'] }), 'PAID')).toBe(1);
    expect(convertCustomFieldValue(field('select', { select_options: ['Paid', 'PAID'] }), 'Paid')).toBeUndefined();
  });

  it('unsupported types are ignored', () => {
    expect(convertCustomFieldValue(field('documentlink'), '12')).toBeUndefined();
  });
});

describe('snapshotOf / truncateTitle', () => {
  it('captures the undo-relevant fields (date part of created)', () => {
    const doc: PaperlessDocument = {
      id: 1,
      title: 'T',
      tags: [1, 2],
      correspondent: 3,
      document_type: null,
      created: '2024-03-15T00:00:00+01:00',
      custom_fields: [{ field: 9, value: 'x' }],
    };
    expect(snapshotOf(doc)).toEqual({
      title: 'T',
      tags: [1, 2],
      correspondent: 3,
      document_type: null,
      created: '2024-03-15',
      custom_fields: [{ field: 9, value: 'x' }],
    });
    expect(snapshotOf({ ...doc, created: '2024-03-15T23:30:00Z', created_date: '2024-03-16' }).created).toBe('2024-03-16');
  });

  it('limits titles to 128 characters', () => {
    expect(truncateTitle('  short ')).toBe('short');
    const long = truncateTitle('a'.repeat(300));
    expect(long).toHaveLength(128);
    expect(long.endsWith('…')).toBe(true);
  });
});
