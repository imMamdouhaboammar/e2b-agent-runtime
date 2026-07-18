import { validateWorkspaceCwd } from '../security/paths.js';
import { NavigationGuard } from '../browser/navigation-guard.js';
import { loadBrowserConfig } from '../config.js';

function testPathTraversal() {
  console.log('\n--- Testing Directory Traversal Protection ---');
  
  const safePaths = [
    '/workspace',
    '/workspace/repository',
    '/workspace/repository/src',
  ];

  const dangerousPaths = [
    '/workspace/..',
    '/workspace/../etc',
    '/',
    '/etc/shadow',
    '/workspace/repository/\0dangerous',
  ];

  let failures = 0;

  for (const p of safePaths) {
    try {
      const res = validateWorkspaceCwd(p);
      console.log(`[PASS] Safe path accepted: "${p}" -> "${res}"`);
    } catch (e: any) {
      console.error(`[FAIL] Safe path was falsely rejected: "${p}". Error: ${e.message}`);
      failures++;
    }
  }

  for (const p of dangerousPaths) {
    try {
      validateWorkspaceCwd(p);
      console.error(`[FAIL] Dangerous path was falsely ACCEPTED: "${p}"`);
      failures++;
    } catch (e: any) {
      console.log(`[PASS] Dangerous path correctly blocked: "${p}". Error: ${e.message}`);
    }
  }

  return failures;
}

function testSsrfBlocking() {
  console.log('\n--- Testing SSRF & Navigation Guard Protection ---');

  const browserConfig = loadBrowserConfig();
  const guard = new NavigationGuard(browserConfig);

  const safeUrls = [
    'http://localhost:3000/',
    'http://127.0.0.1:8080/index.html',
    'about:blank',
  ];

  const blockedUrls = [
    'http://169.254.169.254/',
    'http://169.254.10.12/metadata',
    'http://metadata.google.internal/',
    'ftp://127.0.0.1/etc/passwd',
    'http://admin:pass@127.0.0.1/dashboard',
  ];

  let failures = 0;

  for (const url of safeUrls) {
    try {
      const res = guard.validateUrl(url);
      console.log(`[PASS] Safe URL accepted: "${url}" -> "${res.normalizedUrl}" (Internal: ${res.isInternal})`);
    } catch (e: any) {
      console.error(`[FAIL] Safe URL was falsely rejected: "${url}". Error: ${e.message}`);
      failures++;
    }
  }

  for (const url of blockedUrls) {
    try {
      guard.validateUrl(url);
      console.error(`[FAIL] Blocked/SSRF URL was falsely ACCEPTED: "${url}"`);
      failures++;
    } catch (e: any) {
      console.log(`[PASS] SSRF/Malicious URL correctly blocked: "${url}". Error: ${e.message}`);
    }
  }

  return failures;
}

function main() {
  let totalFailures = 0;
  totalFailures += testPathTraversal();
  totalFailures += testSsrfBlocking();

  console.log('\n=== Security Abuse Evasion Tests Summary ===');
  if (totalFailures > 0) {
    console.error(`Status: FAILED (${totalFailures} failures)`);
    process.exit(1);
  } else {
    console.log('Status: PASSED. All directory traversal and SSRF attacks successfully prevented.');
    process.exit(0);
  }
}

main();
