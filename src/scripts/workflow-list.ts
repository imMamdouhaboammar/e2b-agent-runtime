import fs from 'node:fs';
import path from 'node:path';

function main() {
  const workflowsDir = path.resolve(process.cwd(), 'runtime-pack/workflows');
  if (!fs.existsSync(workflowsDir)) {
    console.log('No workflows directory found.');
    return;
  }

  const files = fs.readdirSync(workflowsDir);
  console.log(`Available workflows (${files.length}):`);
  for (const f of files) {
    console.log(`  - ${f}`);
  }
}

main();
