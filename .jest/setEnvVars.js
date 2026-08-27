'use strict';

/** Runs before any test modules (see `jest.config.ts` `setupFiles`). */
const os = require('node:os');
const path = require('node:path');

const TEST_CONFIG_DIR = path.join(os.tmpdir(), `dodoguard-jest-${process.pid}`);

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DODOGUARD_CONFIG_DIR = TEST_CONFIG_DIR;

module.exports = { TEST_CONFIG_DIR };
