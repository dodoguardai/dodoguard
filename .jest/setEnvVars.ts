import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Temp directory used by `jest.setup.ts` for config fixtures and teardown cleanup. */
export const TEST_CONFIG_DIR = join(tmpdir(), 'dodoguard-jest-test-config');
