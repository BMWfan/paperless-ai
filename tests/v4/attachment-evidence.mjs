import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import fields from '../../src/server/learning/legacy/customFieldUpdates.cjs';

const currentHeading = /^\s*\[(?:current document|aktuelles dokument)\]\s*$/i;
const heading = /^\s*\[[^\]]+\]\s*$/;
const oldAttachment = /^\s*(?:an? old (?:receipt|invoice) is attached(?: for information)?|(?:ein alter Beleg|eine alte Rechnung) (?:ist beigefügt|liegt bei))\s*:\s*$/i;
const definitions = {
  invoice_number: ['string', 'invoice number', 'rechnungsnummer'],
  contract_number: ['string', 'contract number', 'vertragsnummer'],
  policy_number: ['string', 'policy number', 'versicherungsnummer'],
  amount: ['monetary', 'amount', 'betrag'],
  due_date: ['date', 'due date', 'fällig am'],
  end_date: ['date', 'end date', 'enddatum'],
};

export function attachmentEvidence(content, proposed) {
  const lines = content.split(/\r?\n/);
  const explicit = lines.filter((line) => currentHeading.test(line)).length;
  let current = explicit === 0;
  const currentText = lines.map((line) => {
    if (currentHeading.test(line)) {
      current = explicit === 1;
      return '';
    }
    if (heading.test(line) || oldAttachment.test(line)) {
      current = false;
      return '';
    }
    return current ? line : '';
  }).join('\n');
  const pairs = currentText.split('\n').flatMap((line) => {
    const match = /^\s*([^:]+):\s*(\S.*?)\s*$/.exec(line);
    return match ? [{ label: match[1].trim().toLowerCase(), value: match[2] }] : [];
  });
  const accepted = {};
  const rejected = {};
  for (const [name, value] of Object.entries(proposed)) {
    const definition = Object.hasOwn(definitions, name) ? definitions[name] : undefined;
    if (!definition) continue;
    const [data_type, ...labels] = definition;
    const matching = pairs.filter(({ label }) => labels.includes(label));
    const normalized = fields.normalizeValue(value, { data_type });
    if (normalized != null && (data_type !== 'monetary' || /^EUR-?\d+\.\d{2}$/.test(normalized)) &&
        matching.length === 1 && fields.normalizeValue(matching[0].value, { data_type }) === normalized) {
      accepted[name] = value;
    } else {
      rejected[name] = 'missing_or_ambiguous_current_evidence';
    }
  }
  return { accepted, rejected };
}

export function scoreAttachmentCases(rows) {
  const scores = { cases: rows.length, correctProposed: 0, wrongProposed: 0, correctRetained: 0, wrongAccepted: 0 };
  for (const row of rows) {
    if (row.proposed == null || row.proposed === '') continue;
    const data_type = definitions[row.field]?.[0];
    const correct = row.correct ?? (row.expected != null && data_type !== undefined &&
      fields.normalizeValue(row.proposed, { data_type }) === fields.normalizeValue(row.expected, { data_type }));
    const result = attachmentEvidence(row.content, { [row.field]: row.proposed });
    const accepted = Object.hasOwn(result.accepted, row.field);
    if (correct) {
      scores.correctProposed++;
      if (accepted) scores.correctRetained++;
    } else {
      scores.wrongProposed++;
      if (accepted) scores.wrongAccepted++;
    }
  }
  return scores;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const frozen = readFileSync(new URL('../quality/section-evidence/cases.json', import.meta.url));
  const { cases } = JSON.parse(frozen);
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const report = { frozenSha256: sha256(frozen), splits: Object.fromEntries(['development', 'confirmation'].map((split) =>
    [split, scoreAttachmentCases(cases.filter((row) => row.split === split))])) };
  if (process.argv[2]) {
    const archive = readFileSync(process.argv[2]);
    const original = JSON.parse(archive);
    const samples = new Map(original.corpus.evaluation.map((row) => [row.id, row]));
    const proposals = original.rows.filter((row) => row.status === 'measured').flatMap((row) => {
      const sample = samples.get(row.caseId);
      return row.fields.filter((field) => Object.hasOwn(sample.expected.custom_fields, field.field)).map((field) => ({
        content: sample.content, field: field.field, proposed: field.actual, expected: field.expected,
        correct: field.status === 'correct',
      }));
    });
    report.analyzerReplay = { sha: original.sha, archiveSha256: sha256(archive), ...scoreAttachmentCases(proposals) };
  }
  console.log(JSON.stringify(report, null, 2));
}
