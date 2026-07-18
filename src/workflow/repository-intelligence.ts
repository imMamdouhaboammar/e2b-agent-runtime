import fs from 'node:fs';
import path from 'node:path';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { taskStore } from './task-store.js';
import { logger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';

export interface RepositoryIntelligenceReport {
  taskId: string;
  workspaceId: string;
  scannedAt: string;
  overview: {
    topLevelFiles: string[];
    topLevelDirectories: string[];
    primaryLanguages: string[];
    packageManager?: string;
    manifestsFound: string[];
    lockfilesFound: string[];
  };
  structure: {
    sourceDirectories: string[];
    testDirectories: string[];
    configFiles: string[];
    generatedDirectoriesExcluded: string[];
  };
  governance: {
    license?: string;
    contributing?: string;
    security?: string;
    governanceFiles: string[];
  };
  architecture: {
    architectureDocs: string[];
    readme?: string;
    designDoc?: string;
  };
  commands: {
    build?: string;
    lint?: string;
    typecheck?: string;
    test?: string;
    format?: string;
    package?: string;
  };
  tests: {
    frameworks: string[];
    testLocations: string[];
  };
  ci: {
    workflows: string[];
  };
  git: {
    currentBranch: string;
    currentHeadSha: string;
    baseBranch: string;
    isDirty: boolean;
  };
  risks: string[];
  evidencePaths: Record<string, string>;
}

export class RepositoryIntelligenceService {
  private storageDir: string;

  constructor(storageDir = '.data/intelligence') {
    this.storageDir = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  public async scan(
    taskId: string,
    depth = 2,
    includeGenerated = false,
    includeWorkflows = true
  ): Promise<RepositoryIntelligenceReport> {
    const task = await taskStore.getTask(taskId);
    if (!task) {
      throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);
    }

    logger.info('repository.intelligence.started', { taskId, workspaceId: task.workspaceId });

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) {
      throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);
    }

    const repoDir = worker.session.repoDir;

    // 1. Discover top-level contents via worker one-shot command
    const lsResult = await worker.execOneShot('ls -la', repoDir);
    const gitBranchResult = await worker.execOneShot('git branch --show-current', repoDir);
    const gitShaResult = await worker.execOneShot('git rev-parse HEAD', repoDir);
    const gitStatusResult = await worker.execOneShot('git status --porcelain', repoDir);

    const currentBranch = gitBranchResult.stdout.trim() || 'main';
    const currentHeadSha = gitShaResult.stdout.trim() || '';
    const isDirty = gitStatusResult.stdout.trim().length > 0;

    // Parse top level entries
    const lines = lsResult.stdout.split('\n');
    const topLevelFiles: string[] = [];
    const topLevelDirectories: string[] = [];
    const excludedGenerated: string[] = ['.git', 'node_modules', 'dist', 'build', '.cache', 'coverage', '.data'];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        const name = parts[parts.length - 1];
        if (name === '.' || name === '..') continue;
        const isDir = line.startsWith('d');
        if (isDir) {
          topLevelDirectories.push(name);
        } else {
          topLevelFiles.push(name);
        }
      }
    }

    // Manifests and Lockfiles
    const manifestsFound: string[] = [];
    const lockfilesFound: string[] = [];
    let packageManager = 'npm';

    if (topLevelFiles.includes('package.json')) manifestsFound.push('package.json');
    if (topLevelFiles.includes('Cargo.toml')) manifestsFound.push('Cargo.toml');
    if (topLevelFiles.includes('go.mod')) manifestsFound.push('go.mod');
    if (topLevelFiles.includes('pyproject.toml')) manifestsFound.push('pyproject.toml');

    if (topLevelFiles.includes('pnpm-lock.yaml')) {
      lockfilesFound.push('pnpm-lock.yaml');
      packageManager = 'pnpm';
    } else if (topLevelFiles.includes('yarn.lock')) {
      lockfilesFound.push('yarn.lock');
      packageManager = 'yarn';
    } else if (topLevelFiles.includes('package-lock.json')) {
      lockfilesFound.push('package-lock.json');
      packageManager = 'npm';
    } else if (topLevelFiles.includes('bun.lockb')) {
      lockfilesFound.push('bun.lockb');
      packageManager = 'bun';
    }

    // Inspect package.json scripts if present
    const commands: RepositoryIntelligenceReport['commands'] = {};
    if (topLevelFiles.includes('package.json')) {
      try {
        const pkgResult = await worker.execOneShot('cat package.json', repoDir);
        const pkg = JSON.parse(pkgResult.stdout);
        const scripts = pkg.scripts || {};
        if (scripts.build) commands.build = `${packageManager} run build`;
        if (scripts.lint) commands.lint = `${packageManager} run lint`;
        if (scripts.typecheck || scripts['type-check'])
          commands.typecheck = `${packageManager} run ${scripts.typecheck ? 'typecheck' : 'type-check'}`;
        if (scripts.test) commands.test = `${packageManager} test`;
        if (scripts.format) commands.format = `${packageManager} run format`;
      } catch (err: any) {
        logger.warn('Failed to parse package.json for commands', { error: err.message });
      }
    }

    // Discover source and test directories
    const sourceDirectories = topLevelDirectories.filter((d) =>
      ['src', 'lib', 'app', 'packages', 'core', 'cmd', 'pkg'].includes(d)
    );
    const testDirectories = topLevelDirectories.filter((d) =>
      ['test', 'tests', '__tests__', 'spec', 'specs'].includes(d)
    );

    // Discover Governance & Architecture files
    const governanceFiles = topLevelFiles.filter((f) =>
      ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'].includes(f.toUpperCase())
    );
    const architectureDocs = topLevelFiles.filter((f) =>
      ['README.md', 'ARCHITECTURE_MAP.md', 'DESIGN.md', 'ARCHITECTURE.md'].includes(f.toUpperCase())
    );

    // Discover CI workflows
    const workflows: string[] = [];
    if (includeWorkflows && topLevelDirectories.includes('.github')) {
      const wfResult = await worker.execOneShot('ls .github/workflows 2>/dev/null || true', repoDir);
      if (wfResult.stdout.trim()) {
        workflows.push(...wfResult.stdout.trim().split('\n').map((w: string) => `.github/workflows/${w}`));
      }
    }

    // Languages
    const primaryLanguages: string[] = [];
    if (topLevelFiles.includes('tsconfig.json') || topLevelFiles.some((f) => f.endsWith('.ts')))
      primaryLanguages.push('TypeScript');
    if (topLevelFiles.includes('package.json')) primaryLanguages.push('JavaScript');
    if (topLevelFiles.includes('Cargo.toml')) primaryLanguages.push('Rust');
    if (topLevelFiles.includes('go.mod')) primaryLanguages.push('Go');
    if (topLevelFiles.includes('pyproject.toml') || topLevelFiles.includes('requirements.txt'))
      primaryLanguages.push('Python');

    const report: RepositoryIntelligenceReport = {
      taskId,
      workspaceId: task.workspaceId,
      scannedAt: new Date().toISOString(),
      overview: {
        topLevelFiles,
        topLevelDirectories,
        primaryLanguages,
        packageManager,
        manifestsFound,
        lockfilesFound,
      },
      structure: {
        sourceDirectories,
        testDirectories,
        configFiles: topLevelFiles.filter((f) => f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml')),
        generatedDirectoriesExcluded: excludedGenerated,
      },
      governance: {
        license: topLevelFiles.find((f) => f.toUpperCase() === 'LICENSE'),
        contributing: topLevelFiles.find((f) => f.toUpperCase() === 'CONTRIBUTING.MD'),
        security: topLevelFiles.find((f) => f.toUpperCase() === 'SECURITY.MD'),
        governanceFiles,
      },
      architecture: {
        architectureDocs,
        readme: topLevelFiles.find((f) => f.toUpperCase() === 'README.MD'),
        designDoc: topLevelFiles.find((f) => f.toUpperCase() === 'DESIGN.MD'),
      },
      commands,
      tests: {
        frameworks: commands.test ? ['package-defined'] : [],
        testLocations: testDirectories,
      },
      ci: {
        workflows,
      },
      git: {
        currentBranch,
        currentHeadSha,
        baseBranch: 'main',
        isDirty,
      },
      risks: isDirty ? ['Working directory contains uncommitted changes before task execution'] : [],
      evidencePaths: {
        overview: 'ls -la',
        gitState: 'git status',
      },
    };

    // Save report to storage
    fs.writeFileSync(path.join(this.storageDir, `${taskId}.json`), JSON.stringify(report, null, 2), 'utf-8');

    // Update task state to DISCOVERING -> READY
    await taskStore.updateTask(taskId, (t) => {
      t.taskState = t.taskState === 'CREATED' ? 'DISCOVERING' : t.taskState;
      t.baseSha = t.baseSha || currentHeadSha;
      t.currentHeadSha = currentHeadSha;
      t.branchName = currentBranch;
      return t;
    });

    logger.info('repository.intelligence.completed', { taskId, manifests: manifestsFound, commands });
    return report;
  }

  public async getSection(taskId: string, section?: string): Promise<Record<string, any>> {
    const filePath = path.join(this.storageDir, `${taskId}.json`);
    if (!fs.existsSync(filePath)) {
      const task = await taskStore.getTask(taskId);
      if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);
      const report = await this.scan(taskId);
      return section && section in report ? { [section]: (report as any)[section] } : report;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const report: RepositoryIntelligenceReport = JSON.parse(content);
    if (section && section in report) {
      return { [section]: (report as any)[section] };
    }
    return report;
  }
}

export const repositoryIntelligence = new RepositoryIntelligenceService();
