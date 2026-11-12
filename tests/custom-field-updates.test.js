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

test('calendar date suggestions reject null text and impossible dates without guessing locales',()=>{
  const {normalizeValue}=require('../services/customFieldUpdates');const field={data_type:'date'};
  for(const value of ['2024-02-29','2000-02-29','1900-02-28','0001-01-01','9999-12-31'])assert.equal(normalizeValue(value,field),value);
  assert.equal(normalizeValue(' 2032-2-29 ',field),'2032-02-29');
  for(const value of ['null','undefined','2025-02-29','1900-02-29','2031-02-30','2024-04-31','2024-13-01','2024-00-01','2024-01-00','0000-01-01','29.02.2024','20240229','2024-02-29T00:00:00Z',null,42])assert.equal(normalizeValue(value,field),undefined,String(value));
});

test('invalid automatic date leaves its previous value while other fields remain writable',async()=>{
  const existing=[{field:1,value:'2030-01-01'},{field:3,value:'keep'}];
  const definitions={date:{id:1,data_type:'date'},validDate:{id:4,data_type:'date'},note:{id:2,data_type:'string'}};
  const paperless={findExistingCustomField:async name=>definitions[name],getExistingCustomFields:async()=>existing};
  const updates=await buildCustomFieldUpdates(paperless,42,[{field_name:'date',value:'null'},{field_name:'date',value:'2031-02-30'},{field_name:'validDate',value:'2032-2-29'},{field_name:'note',value:'New metadata'}]);
  assert.deepEqual(updates,[{field:4,value:'2032-02-29'},{field:2,value:'New metadata'},...existing]);
  assert.deepEqual(await buildCustomFieldUpdates(paperless,42,[{field_name:'date',value:'null'}]),[]);
});
