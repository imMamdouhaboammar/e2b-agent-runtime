import { providerRegistry } from '../sandbox/providerRegistry.js';
import type { SandboxCapability } from '../sandbox/contracts/sandboxCapabilities.js';

function run() {
  console.log('=== Sandbox Provider Capability Matrix ===');
  const providers = providerRegistry.listProviders();
  const matrices = providers.map((p) => ({
    name: p,
    caps: providerRegistry.getProvider(p).getCapabilities(),
  }));

  const allCaps: SandboxCapability[] = [
    'commandExecution',
    'backgroundCommands',
    'pty',
    'ptyInput',
    'ptyResize',
    'filesystemRead',
    'filesystemWrite',
    'filesystemDelete',
    'exposedPorts',
    'snapshots',
    'pause',
    'resume',
    'autoResume',
    'workspacePersistence',
    'manifestFiles',
    'manifestGitRepos',
    'ephemeralEnvironment',
    'archiveExport',
    'archiveImport',
  ];

  // Table header
  const header = 'Capability'.padEnd(25) + ' | ' + providers.map((p) => p.padEnd(18)).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const cap of allCaps) {
    const row =
      cap.padEnd(25) +
      ' | ' +
      matrices.map((m) => (m.caps[cap] ? 'YES' : 'NO').padEnd(18)).join(' | ');
    console.log(row);
  }
}

run();
