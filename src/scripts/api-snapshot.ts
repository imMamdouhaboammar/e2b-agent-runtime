import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControllerMcpServer } from '../mcp/create-server.js';
import type { E2BWorkerManager } from '../runtime/e2b-worker-manager.js';
import type { SessionRegistry } from '../runtime/session-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export function serializeZodType(v: any): { type: string; required: boolean; description?: string } {
  let typeName = v._def.typeName;
  let required = true;
  let description = v.description || v._def.description || undefined;

  if (typeName === 'ZodOptional') {
    required = false;
    v = v._def.innerType;
    typeName = v._def.typeName;
    if (!description) {
      description = v.description || v._def.description || undefined;
    }
  }

  let typeStr = 'unknown';
  if (typeName === 'ZodString') typeStr = 'string';
  else if (typeName === 'ZodNumber') typeStr = 'number';
  else if (typeName === 'ZodBoolean') typeStr = 'boolean';
  else if (typeName === 'ZodArray') typeStr = 'array';
  else if (typeName === 'ZodObject') typeStr = 'object';
  else if (typeName === 'ZodRecord') typeStr = 'object';

  return { type: typeStr, required, description };
}

export function generateMcpSnapshot(): Record<string, any> {
  // Mock WorkerManager and Registry to instantiate createControllerMcpServer
  const mockWorkerManager = {} as E2BWorkerManager;
  const mockRegistry = {
    listSessions: async () => [],
    getSession: async () => null,
  } as unknown as SessionRegistry;

  const server = createControllerMcpServer(mockWorkerManager, mockRegistry);
  const tools: Record<string, any> = {};

  const registeredTools = (server as any)._registeredTools || {};
  for (const [name, toolDef] of Object.entries(registeredTools)) {
    const parameters: Record<string, any> = {};
    const shape = (toolDef as any).inputSchema?.shape || {};

    for (const [paramName, paramVal] of Object.entries(shape)) {
      parameters[paramName] = serializeZodType(paramVal);
    }

    tools[name] = {
      name,
      description: (toolDef as any).description,
      parameters,
    };
  }

  return tools;
}

function main() {
  const snapshotDir = path.join(projectRoot, 'release/api-snapshots');
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, 'mcp-schema-snapshot.json');
  const snapshotData = generateMcpSnapshot();

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData, null, 2), 'utf8');
  console.log(`Successfully generated MCP schema snapshot containing ${Object.keys(snapshotData).length} tools at: ${snapshotPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
