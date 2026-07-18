import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMcpSnapshot } from './api-snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export function checkApiCompatibility(): {
  compatible: boolean;
  addedTools: string[];
  addedParams: string[];
  warnings: string[];
} {
  const snapshotPath = path.join(projectRoot, 'release/api-snapshots/mcp-schema-snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    return {
      compatible: false,
      addedTools: [],
      addedParams: [],
      warnings: [`Snapshot file does not exist at ${snapshotPath}. Please run pnpm api:snapshot first.`],
    };
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const current = generateMcpSnapshot();

  const addedTools: string[] = [];
  const addedParams: string[] = [];
  const warnings: string[] = [];
  let compatible = true;

  for (const [toolName, currentTool] of Object.entries(current)) {
    const snapTool = snapshot[toolName];
    if (!snapTool) {
      addedTools.push(toolName);
      continue;
    }

    // Compare parameters
    for (const [paramName, currentParam] of Object.entries((currentTool as any).parameters)) {
      const snapParam = snapTool.parameters[paramName];
      if (!snapParam) {
        if ((currentParam as any).required) {
          compatible = false;
          warnings.push(`Breaking: Tool '${toolName}' added a required parameter '${paramName}' which is missing from snapshot.`);
        } else {
          addedParams.push(`${toolName}.${paramName}`);
        }
        continue;
      }

      // Check type changes
      if ((currentParam as any).type !== snapParam.type) {
        compatible = false;
        warnings.push(`Breaking: Parameter '${toolName}.${paramName}' changed type from '${snapParam.type}' to '${(currentParam as any).type}'.`);
      }

      // Check requirement change: optional to required is breaking
      if ((currentParam as any).required && !snapParam.required) {
        compatible = false;
        warnings.push(`Breaking: Parameter '${toolName}.${paramName}' changed from optional to required.`);
      }
    }
  }

  return { compatible, addedTools, addedParams, warnings };
}

function main() {
  const result = checkApiCompatibility();
  console.log('--- API Compatibility Assessment ---');
  console.log(`Overall Compatibility: ${result.compatible ? 'PASSED (Backward Compatible)' : 'FAILED'}`);
  console.log(`Newly Added Tools: ${result.addedTools.length}`);
  if (result.addedTools.length > 0) {
    console.log(result.addedTools.map((t) => ` - [NEW] ${t}`).join('\n'));
  }
  console.log(`Newly Added Optional Parameters: ${result.addedParams.length}`);
  if (result.addedParams.length > 0) {
    console.log(result.addedParams.map((p) => ` - [PARAM] ${p}`).join('\n'));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings / Violations:');
    console.log(result.warnings.join('\n'));
    process.exit(result.compatible ? 0 : 1);
  } else {
    console.log('\nNo compatibility issues detected.');
    process.exit(0);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
