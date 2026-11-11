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
