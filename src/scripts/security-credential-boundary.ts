import { redactSecrets } from '../security/redact.js';

function main() {
  console.log('=== Running Security Credential Boundary Check ===');

  const testLogs = [
    { log: 'Authorization: Bearer e2b_1234567890abcdef', secrets: [] },
    { log: 'E2B_API_KEY=e2b_api_key_secret_here', secrets: [] },
    { log: 'DATABASE_URL=postgresql://postgres:secretpassword@localhost:5432/mydb', secrets: ['secretpassword'] },
    { log: 'Everything is clear and healthy here.', secrets: [] },
  ];

  let violations = 0;

  for (const { log, secrets } of testLogs) {
    const redacted = redactSecrets(log, secrets);
    console.log(`Original: ${log}`);
    console.log(`Redacted: ${redacted}`);

    if (redacted.includes('e2b_1234567890abcdef') || redacted.includes('secretpassword')) {
      console.error(`VIOLATION: Secret was not redacted correctly in log: "${log}"`);
      violations++;
    }
  }

  if (violations > 0) {
    console.error('Credential Boundary Check: FAILED');
    process.exit(1);
  } else {
    console.log('Credential Boundary Check: PASSED. All secrets correctly redacted.');
    process.exit(0);
  }
}

main();
