# CLI Commands

**What this is:** CLI command implementations using Commander.js. Commands are registered in `src/main.ts`.

## 🎯 Command Structure

**Every command is a function that registers with Commander:**

```typescript
import type { Command } from 'commander';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util/index';

export function myCommand(program: Command) {
  program
    .command('mycommand')
    .description('Brief description of command')
    .option('-o, --output <path>', 'Output file path')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { output?: string; envPath?: string }) => {
      // 1. Setup environment (if needed)
      setupEnv(cmdObj.envPath);

      // 2. Track telemetry FIRST
      telemetry.record('command_used', {
        name: 'mycommand',
        // Include relevant metadata
      });

      // 3. Implement command logic
      try {
        // ... command implementation
        logger.info('Success message');
      } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
        return;
      }
    });
}
```

## Critical Patterns

### 1. Output: ALWAYS Use Logger

```typescript
// ✅ CORRECT - Use logger
logger.info('Output message');
logger.warn('Warning message');
logger.error('Error message');
logger.debug('Debug info');

// ❌ WRONG - NEVER use console
console.log('message'); // Don't do this
console.error('error'); // Don't do this
```

### 2. Telemetry: Track All Command Usage

```typescript
// ✅ Track at start of action
telemetry.record('command_used', {
  name: 'command_name',
  // Include relevant metadata for analytics
  numItems: items.length,
  configType: type,
});
```

### 3. Validation: Use Zod Schemas

```typescript
import { z } from 'zod';

const EmailSchema = z.string().email();

const parsedEmail = EmailSchema.safeParse(email);
if (!parsedEmail.success) {
  logger.error(`Invalid email: ${email}`);
  process.exitCode = 1;
  return;
}
// Use parsedEmail.data
```

### 4. Error Handling: Set Exit Code

```typescript
try {
  await doSomething();
} catch (error) {
  logger.error(`Operation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1; // ✅ Set exit code for CI/scripts
  return;
}
```

### 5. Subcommands: Nested Structure

```typescript
export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List resources');

  // Subcommand: dodoguard list evals
  listCommand
    .command('evals')
    .description('List evaluations')
    .option('-n <limit>', 'Number to display')
    .action(async (cmdObj) => {
      // ...
    });

  // Subcommand: dodoguard list prompts
  listCommand
    .command('prompts')
    .description('List prompts')
    .action(async (cmdObj) => {
      // ...
    });
}
```

## MCP Tools Pattern

**MCP tools use AbstractTool base class:**

```typescript
import { AbstractTool } from '../lib/baseTool';
import { z } from 'zod';
import type { ToolResult } from '../lib/types';

const ArgsSchema = z.object({
  configPath: z.string().optional(),
  provider: z.string().optional(),
});

export class MyTool extends AbstractTool {
  readonly name = 'my_tool';
  readonly description = 'Brief description of what this tool does';
  protected readonly schema = ArgsSchema;

