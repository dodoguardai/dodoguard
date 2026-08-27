import * as fs from 'fs';
import * as path from 'path';

import chalk from 'chalk';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { getDefaultScanTemplate } from './buildRunnerConfig';
import { executeScanRun, executeStoredScanRun } from './executeScanRun';
import { loadScanTaskConfig, validateScanTaskConfig } from './loadScanConfig';
import {
  createScanRun,
  deleteScanRun,
  getScanResults,
  getScanRun,
  listScanRuns,
} from './localScanStore';
import type { Command } from 'commander';

export function scanCommand(program: Command): void {
  const scan = program
    .command('scan')
    .description('Run local security scans from YAML/JSON task configs');

  scan
    .command('init')
    .description('Generate a sample scan task configuration file')
    .option('-o, --output <path>', 'Output file path', 'scan-task.yaml')
    .action(async (opts: { output: string }) => {
      telemetry.record('command_used', { name: 'scan init' });
      const outPath = path.resolve(opts.output);
      if (fs.existsSync(outPath)) {
        logger.error(`File already exists: ${outPath}`);
        process.exitCode = 1;
        return;
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, getDefaultScanTemplate(), 'utf8');
      logger.info(chalk.green(`Created scan task template: ${outPath}`));
      logger.info(chalk.gray('Edit the file, then run: dodoguard scan run -c ' + opts.output));
    });

  scan
    .command('validate')
    .description('Validate a scan task configuration file')
    .requiredOption('-c, --config <path>', 'Path to scan task YAML/JSON')
    .action(async (opts: { config: string }) => {
      telemetry.record('command_used', { name: 'scan validate' });
      const result = await validateScanTaskConfig(opts.config);
      if (!result.valid) {
        logger.error(chalk.red('Configuration is invalid:'));
        for (const err of result.errors ?? []) {
          logger.error(`  ${err}`);
        }
        process.exitCode = 1;
        return;
      }
      logger.info(chalk.green('Configuration is valid'));
      logger.info(chalk.gray(`Task name: ${result.task?.name}`));
    });

  scan
    .command('create')
    .description('Create a local scan task from YAML/JSON without executing it')
    .requiredOption('-c, --config <path>', 'Path to scan task or dify-pentest YAML/JSON')
    .option('--json', 'Print created run manifest as JSON')
    .action(async (opts: { config: string; json?: boolean }) => {
      telemetry.record('command_used', { name: 'scan create' });
      try {
        const validation = await validateScanTaskConfig(opts.config);
        if (!validation.valid) {
          logger.error(chalk.red('Configuration is invalid:'));
          for (const err of validation.errors ?? []) {
            logger.error(`  ${err}`);
          }
          process.exitCode = 1;
          return;
        }

        const resolvedConfigPath = path.resolve(opts.config);
        const { task } = loadScanTaskConfig(resolvedConfigPath);
        const manifest = createScanRun(task, {
          configPath: resolvedConfigPath,
        });
        if (opts.json) {
          logger.info(JSON.stringify(manifest, null, 2));
          return;
        }
        logger.info(chalk.green(`Created local scan task: ${manifest.id}`));
        logger.info(chalk.gray(`Run it with: dodoguard scan run ${manifest.id}`));
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  scan
    .command('run')
    .description('Execute a scan task locally (no HTTP API required)')
    .argument('[runId]', 'Existing local scan run ID created by scan create')
    .option('-c, --config <path>', 'Path to scan task or dify-pentest YAML/JSON')
    .option('-o, --output <path>', 'Path for scan results output')
    .option('-j, --max-concurrency <number>', 'Max concurrent requests', (v) =>
      Number.parseInt(v, 10),
    )
    .option('--delay <ms>', 'Delay between requests in ms', (v) => Number.parseInt(v, 10))
    .option('--no-progress-bar', 'Disable progress bar')
    .option('--json', 'Print run manifest as JSON on success')
    .option('--fail-on-error', 'Exit with code 1 if scan fails')
    .action(
      async (
        runId: string | undefined,
        opts: {
          config?: string;
          output?: string;
          maxConcurrency?: number;
          delay?: number;
          progressBar?: boolean;
          json?: boolean;
          failOnError?: boolean;
        },
      ) => {
        telemetry.record('command_used', { name: 'scan run' });
        if (!opts.config && !runId) {
          logger.error('Either --config <path> or <runId> is required');
          process.exitCode = 1;
          return;
        }
        try {
          const result = opts.config
            ? await executeScanRun({
                configPath: opts.config,
                outputPath: opts.output,
                maxConcurrency: opts.maxConcurrency,
                delayMs: opts.delay,
                noProgressBar: opts.progressBar === false,
              })
            : await executeStoredScanRun(runId as string, {
                outputPath: opts.output,
                maxConcurrency: opts.maxConcurrency,
                delayMs: opts.delay,
                noProgressBar: opts.progressBar === false,
              });

          if (opts.json) {
            logger.info(JSON.stringify(result.manifest, null, 2));
          }

          if (!result.success || (opts.failOnError && result.manifest.status === 'failed')) {
            process.exitCode = 1;
          }
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      },
    );

  scan
    .command('list')
    .description('List local scan runs')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      telemetry.record('command_used', { name: 'scan list' });
      const runs = listScanRuns();
      if (!runs.length) {
        logger.info('No local scan runs found');
        return;
      }
      if (opts.json) {
        logger.info(JSON.stringify(runs, null, 2));
        return;
      }
      for (const run of runs) {
        logger.info(`${chalk.bold(run.id)} | ${run.name} | ${run.status} | ${run.createdAt}`);
      }
    });

  scan
    .command('get')
    .description('Show details of a local scan run')
    .argument('<runId>', 'Scan run ID')
    .option('--json', 'Output as JSON')
    .action(async (runId: string, opts: { json?: boolean }) => {
      telemetry.record('command_used', { name: 'scan get' });
      try {
        const manifest = getScanRun(runId);
        if (opts.json) {
          logger.info(JSON.stringify(manifest, null, 2));
        } else {
          logger.info(chalk.bold(`Run: ${manifest.id}`));
          logger.info(`Name: ${manifest.name}`);
          logger.info(`Status: ${manifest.status}`);
          logger.info(`Created: ${manifest.createdAt}`);
          if (manifest.outputPath) {
            logger.info(`Output: ${manifest.outputPath}`);
          }
          if (manifest.error) {
            logger.info(chalk.red(`Error: ${manifest.error}`));
          }
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  scan
    .command('results')
    .description('Show results of a local scan run')
    .argument('<runId>', 'Scan run ID')
    .option('--json', 'Output as JSON (default)')
    .action(async (runId: string, _opts: { json?: boolean }) => {
      telemetry.record('command_used', { name: 'scan results' });
      try {
        const results = getScanResults(runId);
        if (!results) {
          logger.error(`No results found for run: ${runId}`);
          process.exitCode = 1;
          return;
        }
        logger.info(JSON.stringify(results, null, 2));
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  scan
    .command('delete')
    .description('Delete a local scan run and its stored results')
    .argument('<runId>', 'Scan run ID')
    .action(async (runId: string) => {
      telemetry.record('command_used', { name: 'scan delete' });
      const deleted = deleteScanRun(runId);
      if (!deleted) {
        logger.error(`Scan run not found: ${runId}`);
        process.exitCode = 1;
        return;
      }
      logger.info(chalk.green(`Deleted scan run: ${runId}`));
    });
}
