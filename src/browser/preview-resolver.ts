import { ControllerError } from '../shared/errors.js';
import type { PreviewRecord } from './types.js';
import type { SessionRegistry } from '../runtime/session-registry.js';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import { logger } from '../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class PreviewResolver {
  private previews = new Map<string, PreviewRecord>();

  constructor(
    private registry: SessionRegistry,
    private workerManager: E2BWorkerManager
  ) {}

  public async resolvePreview(params: {
    workspaceId: string;
    port: number;
    protocol?: string;
    external?: boolean;
    processId?: string;
  }): Promise<PreviewRecord> {
    const { workspaceId, port, protocol = 'http', external = false, processId } = params;

    if (!port || port < 1 || port > 65535) {
      throw new ControllerError('PREVIEW_PORT_NOT_ALLOWED', `Invalid port number: ${port}`, 400);
    }

    const session = await this.registry.getSession(workspaceId);
    if (!session) {
      throw new ControllerError('PREVIEW_NOT_FOUND', `Workspace session "${workspaceId}" not found.`, 404);
    }

    const internalUrl = `${protocol}://127.0.0.1:${port}`;
    let externalHost: string | undefined;
    let externalUrl: string | undefined;
    let accessMode: 'internal-only' | 'external-public' | 'external-restricted' = 'internal-only';

    if (external) {
      try {
        const workerHandle: any = this.workerManager.getWorker(workspaceId);
        if (workerHandle && workerHandle.sandbox && typeof workerHandle.sandbox.getHost === 'function') {
          externalHost = workerHandle.sandbox.getHost(port);
          externalUrl = `${protocol}://${externalHost}`;
          accessMode = 'external-restricted';
        }
      } catch (err) {
        logger.warn('preview.external_host_resolution_failed', { workspaceId, port, error: String(err) });
      }
    }

    const existingKey = `${workspaceId}:${port}`;
    const previewId = `prev_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

    const record: PreviewRecord = {
      previewId,
      workspaceId,
      port,
      protocol,
      internalUrl,
      externalHost,
      externalUrl,
      accessMode,
      processId,
      createdAt: new Date().toISOString(),
    };

    this.previews.set(previewId, record);
    this.previews.set(existingKey, record);

    logger.info('preview.resolved', {
      previewId,
      workspaceId,
      port,
      accessMode,
      internalUrl,
      hasExternalHost: Boolean(externalHost),
    });

    return record;
  }

  public getPreview(previewId: string): PreviewRecord | undefined {
    return this.previews.get(previewId);
  }

  public getPreviewByPort(workspaceId: string, port: number): PreviewRecord | undefined {
    return this.previews.get(`${workspaceId}:${port}`);
  }

  public listPreviews(workspaceId: string): PreviewRecord[] {
    const list: PreviewRecord[] = [];
    for (const record of this.previews.values()) {
      if (record.workspaceId === workspaceId && !list.some((r) => r.previewId === record.previewId)) {
        list.push(record);
      }
    }
    return list;
  }

  public removePreviewsForWorkspace(workspaceId: string): void {
    for (const [key, record] of Array.from(this.previews.entries())) {
      if (record.workspaceId === workspaceId) {
        this.previews.delete(key);
      }
    }
  }
}
