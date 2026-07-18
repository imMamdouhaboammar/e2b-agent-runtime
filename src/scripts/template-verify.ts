import fs from 'fs';
import path from 'path';

async function verifyTemplate() {
  console.log('Verifying E2B Worker Template build...');
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('MANIFEST_MISSING: Runtime pack manifest not found.');
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (!manifest.playwrightVersion) {
    throw new Error('PLAYWRIGHT_MANIFEST_MISSING: Playwright version not recorded in manifest.');
  }

  const bootstrapPath = path.resolve(process.cwd(), 'runtime-pack', 'bin', 'agent-bootstrap');
  if (!fs.existsSync(bootstrapPath)) {
    throw new Error('BOOTSTRAP_MISSING: Agent bootstrap script not found.');
  }

  console.log(`Template verification passed: ${manifest.templateName}:${manifest.templateTag} (Playwright ${manifest.playwrightVersion})`);
}

verifyTemplate().catch(console.error);
