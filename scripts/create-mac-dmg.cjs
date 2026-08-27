const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'release', 'mac', 'DodoGuard.app');
const outputPath = path.join(root, 'release', 'DodoGuard-0.119.0.dmg');
const frameworkPath = path.join(
  appPath,
  'Contents',
  'Frameworks',
  'Electron Framework.framework',
  'Versions',
  'A',
  'Electron Framework',
);

if (process.platform !== 'darwin') {
  throw new Error('create-mac-dmg.cjs must run on macOS');
}
if (!fs.existsSync(appPath) || !fs.existsSync(frameworkPath)) {
  throw new Error(`Incomplete macOS app bundle: ${frameworkPath}`);
}

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dodoguard-dmg-'));
try {
  execFileSync('ditto', [appPath, path.join(stagingDir, 'DodoGuard.app')], { stdio: 'inherit' });
  fs.symlinkSync('/Applications', path.join(stagingDir, 'Applications'));
  execFileSync(
    'hdiutil',
    [
      'create',
      '-volname',
      'DodoGuard 0.119.0',
      '-srcfolder',
      stagingDir,
      '-ov',
      '-format',
      'UDZO',
      outputPath,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Created complete macOS DMG: ${outputPath}`);
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
