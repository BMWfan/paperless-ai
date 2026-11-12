'use strict';

function normalizeValue(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  switch (field.data_type) {
    case 'string':
      return text && [...text].length <= 128 ? text : undefined;
    case 'longtext':
      return text || undefined;
    case 'integer': {
      const number = typeof value === 'number' || /^-?\d+$/.test(text) ? Number(value) : NaN;
      return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : undefined;
    }
    case 'float': {
      const number = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(text) ? Number(value) : NaN;
      return Number.isFinite(number) ? number : undefined;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (text === 'true' || text === 'false') return text === 'true';
      return undefined;
    case 'select': {
      const options = field.extra_data?.select_options;
      if (!text || !Array.isArray(options)) return undefined;
      const id = options.find(option => option?.id === text)?.id;
      if (id !== undefined) return id;
      const matches = options.filter(option => option?.label === text);
      return matches.length === 1 ? matches[0].id : undefined;
    }
    case 'monetary': {
      const amount = typeof value === 'number' && Number.isFinite(value) ? String(value) : text;
      const match = /^(?<currency>[A-Z]{3})?(?<whole>-?\d{1,10})(?:[.,](?<fraction>\d{1,2}))?$/.exec(amount);
      if (!match) return undefined;
      const { currency, whole, fraction } = match.groups;
      if (!currency && whole.startsWith('-')) return undefined;
      return `${currency || ''}${whole}.${(fraction || '').padEnd(2, '0')}`;
    }
    default:
      return text || undefined;
  }
}

async function buildCustomFieldUpdates(paperless, documentId, suggestions) {
  if (typeof suggestions !== 'object' || suggestions === null) return [];
  const updates = new Map();
  for (const suggestion of Object.values(suggestions)) {
    const name = typeof suggestion?.field_name === 'string' ? suggestion.field_name.trim() : '';
    if (!name || suggestion.value == null) continue;
    const field = await paperless.findExistingCustomField(name);
    if (!field?.id) continue;
    const value = normalizeValue(suggestion.value, field);
    if (value === undefined) {
      console.warn(`[WARN] Skipping invalid custom field suggestion for field ${field.id}`);
      continue;
    }
    if (!updates.has(field.id)) updates.set(field.id, { field: field.id, value });
  }
  if (!updates.size) return [];
  const existing = await paperless.getExistingCustomFields(documentId);
  return [...updates.values(), ...existing.filter(row => !updates.has(row.field))];
}

module.exports = { buildCustomFieldUpdates };
