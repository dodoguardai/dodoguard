import { getDefaultPort } from '../constants';
import logger from '../logger';
import { BrowserBehavior, checkServerRunning } from '../util/server';
import { startServer } from './server';

function isDesktopEmbeddedChildProcess(): boolean {
  const v = process.env.DODOGUARD_DESKTOP_EMBEDDED;
  return v === '1' || v === 'true';
}

async function main() {
  const port = getDefaultPort();
  // Electron 内嵌子进程由壳进程独占端口；本机若另有同版本 dev server 占 15500，会误判为「已在运行」并 exit(1)
  if (!isDesktopEmbeddedChildProcess()) {
    const isRunning = await checkServerRunning(port);
    if (isRunning) {
      logger.info(`DodoGuard server already running at http://localhost:${port}`);
      process.exitCode = 1;
      return;
    }
  }
  await startServer(port, BrowserBehavior.SKIP);
}

main().catch((err) => {
  const detail = err instanceof Error ? `${err.stack || err.message}` : String(err);
  logger.error(`Failed to start server: ${detail}`);
  try {
    process.stderr.write(`\n[FATAL] DodoGuard server failed to start:\n${detail}\n`);
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
