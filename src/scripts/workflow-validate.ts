import fs from 'node:fs';
import path from 'node:path';

function main() {
  const policiesDir = path.resolve(process.cwd(), 'runtime-pack/policies');
  if (!fs.existsSync(policiesDir)) {
    console.error('Policies directory not found:', policiesDir);
    process.exit(1);
  }

  const files = fs.readdirSync(policiesDir).filter((f) => f.endsWith('.json'));
  console.log(`Validated ${files.length} workflow policy files:`);
  for (const f of files) {
    const raw = fs.readFileSync(path.join(policiesDir, f), 'utf-8');
    JSON.parse(raw);
    console.log(`  ✓ ${f}`);
  }
}

main();
