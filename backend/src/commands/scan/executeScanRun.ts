import * as fs from 'fs';
import * as path from 'path';

import chalk from 'chalk';
import {
  loadDifyPentestConfigFromFile,
  validateDifyPentestConfig,
} from '../../dify-pentest/configLoader';
import { doDifyPentestRun } from '../../dify-pentest/run';
import logger from '../../logger';
import { resolveRunnerConfigPath } from './buildRunnerConfig';
import { loadScanTaskConfig } from './loadScanConfig';
import {
  createScanRun,
  getScanRun,
  type ScanRunManifest,
  saveScanResults,
  updateScanRun,
} from './localScanStore';

export interface ExecuteScanRunOptions {
  configPath: string;
  outputPath?: string;
  maxConcurrency?: number;
  delayMs?: number;
  noProgressBar?: boolean;
  cwd?: string;
}

export interface ExecuteScanRunResult {
  manifest: ScanRunManifest;
  success: boolean;
  outputPath?: string;
}

async function loadAndValidateRunnerConfig(runnerConfigPath: string) {
  const liveDifyPentestConfig = await loadDifyPentestConfigFromFile(runnerConfigPath);
  const validation = validateDifyPentestConfig(liveDifyPentestConfig);
  if (!validation.valid) {
    throw new Error(`Invalid runner configuration:\n${validation.errors.join('\n')}`);
  }
  return liveDifyPentestConfig;
}

async function runManifest(
  manifest: ScanRunManifest,
  options: ExecuteScanRunOptions,
  runnerConfigPath: string,
  isTemporary: boolean,
): Promise<ExecuteScanRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const task = manifest.task;
  const outputPath =
    options.outputPath ||
    task.output?.path ||
    manifest.outputPath ||
    path.join('.dodoguard/scans', 'latest-results.json');

  manifest = updateScanRun(
    manifest.id,
    { status: 'running', startedAt: new Date().toISOString(), outputPath, runnerConfigPath },
    cwd,
  );

  logger.info(chalk.bold(`\nScan run started: ${manifest.id}`));
  logger.info(chalk.gray(`Task: ${task.name}`));
  logger.info(chalk.gray(`Runner config: ${runnerConfigPath}`));

  try {
    const liveDifyPentestConfig = await loadAndValidateRunnerConfig(runnerConfigPath);
    const resolvedOutput = path.isAbsolute(outputPath) ? outputPath : path.resolve(cwd, outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });

    const evalResult = await doDifyPentestRun({
      config: runnerConfigPath,
      output: resolvedOutput,
      maxConcurrency: options.maxConcurrency ?? task.execution?.maxConcurrency,
      delay: options.delayMs ?? task.execution?.delayMs,
      progressBar: options.noProgressBar ? false : undefined,
      liveDifyPentestConfig,
      taskRunId: manifest.id,
    });

    const stats = evalResult
      ? {
          total: evalResult.results?.length,
          passed: evalResult.results?.filter((r: { success?: boolean }) => r.success).length,
          failed: evalResult.results?.filter((r: { success?: boolean }) => !r.success).length,
        }
      : undefined;

    const resultsPayload = {
      runId: manifest.id,
      taskName: task.name,
      outputPath: resolvedOutput,
      stats,
      completedAt: new Date().toISOString(),
    };

    saveScanResults(manifest.id, resultsPayload, cwd);

    manifest = updateScanRun(
      manifest.id,
      {
        status: 'completed',
        completedAt: new Date().toISOString(),
        outputPath: resolvedOutput,
        stats,
      },
      cwd,
    );

    logger.info(chalk.green(`\nScan completed: ${manifest.id}`));
    logger.info(chalk.cyan(`Results: ${resolvedOutput}`));

    return { manifest, success: true, outputPath: resolvedOutput };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manifest = updateScanRun(
      manifest.id,
      {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: message,
      },
      cwd,
    );
    logger.error(chalk.red(`Scan failed: ${message}`));
    return { manifest, success: false };
  } finally {
    if (isTemporary && fs.existsSync(runnerConfigPath)) {
      try {
        fs.unlinkSync(runnerConfigPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export async function executeScanRun(
  options: ExecuteScanRunOptions,
): Promise<ExecuteScanRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const { task, configDir } = loadScanTaskConfig(options.configPath);
  const { configPath: runnerConfigPath, isTemporary } = resolveRunnerConfigPath(task, configDir);
  const manifest = createScanRun(task, {
    configPath: path.resolve(options.configPath),
    runnerConfigPath,
    cwd,
  });

  return runManifest(manifest, options, runnerConfigPath, isTemporary);
}

export async function executeStoredScanRun(
  runId: string,
  options: Omit<ExecuteScanRunOptions, 'configPath'>,
): Promise<ExecuteScanRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const manifest = getScanRun(runId, cwd);
  const configDir = manifest.configPath ? path.dirname(manifest.configPath) : cwd;
  const { configPath: runnerConfigPath, isTemporary } = resolveRunnerConfigPath(
    manifest.task,
    configDir,
  );

  return runManifest(
    manifest,
    {
      ...options,
      configPath: manifest.configPath ?? '',
    },
    runnerConfigPath,
    isTemporary,
  );
}