  protected async execute(args: unknown): Promise<ToolResult> {
    const { configPath, provider } = args as z.infer<typeof ArgsSchema>;

    try {
      // Tool implementation
      const result = await doSomething();
      return this.success(result);
    } catch (error) {
      return this.error(
        `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
```

**Register MCP tool:**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerMyTool(server: McpServer) {
  const tool = new MyTool();
  tool.register(server);
}
```

See: `src/commands/mcp/lib/baseTool.ts` for AbstractTool implementation

## Directory Structure

```
src/commands/
├── eval.ts              # Main eval command
├── init.ts              # Project initialization
├── config.ts            # Config get/set/unset subcommands
├── list.ts              # List evals/prompts/datasets
├── generate/            # Dataset & assertion generation
│   ├── dataset.ts
│   └── assertions.ts
├── eval/                # Eval-specific utilities
│   ├── filterProviders.ts
│   └── filterTests.ts
└── mcp/                 # Model Context Protocol server
    ├── index.ts         # MCP command registration
    ├── server.ts        # MCP server implementation
    ├── tools/           # Individual MCP tools
    │   ├── runEvaluation.ts
    │   ├── generateTestCases.ts
    │   └── ...
    └── lib/             # MCP shared utilities
        ├── baseTool.ts  # AbstractTool base class
        ├── types.ts
        └── utils.ts
```

## Command Registration

**Commands are registered in `src/main.ts`:**

```typescript
// Import command function
import { myCommand } from './commands/mycommand';

// In main()
const program = new Command('dodoguard');

// Register command
myCommand(program);

// Common options added to all commands automatically
addCommonOptionsRecursively(program);
```

**Common options (auto-added):**

- `-v, --verbose` - Debug logging
- `--env-file, --env-path <path>` - Environment file

## Best Practices

### ✅ DO:

- Use `logger` for all output
- Track telemetry with `telemetry.record()`
- Validate inputs with Zod schemas
- Set `process.exitCode = 1` on errors
- Use `setupEnv()` for environment setup
- Handle async operations with try/catch
- Use Commander's `.option()` for flags
- Write clear descriptions for commands/options
- Return early on errors (don't throw)

### ❌ DON'T:

- Use `console.log()` or `console.error()`
- Throw errors in action handlers (set exitCode instead)
- Skip telemetry tracking
- Forget to validate user inputs
- Use `process.exit()` directly (use exitCode)
- Make network calls without error handling
- Write blocking synchronous code

## Common Utilities

**Import these frequently used utilities:**

```typescript
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv, printBorder } from '../util/index';
import { loadDefaultConfig } from '../util/config/default';
import { resolveConfigs } from '../util/config/load';
```

## Testing Commands Locally

```bash
# Link local package
npm link

# Run command
dodoguard mycommand --help

# Or use npm run local
npm run local -- mycommand --verbose
```

## MCP Server

**MCP (Model Context Protocol) server at `src/commands/mcp/`:**

- **Purpose:** Expose DodoGuard functionality as MCP tools for AI assistants
- **Transports:** HTTP (default port 3100) or stdio
- **Tools:** Each tool extends `AbstractTool` base class
- **Registration:** Tools registered in `server.ts`

**Start MCP server:**

```bash
# HTTP transport
dodoguard mcp --transport http --port 3100

# Stdio transport
dodoguard mcp --transport stdio
```

## Anti-Patterns

### ❌ Console output instead of logger

```typescript
// ❌ WRONG
console.log('Running eval...');

// ✅ CORRECT
logger.info('Running eval...');
```

### ❌ Throwing errors in action handler

```typescript
// ❌ WRONG
.action(async () => {
  throw new Error('Something failed'); // Process crashes
});

// ✅ CORRECT
.action(async () => {
  logger.error('Something failed');
  process.exitCode = 1;
  return;
});
```

### ❌ Missing telemetry

```typescript
// ❌ WRONG
.action(async () => {
  await doWork();
});

// ✅ CORRECT
.action(async () => {
  telemetry.record('command_used', { name: 'mycommand' });
  await doWork();
});
```

### ❌ Raw option types

```typescript
// ❌ WRONG
.action(async (cmdObj: any) => {
  const email = cmdObj.email; // No validation
});

// ✅ CORRECT
interface MyCommandOptions {
  email?: string;
  output?: string;
}

.action(async (cmdObj: MyCommandOptions) => {
  const EmailSchema = z.string().email();
  const parsed = EmailSchema.safeParse(cmdObj.email);
  if (!parsed.success) {
    logger.error('Invalid email');
    process.exitCode = 1;
    return;
  }
});
```

## Key Files Reference

- `src/main.ts` - Command registration and CLI entry point
- `src/commands/eval.ts` - Primary eval command (~900 lines)
- `src/commands/mcp/lib/baseTool.ts` - MCP tool base class
- `src/commands/config.ts` - Simple subcommand example
- `src/commands/list.ts` - Multiple subcommands example
