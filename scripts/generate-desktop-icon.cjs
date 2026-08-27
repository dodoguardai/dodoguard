/* Generate a cross-platform desktop icon from the approved login dog mark. */
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'backend', 'assets', 'login-dog-icon.png');
const output = path.join(root, 'build', 'icon.png');
const size = 1024;
const radius = 190;

const roundedMask = Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="4" width="${size - 8}" height="${size - 8}" rx="${radius}" fill="#ffffff"/>
</svg>`);

async function main() {
  const mark = await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: mark }, { input: roundedMask, blend: 'dest-in' }])
    .png()
    .toFile(output);
  console.log(`Generated rounded desktop icon: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
