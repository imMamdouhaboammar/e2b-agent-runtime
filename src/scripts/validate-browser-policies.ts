import fs from 'fs';
import path from 'path';
import { loadBrowserConfig } from '../config.js';

async function validatePolicies() {
  console.log('Validating Phase 6 browser runtime policies...');
  const policyFiles = [
    'browser-policy.json',
    'navigation-policy.json',
    'artifact-policy.json',
    'accessibility-policy.json',
  ];

  for (const file of policyFiles) {
    const filePath = path.resolve(process.cwd(), 'runtime-pack', 'policies', file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`MISSING_POLICY: Policy file "${file}" not found in runtime-pack/policies/`);
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!content.name || !content.version) {
      throw new Error(`INVALID_POLICY: Policy file "${file}" missing name or version.`);
    }
    console.log(`✓ Policy valid: ${file} (v${content.version})`);
  }

  // Validate loaded browser config schema
  const config = loadBrowserConfig();
  if (config.engine !== 'chromium') {
    throw new Error('CONFIG_ERROR: Required engine must be chromium.');
  }

  console.log('All Phase 6 browser policies validated successfully.');
}

validatePolicies().catch((err) => {
  console.error(err);
  process.exit(1);
});
