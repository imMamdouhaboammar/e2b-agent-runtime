import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';

export interface RuntimeManifest {
  runtimeVersion: string;
  skillsPackVersion: string;
  workflowSchemaVersion: string;
  templateName: string;
  templateTag: string;
  mode: string;
  builtAt: string;
}

export interface SkillSummary {
  name: string;
  version: string;
  description: string;
  applicableTaskModes: string[];
  contentHash: string;
}

export interface LoadedSkill {
  name: string;
  content: string;
  contentHash: string;
  version: string;
  truncated: boolean;
}

export interface WorkflowDefinition {
  name: string;
  version: string;
  description: string;
  taskModes: string[];
  steps: string[];
  requiredGates: string[];
  prohibitedActions: string[];
}

const workflowSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  description: z.string(),
  taskModes: z.array(z.string()),
  steps: z.array(z.string()),
  requiredGates: z.array(z.string()),
  prohibitedActions: z.array(z.string()),
});

export class SkillsRuntimeRegistry {
  private runtimePackDir: string;
  private manifest: RuntimeManifest;

  constructor(runtimePackDir?: string) {
    this.runtimePackDir = runtimePackDir || path.resolve(process.cwd(), 'runtime-pack');
    this.manifest = this.loadManifest();
  }

  private loadManifest(): RuntimeManifest {
    const manifestPath = path.join(this.runtimePackDir, 'MANIFEST.json');
    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(raw);
    }
    return {
      runtimeVersion: '0.1.0',
      skillsPackVersion: '1.0.0',
      workflowSchemaVersion: '1',
      templateName: 'agent-coding-runtime-core',
      templateTag: 'v0.1.0',
      mode: 'pr-only',
      builtAt: new Date().toISOString(),
    };
  }

  public getRuntimeInfo() {
    return {
      runtimeVersion: this.manifest.runtimeVersion,
      skillsPackVersion: this.manifest.skillsPackVersion,
      workflowSchemaVersion: this.manifest.workflowSchemaVersion,
      templateName: this.manifest.templateName,
      templateTag: this.manifest.templateTag,
      mode: this.manifest.mode,
      availableTaskModes: ['feature', 'bugfix', 'issue', 'audit'],
      supportedTerminalFeatures: ['pty', 'interactive', 'resize', 'signals', 'cursors', 'one-shot'],
      securityMode: 'pr-only-no-direct-push',
      workspaceRoot: '/workspace/repository',
    };
  }

  public computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  public listSkills(): SkillSummary[] {
    const skillsDir = path.join(this.runtimePackDir, 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    const files = fs.readdirSync(skillsDir);
    const summaries: SkillSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const name = file.replace('.md', '').toLowerCase().replace(/_/g, '-');
      const filePath = path.join(skillsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const contentHash = this.computeHash(content);

      summaries.push({
        name,
        version: this.manifest.skillsPackVersion,
        description: content.split('\n')[0].replace(/^#\s*/, '') || name,
        applicableTaskModes: ['feature', 'bugfix', 'issue', 'audit'],
        contentHash,
      });
    }

    return summaries;
  }

  public loadSkill(skillName: string, maxBytes: number = 32768): LoadedSkill {
    if (!skillName || typeof skillName !== 'string') {
      throw new Error('INVALID_SKILL_NAME: Skill name must be a non-empty string.');
    }

    // Reject path traversal
    const sanitized = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!sanitized || sanitized !== skillName.toLowerCase().replace(/\.md$/, '').replace(/_/g, '-')) {
      throw new Error(`INVALID_SKILL_NAME: Path traversal or invalid characters detected in "${skillName}".`);
    }

    const skillsDir = path.join(this.runtimePackDir, 'skills');
    const targetFile = path.join(skillsDir, `${sanitized.toUpperCase().replace(/-/g, '_')}.md`);

    if (!fs.existsSync(targetFile)) {
      throw new Error(`SKILL_NOT_FOUND: Skill "${skillName}" does not exist in runtime pack.`);
    }

    const rawContent = fs.readFileSync(targetFile, 'utf8');
    const contentHash = this.computeHash(rawContent);

    let content = rawContent;
    let truncated = false;

    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      content = content.substring(0, maxBytes) + '\n... [Skill content truncated]';
      truncated = true;
    }

    return {
      name: sanitized,
      content,
      contentHash,
      version: this.manifest.skillsPackVersion,
      truncated,
    };
  }

  public getWorkflow(workflowName: string): WorkflowDefinition {
    const sanitized = workflowName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const workflowFile = path.join(this.runtimePackDir, 'workflows', `${sanitized}.yaml`);

    if (!fs.existsSync(workflowFile)) {
      throw new Error(`WORKFLOW_NOT_FOUND: Workflow "${workflowName}" does not exist.`);
    }

    const raw = fs.readFileSync(workflowFile, 'utf8');
    // Simple YAML parser for key-value lists
    const lines = raw.split('\n');
    let currentKey = '';
    const data: Record<string, any> = {
      name: '',
      version: '1',
      description: '',
      taskModes: [],
      steps: [],
      requiredGates: [],
      prohibitedActions: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (line.startsWith('  - ')) {
        const item = line.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, '');
        if (currentKey && Array.isArray(data[currentKey])) {
          data[currentKey].push(item);
        }
      } else if (line.includes(':')) {
        const [k, ...v] = line.split(':');
        currentKey = k.trim();
        const val = v.join(':').trim().replace(/^['"]|['"]$/g, '');
        if (val) {
          data[currentKey] = val;
        } else {
          data[currentKey] = [];
        }
      }
    }

    const parsed = workflowSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`INVALID_WORKFLOW_SCHEMA: Workflow "${workflowName}" is invalid: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  public getOperatingInstructions(): { instructions: string; hash: string } {
    const file = path.join(this.runtimePackDir, 'SYSTEM_INSTRUCTIONS.md');
    if (!fs.existsSync(file)) {
      return { instructions: 'Operating in PR-only mode.', hash: 'default' };
    }
    const instructions = fs.readFileSync(file, 'utf8');
    return {
      instructions,
      hash: this.computeHash(instructions),
    };
  }

  public createCheckpoint(workspaceId: string, data: Record<string, any>) {
    const checkpointPath = path.resolve(process.cwd(), '.data', 'checkpoints', `${workspaceId}.json`);
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sanitizedData = {
      workspaceId,
      repository: data.repository || 'unknown',
      baseBranch: data.baseBranch || 'main',
      baseSha: data.baseSha || '',
      headSha: data.headSha || '',
      branch: data.branch || '',
      taskScope: data.taskScope || '',
      inspectedPaths: data.inspectedPaths || [],
      decisions: data.decisions || [],
      commits: data.commits || [],
      validationSummary: data.validationSummary || {},
      nextAction: data.nextAction || '',
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(checkpointPath, JSON.stringify(sanitizedData, null, 2), 'utf8');
    return sanitizedData;
  }
}
