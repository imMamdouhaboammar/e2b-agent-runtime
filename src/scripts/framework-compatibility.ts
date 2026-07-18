import fs from 'node:fs';
import path from 'node:path';

function checkCompatibility() {
  console.log('=== Framework Compatibility Check ===');

  // 1. Node.js runtime check
  const nodeVersion = process.version;
  const versionMatch = nodeVersion.match(/^v(\d+)\./);
  let isNodeCompatible = false;
  let nodeWarning = '';

  if (versionMatch) {
    const major = Number.parseInt(versionMatch[1], 10);
    if (major >= 22) {
      isNodeCompatible = true;
      console.log(`[PASS] Node.js version: ${nodeVersion} (compatible with OpenAI Agents SDK)`);
    } else {
      isNodeCompatible = false;
      nodeWarning = `OpenAI Agents SDK requires Node.js >=22. Direct E2B fallback is safe to run on ${nodeVersion}.`;
      console.log(`[WARN] Node.js version: ${nodeVersion} (${nodeWarning})`);
    }
  } else {
    console.log(`[WARN] Unable to parse Node.js version: ${nodeVersion}`);
  }

  // 2. Package dependency checks
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('Error: package.json not found.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = pkg.dependencies || {};

  // Check MCP SDK
  const mcpVersion = deps['@modelcontextprotocol/sdk'] || '';
  if (mcpVersion) {
    console.log(`[INFO] @modelcontextprotocol/sdk: ${mcpVersion}`);
  } else {
    console.log('[WARN] @modelcontextprotocol/sdk not found in dependencies.');
  }

  // Check E2B
  const e2bVersion = deps['e2b'] || '';
  if (e2bVersion) {
    console.log(`[INFO] e2b: ${e2bVersion}`);
  } else {
    console.log('[WARN] e2b not found in dependencies.');
  }

  // Check Zod
  const zodVersion = deps['zod'] || '';
  if (zodVersion) {
    console.log(`[INFO] zod: ${zodVersion}`);
  } else {
    console.log('[WARN] zod not found in dependencies.');
  }

  console.log('\nCompatibility Summary:');
  if (isNodeCompatible) {
    console.log('✅ System fully compatible with all sandbox providers.');
  } else {
    console.log(`⚠️  System compat limited. ${nodeWarning}`);
  }
}

checkCompatibility();
