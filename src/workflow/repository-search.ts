import path from 'node:path';
import { e2bWorkerManager } from '../runtime/e2b-worker-manager.js';
import { taskStore } from './task-store.js';
import { redactSecrets } from '../security/redact.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';


export interface SearchMatch {
  file: string;
  line: number;
  content: string;
  context?: string[];
}

export interface SearchResult {
  taskId: string;
  query: string;
  totalMatches: number;
  truncated: boolean;
  matches: SearchMatch[];
}

export interface FileMatch {
  path: string;
  name: string;
  extension: string;
  sizeBytes?: number;
}

export interface SymbolMatch {
  symbol: string;
  file: string;
  line: number;
  kind?: string;
  context: string;
  confidence: 'high' | 'medium' | 'low';
}

export class RepositorySearchService {
  public async search(
    taskId: string,
    query: string,
    paths: string[] = [],
    fileGlobs: string[] = [],
    maxResults = 100,
    contextLines = 2,
    caseSensitive = false,
    literal = true
  ): Promise<SearchResult> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    // Validate path traversal
    for (const p of paths) {
      if (p.includes('..') || p.startsWith('/')) {
        throw new AppError(`Path traversal outside repository is rejected: ${p}`, 'INVALID_PATH', 400);
      }
    }

    const repoDir = worker.session.repoDir;
    const flags: string[] = ['--line-number', '--no-heading', '--color=never'];

    if (!caseSensitive) flags.push('-i');
    if (literal) flags.push('-F');
    if (contextLines > 0) flags.push(`-C ${Math.min(contextLines, 5)}`);

    flags.push('--glob "!.git/*"');
    flags.push('--glob "!node_modules/*"');
    flags.push('--glob "!dist/*"');
    flags.push('--glob "!.data/*"');

    for (const g of fileGlobs) {
      flags.push(`--glob "${g}"`);
    }

    const searchPath = paths.length > 0 ? paths.join(' ') : '.';
    const safeQuery = query.replace(/"/g, '\\"');
    const cmd = `rg ${flags.join(' ')} "${safeQuery}" ${searchPath}`;

    const execResult = await worker.execOneShot(cmd, repoDir);
    logger.info('repository.search.executed', { taskId, query, exitCode: execResult.exitCode });

    const lines = execResult.stdout.split('\n').filter((l: string) => l.trim().length > 0);
    const matches: SearchMatch[] = [];
    let truncated = false;

    for (const line of lines) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }

      const parts = line.split(':');
      if (parts.length >= 3) {
        const file = parts[0];
        const lineNum = Number.parseInt(parts[1], 10);
        const content = parts.slice(2).join(':');

        if (!Number.isNaN(lineNum)) {
          matches.push({
            file,
            line: lineNum,
            content: redactSecrets(content),
          });
        }
      }
    }

    return {
      taskId,
      query,
      totalMatches: matches.length,
      truncated,
      matches,
    };
  }

  public async findFiles(
    taskId: string,
    namePattern?: string,
    pathPattern?: string,
    extensions: string[] = [],
    maxResults = 100
  ): Promise<{ taskId: string; files: FileMatch[]; total: number }> {
    const task = await taskStore.getTask(taskId);
    if (!task) throw new AppError(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);

    const worker = e2bWorkerManager.getWorker(task.workspaceId);
    if (!worker) throw new AppError(`Worker for workspace ${task.workspaceId} is not available`, 'WORKER_NOT_FOUND', 404);

    const repoDir = worker.session.repoDir;
    let cmd = `rg --files --glob "!.git/*" --glob "!node_modules/*" --glob "!dist/*" --glob "!.data/*"`;

    if (namePattern) {
      cmd += ` --glob "*${namePattern}*"`;
    }

    const execResult = await worker.execOneShot(cmd, repoDir);
    const rawFiles = execResult.stdout.split('\n').filter((f: string) => f.trim().length > 0);

    let filtered = rawFiles;
    if (pathPattern) {
      filtered = filtered.filter((f: string) => f.includes(pathPattern));
    }
    if (extensions.length > 0) {
      filtered = filtered.filter((f: string) => extensions.some((ext) => f.endsWith(ext.startsWith('.') ? ext : `.${ext}`)));
    }

    const files: FileMatch[] = filtered.slice(0, maxResults).map((f: string) => {
      const parsed = path.parse(f);
      return {
        path: f,
        name: parsed.name + parsed.ext,
        extension: parsed.ext.replace('.', ''),
      };
    });


    return {
      taskId,
      files,
      total: filtered.length,
    };
  }

  public async symbolSearch(
    taskId: string,
    symbol: string,
    language?: string,
    paths: string[] = [],
    maxResults = 50
  ): Promise<{ taskId: string; symbol: string; matches: SymbolMatch[] }> {
    // Regex search for function/class/interface/const/type definitions matching symbol
    const regexQuery = `(function|class|interface|type|const|let|var|def|struct|enum)\\s+${symbol}\\b`;
    const searchRes = await this.search(
      taskId,
      regexQuery,
      paths,
      [],
      maxResults,
      1,
      true,
      false
    );

    const matches: SymbolMatch[] = searchRes.matches.map((m) => {
      let kind = 'variable';
      if (m.content.includes('function') || m.content.includes('def')) kind = 'function';
      else if (m.content.includes('class')) kind = 'class';
      else if (m.content.includes('interface')) kind = 'interface';
      else if (m.content.includes('type')) kind = 'type';
      else if (m.content.includes('const')) kind = 'constant';

      const confidence: SymbolMatch['confidence'] = m.content.match(new RegExp(`\\b${symbol}\\b`)) ? 'high' : 'medium';

      return {
        symbol,
        file: m.file,
        line: m.line,
        kind,
        context: m.content,
        confidence,
      };
    });

    return {
      taskId,
      symbol,
      matches,
    };
  }
}

export const repositorySearch = new RepositorySearchService();
