import { checkApiCompatibility } from './api-compatibility.js';

function main() {
  const result = checkApiCompatibility();
  if (!result.compatible) {
    console.error('CRITICAL: API Breaking Change Detected!');
    console.error(result.warnings.join('\n'));
    process.exit(1);
  } else {
    console.log('API Compatibility Verified. No breaking changes found.');
    process.exit(0);
  }
}

main();
