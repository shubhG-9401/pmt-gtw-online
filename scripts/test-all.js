import { spawnSync } from 'node:child_process';

const testSuites = [
  'packages/common/src/__tests__/common.test.js',
  'packages/db/src/__tests__/db.test.js',
  'packages/core/src/__tests__/bank-parsers.test.js',
  'packages/core/src/__tests__/attribution.test.js',
  'packages/core/src/__tests__/queue.test.js',
  'packages/merchant-sdk/src/__tests__/sdk.test.js',
  'packages/observer-sdk/src/__tests__/observer-sdk.test.js',
  'apps/payment-api/src/__tests__/payment-api.test.js',
  'apps/checkout-portal/src/__tests__/checkout-portal.test.js',
  'apps/merchant-admin/src/__tests__/merchant-admin.test.js',
  'apps/demo-store/src/__tests__/store.test.js',
  'apps/control-center/src/__tests__/control-center.test.js'
];

console.log('============================================================');
console.log('🧪 PMT GTW (ONLINE) — FULL REGRESSION TEST RUNNER');
console.log(`Running ${testSuites.length} curated test suites...`);
console.log('============================================================\n');

let passedCount = 0;
const startTotal = Date.now();

for (let i = 0; i < testSuites.length; i++) {
  const file = testSuites[i];
  process.stdout.write(`[${i + 1}/${testSuites.length}] Testing ${file}... `);
  const startFile = Date.now();

  const result = spawnSync(process.execPath, ['--test', file], {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PMT_MODE: 'test'
    },
    encoding: 'utf8'
  });

  const duration = ((Date.now() - startFile) / 1000).toFixed(2);

  if (result.status === 0) {
    passedCount++;
    console.log(`✅ PASS (${duration}s)`);
  } else {
    console.log(`❌ FAIL (${duration}s)\n`);
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    console.error(`\n[-] Test failed in ${file}`);
    process.exit(result.status || 1);
  }
}

const totalDuration = ((Date.now() - startTotal) / 1000).toFixed(2);
console.log('\n============================================================');
console.log(`🎉 ALL ${passedCount} TEST SUITES PASSED CLEANLY (Total: ${totalDuration}s)`);
console.log('============================================================');
process.exit(0);
