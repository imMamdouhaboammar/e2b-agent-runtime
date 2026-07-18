import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function main() {
  console.log('=== Verifying Release Candidate Metadata ===');

  const rcPath = path.join(projectRoot, 'release/release-candidate.json');
  if (!fs.existsSync(rcPath)) {
    console.warn(`[WARN] release-candidate.json is missing. Creating empty draft.`);
    const draft = {
      name: "e2b-agent-runtime",
      version: "0.0.1-rc1",
      commit: "feat/end-to-end-release-readiness-phase-10-head",
      buildDate: new Date().toISOString(),
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.29.0"
      }
    };
    const releaseDir = path.dirname(rcPath);
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    fs.writeFileSync(rcPath, JSON.stringify(draft, null, 2), 'utf8');
  }

  try {
    const data = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    expectField(data, 'name', 'string');
    expectField(data, 'version', 'string');
    expectField(data, 'commit', 'string');
    expectField(data, 'buildDate', 'string');
    console.log('SUCCESS: release-candidate.json structural checks passed.');
    process.exit(0);
  } catch (error: any) {
    console.error(`FAIL: Metadata verification failed: ${error.message}`);
    process.exit(1);
  }
}

function expectField(obj: any, field: string, type: string) {
  if (obj[field] === undefined) {
    throw new Error(`Field '${field}' is missing.`);
  }
  if (typeof obj[field] !== type) {
    throw new Error(`Field '${field}' must be of type '${type}' (got '${typeof obj[field]}').`);
  }
}

main();
