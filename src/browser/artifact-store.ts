import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { ControllerError } from '../shared/errors.js';
import type { ArtifactMetadata } from './types.js';
import type { BrowserConfig } from '../config.ts';
import { logger } from '../shared/logger.js';

type ArtifactType = 'screenshot' | 'trace' | 'console-summary' | 'network-summary' | 'accessibility-report' | 'cycle-report';

interface SaveParams {
  workspaceId: string;
  taskId?: string;
  browserSessionId: string;
  artifactType: ArtifactType;
  buffer: Buffer;
  extension: string;
  sourceHeadSha?: string;
  sensitive?: boolean;
  customDirectory?: string;
}

export class ArtifactStore {
  private artifacts = new Map<string, ArtifactMetadata>();

  constructor(private config: BrowserConfig) {}

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private writeArtifactToDisk(params: { baseDir: string; filename: string; buffer: Buffer }): string {
    this.ensureDir(params.baseDir);
    const filePath = path.join(params.baseDir, params.filename);
    fs.writeFileSync(filePath, params.buffer);
    return filePath;
  }

  private buildArtifactMetadata(params: {
    artifactId: string;
    workspaceId: string;
    taskId: string | undefined;
    browserSessionId: string;
    artifactType: ArtifactType;
    filename: string;
    filePath: string;
    buffer: Buffer;
    sourceHeadSha: string;
    sensitive: boolean;
  }): ArtifactMetadata {
    return {
      artifactId: params.artifactId,
      workspaceId: params.workspaceId,
      taskId: params.taskId,
      browserSessionId: params.browserSessionId,
      artifactType: params.artifactType,
      filename: params.filename,
      filePath: params.filePath,
      sizeBytes: params.buffer.byteLength,
      sha256: crypto.createHash('sha256').update(params.buffer).digest('hex'),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.config.artifactRetentionMs).toISOString(),
      sourceHeadSha: params.sourceHeadSha,
      sensitive: params.sensitive,
      retrievalState: 'available',
    };
  }

  public async saveArtifact(params: SaveParams): Promise<ArtifactMetadata> {
    const { workspaceId, taskId, browserSessionId, artifactType, buffer, extension, sourceHeadSha = '', sensitive = false, customDirectory } = params;

    if (buffer.byteLength > this.config.artifactTotalMaxBytes) {
      throw new ControllerError(
        'ARTIFACT_TOO_LARGE',
        `Artifact size (${buffer.byteLength} bytes) exceeds total maximum limit (${this.config.artifactTotalMaxBytes} bytes).`,
        400
      );
    }

    const artifactId = `art_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const filename = `${artifactType}_${artifactId}.${extension.replace(/^\./, '')}`;
    const baseDir = customDirectory || path.join(process.cwd(), '.data', 'artifacts', workspaceId);

    const filePath = this.writeArtifactToDisk({ baseDir, filename, buffer });
    const metadata = this.buildArtifactMetadata({ artifactId, workspaceId, taskId, browserSessionId, artifactType, filename, filePath, buffer, sourceHeadSha, sensitive });

    this.artifacts.set(artifactId, metadata);
    logger.info('browser.artifact.created', { artifactId, workspaceId, artifactType, filename, sizeBytes: buffer.byteLength });

    return metadata;
  }

  public getMetadata(artifactId: string): ArtifactMetadata {
    const meta = this.artifacts.get(artifactId);
    if (!meta || meta.retrievalState !== 'available') {
      throw new ControllerError('ARTIFACT_NOT_FOUND', `Artifact "${artifactId}" not found or unavailable.`, 404);
    }

    if (new Date(meta.expiresAt).getTime() < Date.now()) {
      meta.retrievalState = 'expired';
      throw new ControllerError('ARTIFACT_EXPIRED', `Artifact "${artifactId}" has expired.`, 410);
    }

    return { ...meta };
  }

  public listArtifacts(workspaceId: string, taskId?: string): ArtifactMetadata[] {
    const now = Date.now();
    const list: ArtifactMetadata[] = [];

    for (const meta of this.artifacts.values()) {
      if (meta.workspaceId === workspaceId && (!taskId || meta.taskId === taskId)) {
        if (new Date(meta.expiresAt).getTime() < now) {
          meta.retrievalState = 'expired';
        }
        if (meta.retrievalState === 'available') {
          list.push({ ...meta });
        }
      }
    }

    return list;
  }

  public createDownloadUrl(artifactId: string): { artifactId: string; downloadUrl: string; expiresAt: string } {
    const meta = this.getMetadata(artifactId);
    const expiresAt = new Date(Date.now() + this.config.downloadUrlTtlMs).toISOString();
    const token = crypto.createHash('sha256').update(`${artifactId}:${expiresAt}:${meta.sha256}`).digest('hex').slice(0, 32);
    const downloadUrl = `/api/artifacts/${artifactId}/download?token=${token}&expires=${encodeURIComponent(expiresAt)}`;

    logger.info('browser.artifact.download_issued', { artifactId, expiresAt });
    return { artifactId, downloadUrl, expiresAt };
  }

  public deleteArtifact(artifactId: string, confirm = false): boolean {
    if (!confirm) {
      throw new ControllerError('INVALID_INPUT', 'Confirmation required (confirm: true) to delete artifact.', 400);
    }

    const meta = this.artifacts.get(artifactId);
    if (meta) {
      if (fs.existsSync(meta.filePath)) {
        fs.unlinkSync(meta.filePath);
      }
      meta.retrievalState = 'deleted';
      this.artifacts.delete(artifactId);
      logger.info('browser.artifact.deleted', { artifactId });
      return true;
    }
    return false;
  }
}
