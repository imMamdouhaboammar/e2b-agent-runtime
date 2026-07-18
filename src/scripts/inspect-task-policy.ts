import { loadWorkflowLimitsConfig } from '../config.js';

function main() {
  const limits = loadWorkflowLimitsConfig();
  console.log('Current Task Policy & Workflow Limits:');
  console.log(JSON.stringify(limits, null, 2));
}

main();
