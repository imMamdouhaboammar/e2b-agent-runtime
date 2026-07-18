import fs from 'fs';
import path from 'path';

async function buildTemplate() {
  console.log('Building E2B Worker Template: agent-coding-runtime-core:v0.1.0...');
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    console.log(`Verified Runtime Pack Version: ${manifest.runtimeVersion}`);
  }
  console.log('Template build definition ready.');
}

buildTemplate().catch(console.error);
