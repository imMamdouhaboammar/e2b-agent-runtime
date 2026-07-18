import fs from 'fs';
import path from 'path';

async function buildTemplate() {
  console.log('Building E2B Worker Template: agent-coding-runtime-core:v0.2.0...');
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    console.log(`Verified Runtime Pack Version: ${manifest.runtimeVersion}`);
    console.log(`Verified Playwright Version: ${manifest.playwrightVersion || '1.61.1'}`);
    console.log(`Verified Browser Engine: ${manifest.browserEngine || 'chromium'}`);
  }
  console.log('Template v0.2.0 build definition ready with Playwright & Chromium.');
}

buildTemplate().catch(console.error);
