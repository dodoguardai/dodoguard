const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'capability-audit');
const outputRoot = path.join(root, 'dist', 'capability-audit');

function collectTypeScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(filePath));
    } else if (
      entry.isFile() &&
      filePath.endsWith('.ts') &&
      !filePath.endsWith('.d.ts') &&
      !filePath.endsWith('.test.ts') &&
      !filePath.endsWith('.example.ts')
    ) {
      files.push(filePath);
    }
  }
  return files;
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Missing capability-audit source directory: ${sourceRoot}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const entryPoints = collectTypeScriptFiles(sourceRoot);
buildSync({
  entryPoints,
  outdir: outputRoot,
  outbase: sourceRoot,
  bundle: false,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
  logLevel: 'warning',
});

// The source tree imports backend/src. The packaged tree contains the same
// compiled files at dist/src, so adjust only those emitted runtime imports.
for (const filePath of collectJavaScriptFiles(outputRoot)) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rewritten = source.replace(/backend\/src\//g, 'src/');
  if (rewritten !== source) {
    fs.writeFileSync(filePath, rewritten, 'utf8');
  }
}

function collectJavaScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(filePath));
    } else if (entry.isFile() && filePath.endsWith('.js')) {
      files.push(filePath);
    }
  }
  return files;
}

// These two files are intentionally maintained as JavaScript in the shared
// audit package and are loaded by the backend through runtime require().
for (const fileName of ['dimensions.js', 'dimension-inference.js']) {
  fs.copyFileSync(
    path.join(sourceRoot, 'shared', fileName),
    path.join(outputRoot, 'shared', fileName),
  );
}

console.log(`Built capability-audit runtime (${entryPoints.length} TypeScript files).`);
