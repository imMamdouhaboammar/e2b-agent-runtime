import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReleaseReadinessEvaluator } from '../../security/releaseReadinessEvaluator.js';

export function registerPhase10Tools(server: McpServer) {
  const evaluator = new ReleaseReadinessEvaluator();

  // 1. runtime_release_readiness (read-only)
  server.tool(
    'runtime_release_readiness',
    'Retrieve the honest release readiness state, evaluated commits, passed/failed release gates, and verified telemetry details',
    {},
    async () => {
      const evaluation = await evaluator.evaluate();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(evaluation, null, 2),
          },
        ],
      };
    }
  );
}
