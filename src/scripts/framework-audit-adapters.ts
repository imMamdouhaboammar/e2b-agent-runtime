import { providerRegistry } from '../sandbox/providerRegistry.js';

function auditAdapters() {
  console.log('=== Sandbox Provider Adapter Audit ===');

  const registered = providerRegistry.listProviders();
  console.log(`Registered providers count: ${registered.length}`);

  for (const name of registered) {
    try {
      const provider = providerRegistry.getProvider(name);
      console.log(`[OK] Provider "${name}" registered successfully.`);
      console.log(`  - Class name: ${provider.constructor.name}`);
      console.log(`  - Capabilities:`);
      const caps = provider.getCapabilities();
      const enabledCaps = Object.entries(caps)
        .filter(([_, enabled]) => enabled)
        .map(([cap]) => cap);
      console.log(`    Enabled: ${enabledCaps.join(', ')}`);
    } catch (err: any) {
      console.log(`[FAIL] Provider "${name}" failed audit: ${err.message}`);
    }
  }
}

auditAdapters();
