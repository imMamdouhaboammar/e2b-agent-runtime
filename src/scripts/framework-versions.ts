import fs from 'node:fs';
import path from 'node:path';

function run() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('Error: package.json not found in working directory.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};

  const targetPackages = [
    'e2b',
    '@openai/agents',
    '@openai/agents-core',
    '@openai/agents-extensions',
    '@modelcontextprotocol/sdk',
    'zod',
  ];

  console.log('=== Framework Dependency Versions ===');
  for (const pkgName of targetPackages) {
    const version = deps[pkgName] || devDeps[pkgName] || 'Not Installed';
    console.log(`- ${pkgName}: ${version}`);
  }
}

run();
