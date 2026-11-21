import { writeFileSync } from 'node:fs';
import { measureRegression } from './modelRegression.js';
import { limits, snapshots } from './modelRegressionBudget.js';

const key = process.env.MODEL_REGRESSION_API_KEY;
const sha = process.env.MODEL_REGRESSION_SHA;
if (!key || !sha || !/^[0-9a-f]{40}$/.test(sha) || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('A reviewed GitHub Actions measurement SHA and environment test key are required');
}
delete process.env.MODEL_REGRESSION_API_KEY;
console.log(JSON.stringify({ sha, snapshots, limits, maxEurPerUsdWithTaxes: 4 / 3 }));
const report = await measureRegression(sha, key);
writeFileSync('model-regression-report.json', JSON.stringify(report, null, 2) + '\n');
if (report.rows.some((row) => row.status !== 'measured')) process.exitCode = 1;
