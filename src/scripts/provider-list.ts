import { loadSandboxProviderConfig } from '../sandbox/providerConfig.js';
import { providerRegistry } from '../sandbox/providerRegistry.js';

function run() {
  const config = loadSandboxProviderConfig();
  console.log('=== Registered Sandbox Providers ===');
  const list = providerRegistry.listProviders();
  for (const name of list) {
    const isSelected = name === config.provider;
    console.log(`- ${name}${isSelected ? ' (SELECTED DEFAULT)' : ''}`);
  }
  console.log(`Fallback strategy allowed: ${config.allowFallback}`);
}

run();
