// tests/run_all.js
import { spawnSync } from 'child_process';

const testFiles = [
  'tests/auth.test.js',
  'tests/rbac.test.js',
  'tests/organization.test.js',
  'tests/document.test.js',
  'tests/processing.test.js',
  'tests/analysis.test.js',
  'tests/tampering.test.js',
  'tests/faceVerification.test.js',
  'tests/risk.test.js',
  'tests/screening.test.js',
  'tests/watchlist.test.js',
];

console.log('🧪 Running DocShield AI Complete Backend Test Suite...\n');

let totalPassed = 0;
let totalFailed = 0;

for (const file of testFiles) {
  console.log(`=======================================================`);
  console.log(`▶ Running ${file}...`);
  console.log(`=======================================================`);

  const result = spawnSync('node', ['--test', file], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status === 0) {
    console.log(`\n✅ ${file} COMPLETED SUCCESSFULLY\n`);
    totalPassed++;
  } else {
    console.error(`\n❌ ${file} FAILED with exit status ${result.status}\n`);
    totalFailed++;
  }
}

console.log('=======================================================');
console.log(`📊 SUMMARY: ${totalPassed} suites passed, ${totalFailed} suites failed.`);
console.log('=======================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL BACKEND TEST SUITES PASSED! 100% SUCCESS!');
  process.exit(0);
}
