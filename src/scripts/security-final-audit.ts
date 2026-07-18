import { execSync as exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runAuditScript(scriptName: string): boolean {
  console.log(`\n>>> Running security audit script: ${scriptName} ...`);
  const scriptPath = path.join(__dirname, scriptName);
  try {
    exec(`npx tsx "${scriptPath}"`, { stdio: 'inherit' });
    console.log(`>>> [SUCCESS] ${scriptName} passed.`);
    return true;
  } catch (error) {
    console.error(`>>> [FAILED] ${scriptName} returned non-zero code.`);
    return false;
  }
}

function main() {
  console.log('====================================================');
  console.log('        E2B AGENT RUNTIME SECURITY FINAL AUDIT       ');
  console.log('====================================================');

  const scripts = [
    'security-credential-boundary.ts',
    'security-abuse-tests.ts',
    'security-cleanup-verification.ts',
  ];

  let successCount = 0;
  for (const script of scripts) {
    if (runAuditScript(script)) {
      successCount++;
    }
  }

  console.log('\n====================================================');
  console.log(`Security Final Audit: ${successCount}/${scripts.length} passed.`);
  if (successCount === scripts.length) {
    console.log('Status: ALL SECURITY AUDITS PASSED (STAGING/PROD READY)');
    process.exit(0);
  } else {
    console.error('Status: SECURITY AUDIT FAILED. REJECTING CANDIDATE!');
    process.exit(1);
  }
}

main();
