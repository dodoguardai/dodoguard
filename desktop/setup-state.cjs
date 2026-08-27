const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'desktop-setup-state.json';
const MARKER_FILE = 'desktop-mysql-setup.done';
const ENV_FILE = '.env';

/**
 * @typedef {'A' | 'B'} SetupMode
 * @typedef {{
 *   version: number;
 *   mode: SetupMode;
 *   step: number;
 *   mysql?: { port: number; database: string };
 *   finishedAt?: string;
 * }} DesktopSetupState
 */

function getStatePath(userDataDir) {
  return path.join(userDataDir, STATE_FILE);
}

function getMarkerPath(userDataDir) {
  return path.join(userDataDir, MARKER_FILE);
}

function getEnvPath(userDataDir) {
  return path.join(userDataDir, ENV_FILE);
}

/** @returns {DesktopSetupState | null} */
function readState(userDataDir) {
  const p = getStatePath(userDataDir);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {DesktopSetupState} state */
function writeState(userDataDir, state) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(getStatePath(userDataDir), JSON.stringify(state, null, 2), 'utf8');
}

/** @param {Partial<DesktopSetupState>} patch */
function patchState(userDataDir, patch) {
  const prev = readState(userDataDir) || { version: 1, mode: 'B', step: 0 };
  writeState(userDataDir, { ...prev, ...patch });
}

function readMarker(userDataDir) {
  const p = getMarkerPath(userDataDir);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { mode: 'A' };
  }
}

function writeMarker(userDataDir, marker) {
  fs.writeFileSync(getMarkerPath(userDataDir), JSON.stringify(marker, null, 2), 'utf8');
}

/**
 * @param {string} userDataDir
 * @returns {boolean}
 */
function isSetupComplete(userDataDir) {
  if (!fs.existsSync(getEnvPath(userDataDir)) || !fs.existsSync(getMarkerPath(userDataDir))) {
    return false;
  }
  const state = readState(userDataDir);
  const marker = readMarker(userDataDir);
  if (marker?.mode === 'B' || state?.mode === 'B') {
    return (state?.step ?? 0) >= 3;
  }
  return true;
}

/**
 * @param {string} userDataDir
 * @returns {SetupMode}
 */
function getSetupMode(userDataDir) {
  const state = readState(userDataDir);
  if (state?.mode) {
    return state.mode;
  }
  const marker = readMarker(userDataDir);
  if (marker?.mode === 'B' || marker?.mode === 'A') {
    return marker.mode;
  }
  return 'A';
}

module.exports = {
  STATE_FILE,
  MARKER_FILE,
  ENV_FILE,
  getStatePath,
  getMarkerPath,
  getEnvPath,
  readState,
  writeState,
  patchState,
  readMarker,
  writeMarker,
  isSetupComplete,
  getSetupMode,
};
