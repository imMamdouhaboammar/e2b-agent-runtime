export type SandboxCapability =
  | 'commandExecution'
  | 'backgroundCommands'
  | 'pty'
  | 'ptyInput'
  | 'ptyResize'
  | 'filesystemRead'
  | 'filesystemWrite'
  | 'filesystemDelete'
  | 'exposedPorts'
  | 'snapshots'
  | 'pause'
  | 'resume'
  | 'autoResume'
  | 'workspacePersistence'
  | 'manifestFiles'
  | 'manifestGitRepos'
  | 'ephemeralEnvironment'
  | 'archiveExport'
  | 'archiveImport';

export type CapabilityMatrix = Record<SandboxCapability, boolean>;
