import { writeFileSync } from 'node:fs';
import { measureRegression } from './modelRegression.js';
import { measureAmountScope } from './amountScopeRegression.js';
import { limits, snapshots } from './modelRegressionBudget.js';

const key = process.env.MODEL_REGRESSION_API_KEY;
const sha = process.env.MODEL_REGRESSION_SHA;
if (!key || !sha || !/^[0-9a-f]{40}$/.test(sha) || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('A reviewed GitHub Actions measurement SHA and environment test key are required');
}
delete process.env.MODEL_REGRESSION_API_KEY;
const mode = process.env.MODEL_REGRESSION_MODE ?? 'baseline';
if (mode !== 'baseline' && mode !== 'amount-scope') throw new Error('Unknown measurement mode');
const paired = mode === 'amount-scope';
console.log(JSON.stringify({ sha, mode, snapshots, limits: { ...limits, calls: paired ? 2 : limits.calls }, maxEurPerUsdWithTaxes: 4 / 3 }));
const report = paired ? await measureAmountScope(sha, key) : await measureRegression(sha, key);
writeFileSync('model-regression-report.json', JSON.stringify(report, null, 2) + '\n');
if (report.rows.some((row) => row.status !== (paired ? 'match' : 'measured'))) process.exitCode = 1;
