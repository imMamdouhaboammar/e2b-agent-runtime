import fs from 'fs';
import path from 'path';

async function templateInfo() {
  const manifestPath = path.resolve(process.cwd(), 'runtime-pack', 'MANIFEST.json');
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    console.log(raw);
  } else {
    console.log(JSON.stringify({ error: 'Manifest not found' }, null, 2));
  }
}

templateInfo().catch(console.error);
