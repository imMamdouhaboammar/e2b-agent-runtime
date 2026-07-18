import fs from 'fs';
import path from 'path';

async function verifyTemplate() {
  console.log('Verifying E2B Worker Template build...');
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('MANIFEST_MISSING: Runtime pack manifest not found.');
  }

  const bootstrapPath = path.resolve(process.cwd(), 'runtime-pack', 'bin', 'agent-bootstrap');
  if (!fs.existsSync(bootstrapPath)) {
    throw new Error('BOOTSTRAP_MISSING: Agent bootstrap script not found.');
  }

  console.log('Template verification passed successfully.');
}

verifyTemplate().catch(console.error);
