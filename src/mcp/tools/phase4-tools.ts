import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SkillsRuntimeRegistry } from '../../runtime/skills-runtime.js';
import { TerminalSessionManager } from '../../terminal/terminal-manager.js';
import { CodingWorkspaceOrchestrator } from '../../workspace/workspace-orchestrator.js';

export function registerPhase4Tools(
  server: McpServer,
  services: {
    skillsRegistry: SkillsRuntimeRegistry;
    terminalManager: TerminalSessionManager;
    workspaceOrchestrator: CodingWorkspaceOrchestrator;
  }
) {
  const { skillsRegistry, terminalManager, workspaceOrchestrator } = services;

  // 1. agent_runtime_info (Read-only)
  server.tool(
    'agent_runtime_info',
    'Get runtime version, template version, skills pack version, and operating security mode.',
    {},
    async () => {
      const info = skillsRegistry.getRuntimeInfo();
      return {
        content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
      };
    }
  );

  // 2. agent_list_skills (Read-only)
  server.tool(
    'agent_list_skills',
    'List all available runtime skills with descriptions and content hashes.',
    {},
    async () => {
      const skills = skillsRegistry.listSkills();
      return {
        content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }],
      };
    }
  );

  // 3. agent_load_skill (Read-only)
  server.tool(
    'agent_load_skill',
    'Load full or bounded content of a specific runtime skill.',
    {
      skillName: z.string().describe('Name of the skill to load (e.g. tool-routing, pr-creation)'),
      maxBytes: z.number().optional().describe('Maximum bytes to load (default 32768)'),
    },
    async ({ skillName, maxBytes }) => {
      const loaded = skillsRegistry.loadSkill(skillName, maxBytes);
      return {
        content: [{ type: 'text', text: JSON.stringify(loaded, null, 2) }],
      };
    }
  );

  // 4. agent_get_workflow (Read-only)
  server.tool(
    'agent_get_workflow',
    'Get structured workflow definition by name.',
    {
      workflowName: z.string().describe('Name of the workflow (e.g. feature-to-pr, bug-fix-to-pr)'),
    },
    async ({ workflowName }) => {
      const workflow = skillsRegistry.getWorkflow(workflowName);
      return {
        content: [{ type: 'text', text: JSON.stringify(workflow, null, 2) }],
      };
    }
  );

  // 5. agent_get_operating_instructions (Read-only)
  server.tool(
    'agent_get_operating_instructions',
    'Get operating handbook instructions for the Worker Sandbox session.',
    {},
    async () => {
      const instructions = skillsRegistry.getOperatingInstructions();
      return {
        content: [{ type: 'text', text: JSON.stringify(instructions, null, 2) }],
      };
    }
  );

  // 6. coding_workspace_get (Read-only)
  server.tool(
    'coding_workspace_get',
    'Get detailed state of an active coding workspace.',
    {
      workspaceId: z.string().describe('Workspace ID'),
    },
    async ({ workspaceId }) => {
      const state = workspaceOrchestrator.getWorkspace(workspaceId);
      return {
        content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
      };
    }
  );

  // 7. terminal_read (Read-only)
  server.tool(
    'terminal_read',
    'Read incremental terminal output from PTY using cursor.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      terminalId: z.string().describe('Terminal ID'),
      cursor: z.number().optional().describe('Starting cursor offset'),
      maxBytes: z.number().optional().describe('Maximum bytes to read'),
    },
    async ({ workspaceId, terminalId, cursor, maxBytes }) => {
      const res = terminalManager.readTerminal(workspaceId, terminalId, cursor, maxBytes);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 8. terminal_list (Read-only)
  server.tool(
    'terminal_list',
    'List all active terminal sessions for a workspace.',
    {
      workspaceId: z.string().describe('Workspace ID'),
    },
    async ({ workspaceId }) => {
      const list = terminalManager.listTerminals(workspaceId);
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    }
  );

  // 9. workspace_list_ports (Read-only)
  server.tool(
    'workspace_list_ports',
    'Detect listening dev server ports and preview URLs inside the Worker Sandbox.',
    {
      workspaceId: z.string().describe('Workspace ID'),
    },
    async ({ workspaceId }) => {
      const ports = await workspaceOrchestrator.listPorts(workspaceId);
      return {
        content: [{ type: 'text', text: JSON.stringify(ports, null, 2) }],
      };
    }
  );

  // 10. coding_workspace_start (State-changing)
  server.tool(
    'coding_workspace_start',
    'Start a new temporary coding workspace with repo clone, feature branch, bootstrap, and optional PTY.',
    {
      repository: z.string().describe('GitHub repository owner/repo'),
      taskMode: z.enum(['feature', 'bugfix', 'issue', 'audit']).optional(),
      baseBranch: z.string().optional(),
      branchName: z.string().optional(),
      templateTag: z.string().optional(),
      initialTerminal: z.boolean().optional(),
      taskSummary: z.string().optional(),
    },
    async (params) => {
      const res = await workspaceOrchestrator.startWorkspace(params);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 11. terminal_open (State-changing)
  server.tool(
    'terminal_open',
    'Open a new persistent interactive PTY shell inside the Worker Sandbox.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      shell: z.string().optional(),
      cwd: z.string().optional(),
      cols: z.number().optional(),
      rows: z.number().optional(),
    },
    async ({ workspaceId, shell, cwd, cols, rows }) => {
      const ws = workspaceOrchestrator.getWorkspace(workspaceId);
      const res = await terminalManager.openTerminal(workspaceId, undefined as any, {
        shell,
        cwd,
        cols,
        rows,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 12. terminal_exec (State-changing)
  server.tool(
    'terminal_exec',
    'Run a deterministic one-shot command inside the Worker Sandbox.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      command: z.string().describe('Command line to run'),
      cwd: z.string().optional(),
      timeoutMs: z.number().optional(),
    },
    async ({ workspaceId, command, cwd, timeoutMs }) => {
      const ws = workspaceOrchestrator.getWorkspace(workspaceId);
      const res = await terminalManager.execCommand(workspaceId, undefined as any, {
        command,
        cwd,
        timeoutMs,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 13. terminal_write (State-changing)
  server.tool(
    'terminal_write',
    'Send input string or control characters to an active PTY.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      terminalId: z.string().describe('Terminal ID'),
      input: z.string().describe('Input string to send to PTY'),
    },
    async ({ workspaceId, terminalId, input }) => {
      const res = await terminalManager.writeTerminal(workspaceId, terminalId, input);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 14. terminal_resize (State-changing)
  server.tool(
    'terminal_resize',
    'Resize active PTY window dimensions.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      terminalId: z.string().describe('Terminal ID'),
      cols: z.number(),
      rows: z.number(),
    },
    async ({ workspaceId, terminalId, cols, rows }) => {
      const res = await terminalManager.resizeTerminal(workspaceId, terminalId, cols, rows);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 15. terminal_send_signal (State-changing)
  server.tool(
    'terminal_send_signal',
    'Send safe signal (SIGINT, SIGTERM, SIGHUP, SIGWINCH) to PTY process.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      terminalId: z.string().describe('Terminal ID'),
      signal: z.enum(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGWINCH']),
    },
    async ({ workspaceId, terminalId, signal }) => {
      const res = await terminalManager.sendSignal(workspaceId, terminalId, signal);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 16. terminal_close (State-changing)
  server.tool(
    'terminal_close',
    'Close active PTY session.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      terminalId: z.string().describe('Terminal ID'),
    },
    async ({ workspaceId, terminalId }) => {
      const res = await terminalManager.closeTerminal(workspaceId, terminalId);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 17. agent_create_checkpoint (State-changing)
  server.tool(
    'agent_create_checkpoint',
    'Save structured session checkpoint metadata.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      repository: z.string().optional(),
      baseBranch: z.string().optional(),
      baseSha: z.string().optional(),
      headSha: z.string().optional(),
      branch: z.string().optional(),
      taskScope: z.string().optional(),
      nextAction: z.string().optional(),
    },
    async (params) => {
      const res = skillsRegistry.createCheckpoint(params.workspaceId, params);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  // 18. coding_workspace_destroy (State-changing)
  server.tool(
    'coding_workspace_destroy',
    'Destroy active coding workspace and terminate all associated processes and sandboxes.',
    {
      workspaceId: z.string().describe('Workspace ID'),
      confirm: z.boolean().describe('Must set to true to confirm destruction'),
    },
    async ({ workspaceId, confirm }) => {
      const res = await workspaceOrchestrator.destroyWorkspace(workspaceId, confirm);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }
  );
}
