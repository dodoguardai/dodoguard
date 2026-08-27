const path = require('node:path');
const { prepareBcryptNative } = require('./prepare-bcrypt-native.cjs');

/** @param {{ electronPlatformName: string, arch: string, appOutDir: string }} context */
module.exports = async function afterPack(context) {
  if (!['win32', 'darwin', 'linux'].includes(context.electronPlatformName) || context.arch !== 'x64') {
    return;
  }
  await prepareBcryptNative({
    targetPlatform: context.electronPlatformName,
    targetArch: context.arch,
    bindingDir: path.join(
      context.appOutDir,
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'bcrypt',
      'lib',
      'binding',
    ),
  });
};
