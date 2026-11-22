import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import fields from '../../src/server/learning/legacy/customFieldUpdates.cjs';

const labels = {
  invoice_number: /^(?:invoice number|rechnungsnummer)(?:\s*[:–—]\s*|\s{2,})(\S.*)$/i,
  amount: /^(?:(?:total |contract )?amount|(?:gesamt|vertrags)?betrag)(?:\s*[:–—]\s*|\s{2,})(\S.*)$/i,
};
const current = /^\[(?:current document|aktuelles dokument)\]$/i;
const historical = /^(?:\[(?:historical reference|attachment|historischer beleg|anhang|anlage)\]|(?:an? old (?:receipt|invoice) is attached(?: for information)?|(?:ein alter Beleg|eine alte Rechnung) (?:ist beigefügt|liegt bei))\s*:)$/i;
const section = /^\[[^\]]+\]$/;

export function locateProposal(content, field, proposal) {
  if (!Object.hasOwn(labels, field)) throw new Error('Unsupported diagnostic field');
  const data_type = field === 'amount' ? 'monetary' : 'string';
  const expected = fields.normalizeValue(proposal, { data_type });
  if (expected == null || (field === 'amount' && !/^EUR-?\d+\.\d{2}$/.test(expected))) {
    return { decision: 'review', reason: 'invalid_or_unqualified_value', sources: [] };
  }
  const sources = [];
  let scope = 'body';
  let currentSections = 0;
  for (const [index, original] of content.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (current.test(line)) {
      currentSections++;
      scope = 'current';
    } else if (historical.test(line)) {
      scope = 'historical';
    } else if (section.test(line)) {
      scope = 'unknown';
    } else {
      const match = labels[field].exec(line);
      if (match && fields.normalizeValue(match[1], { data_type }) === expected) {
        sources.push({ line: index + 1, text: original, scope });
      }
    }
  }
  if (sources.length > 0 && sources.every((source) => source.scope === 'historical')) {
    return { decision: 'hold', reason: 'historical_only', sources };
  }
  if (sources.length !== 1 || currentSections > 1 || sources[0].scope === 'unknown' ||
      (currentSections === 1 && sources[0].scope === 'body')) {
    return { decision: 'review', reason: 'missing_or_ambiguous_source', sources };
  }
  return { decision: 'supported', reason: 'unique_labeled_source', sources };
}

export function scoreProposals(proposals) {
  const score = { correct: { supported: 0, review: 0, hold: 0 }, wrong: { supported: 0, review: 0, hold: 0 } };
  for (const { content, field, proposed, correct } of proposals) {
    if (proposed != null && proposed !== '' && Object.hasOwn(labels, field)) {
      score[correct ? 'correct' : 'wrong'][locateProposal(content, field, proposed).decision]++;
    }
  }
  return score;
}

function equivalentAmount(proposed, expected) {
  if (proposed == null || expected == null) return false;
  const field = { data_type: 'monetary' };
  const normalized = fields.normalizeValue(proposed, field);
  return typeof normalized === 'string' && /^EUR-?\d+\.\d{2}$/.test(normalized) &&
    normalized === fields.normalizeValue(expected, field);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) {
  const bytes = readFileSync(process.argv[2]);
  const report = JSON.parse(bytes);
  const samples = new Map(report.corpus.evaluation.map((sample) => [sample.id, sample]));
  const proposals = report.rows.filter((row) => row.status === 'measured').flatMap((row) => row.fields.map((field) => ({
    content: samples.get(row.caseId).content, field: field.field, proposed: field.actual,
    correct: field.status === 'correct' || (field.field === 'amount' && equivalentAmount(field.actual, field.expected)),
  })));
  const { cases } = JSON.parse(readFileSync(new URL('../quality/section-evidence/cases.json', import.meta.url)));
  const frozen = cases.map((row) => ({
    ...row, correct: row.proposed === row.expected || (row.field === 'amount' && equivalentAmount(row.proposed, row.expected)),
  }));
  console.log(JSON.stringify({ sha: report.sha, reportSha256: createHash('sha256').update(bytes).digest('hex'),
    replay: scoreProposals(proposals), confirmation: scoreProposals(frozen.filter((row) => row.split === 'confirmation')) }, null, 2));
}
