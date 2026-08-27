import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadDefaultConfig } from '../../util/config/default';

/**
 * Register MCP resources with the server
 */
export function registerResources(server: McpServer) {
  // Resources with proper namespacing
  server.resource('dodoguard-config', 'dodoguard://config/default', async () => {
    try {
      const { defaultConfig } = await loadDefaultConfig();
      return {
        contents: [
          {
            uri: 'dodoguard://config/default',
            text: JSON.stringify(defaultConfig, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: 'dodoguard://config/default',
            text: JSON.stringify(
              {
                error: `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  });

  server.resource('dodoguard-docs', 'dodoguard://docs/tools', async () => {
    const toolDocs = {
      tools: [
        {
          name: 'list_evaluations',
          description: 'List all evals, optionally filtered by dataset ID',
          parameters: 'datasetId?: string',
        },
        {
          name: 'get_evaluation_details',
          description: 'Get detailed eval results by ID',
          parameters: 'id: string (required)',
        },
        {
          name: 'validate_dodoguard_config',
          description: 'Validate DodoGuard configuration files using same logic as CLI validate',
          parameters: 'configPaths?: string[] (defaults to DodoGuardconfig.yaml)',
        },
        {
          name: 'test_provider',
          description: 'Test provider connectivity and response quality with timeout support',
          parameters:
            'provider: string | object (required), testPrompt?: string, timeoutMs?: number (1000-300000)',
        },
        {
          name: 'run_assertion',
          description: 'Run an assertion against an LLM output to test grading logic',
          parameters:
            'output: string, assertion: object, prompt?: string, vars?: object, latencyMs?: number',
        },
        {
          name: 'run_evaluation',
          description: 'Run an eval from a DodoGuard config with optional test case filtering',
          parameters:
            'configPath?: string, testCaseIndices?: number | number[] | {start: number, end: number}, promptFilter?: string | string[], providerFilter?: string | string[], maxConcurrency?: number, timeoutMs?: number',
        },
        {
          name: 'share_evaluation',
          description: 'Share an eval to create a publicly accessible URL',
          parameters: 'evalId?: string, showAuth?: boolean, overwrite?: boolean',
        },
      ],
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
    };

    return {
      contents: [
        {
          uri: 'dodoguard://docs/tools',
          text: JSON.stringify(toolDocs, null, 2),
        },
      ],
    };
  });
}
