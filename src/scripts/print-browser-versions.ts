import fs from 'fs';
import path from 'path';

async function printVersions() {
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  let manifestVersion = 'unknown';
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifestVersion = manifest.playwrightVersion || '1.61.1';
  }

  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  console.log('--- Phase 6 Browser & Engine Versions ---');
  console.log(`Package Playwright: ${pkg.dependencies?.playwright || 'installed'}`);
  console.log(`Package Axe-Core Playwright: ${pkg.dependencies?.['@axe-core/playwright'] || 'installed'}`);
  console.log(`Runtime Pack Playwright: ${manifestVersion}`);
  console.log(`Required Browser Engine: Chromium`);
  console.log('-----------------------------------------');
}

printVersions();
