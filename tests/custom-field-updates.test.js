'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCustomFieldUpdates } = require('../services/customFieldUpdates');

test('automatic custom-field updates preserve existing fields and ignore ambiguous suggestions', async () => {
  const definitions = {
    amount: { id: 1, data_type: 'monetary' },
    category: { id: 2, data_type: 'select', extra_data: {
      select_options: [{ id: 'first', label: 'Duplicate' }, { id: 'second', label: 'Duplicate' }]
    } },
    count: { id: 3, data_type: 'integer' },
    text: { id: 4, data_type: 'string' }
  };
  const existing = [{ field: 2, value: 'first' }, { field: 3, value: 9 }, { field: 4, value: 'keep' }];
  const paperless = {
    findExistingCustomField: async name => definitions[name],
    getExistingCustomFields: async () => existing
  };
  const updates = await buildCustomFieldUpdates(paperless, 42, [
    { field_name: 'amount', value: 'EUR-42,5' },
    { field_name: 'amount', value: 'EUR100.00' },
    { field_name: 'category', value: 'Duplicate' },
    { field_name: 'count', value: 2147483648 },
    { field_name: 'text', value: null },
    null
  ]);
  assert.deepEqual(updates, [{ field: 1, value: 'EUR-42.50' }, ...existing]);
  assert.deepEqual(await buildCustomFieldUpdates(paperless, 42, [
    { field_name: 'amount', value: '1,234' },
    { field_name: 'text', value: 'x'.repeat(129) }
  ]), []);
});

test('explicit monetary currency formats normalize without guessing symbols or separators',()=>{
  const {normalizeValue}=require('../services/customFieldUpdates');const field={data_type:'monetary'};
  for(const value of ['EUR 42.5','42.50 EUR','42,5EUR',' EUR42.50 '])assert.equal(normalizeValue(value,field),'EUR42.50');
  assert.equal(normalizeValue('-42,5 EUR',field),'EUR-42.50');
  for(const value of ['$42.50','USD42 EUR','EUR42EUR','EUR1,234.56','1.234,56 EUR','EUR42.999'])assert.equal(normalizeValue(value,field),undefined);
  assert.equal(normalizeValue('42.5',field),'42.50','legacy currency-free values remain currency-free');
  assert.equal(normalizeValue('-42.5',field),undefined,'legacy ambiguous negative values remain rejected');
});
