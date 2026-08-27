import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gzipSync } from 'node:zlib';
import { strToU8, zipSync } from 'fflate';

import {
  extractSkillPackageForAudit,
  isSafeArchiveRelativePath,
  mergeSkillFilesForAuditPayload,
} from '../backend/src/services/skillPackageExtract';

function createTarBuffer(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    Buffer.from(name).copy(header, 0, 0, Math.min(name.length, 100));
    Buffer.from('0000644 ').copy(header, 100);
    Buffer.from('0000000 ').copy(header, 108);
    Buffer.from('0000000 ').copy(header, 116);
    const body = Buffer.from(content);
    const sizeOctal = body.length.toString(8).padStart(11, '0') + ' ';
    Buffer.from(sizeOctal).copy(header, 124);
    Buffer.from('00000000000 ').copy(header, 136);
    Buffer.from('        ').copy(header, 148);
    header[156] = 0x30;
    Buffer.from('ustar\x00').copy(header, 257);
    Buffer.from('00').copy(header, 263);
    chunks.push(header, body);
    const pad = 512 - (body.length % 512);
    if (pad < 512) {
      chunks.push(Buffer.alloc(pad));
    }
  }
  chunks.push(Buffer.alloc(512));
  return Buffer.concat(chunks);
}

describe('skillPackageExtract', () => {
  it('isSafeArchiveRelativePath rejects Zip Slip patterns', () => {
    expect(isSafeArchiveRelativePath('ok/readme.md')).toBe(true);
    expect(isSafeArchiveRelativePath('../evil')).toBe(false);
    expect(isSafeArchiveRelativePath('a/../../evil')).toBe(false);
    expect(isSafeArchiveRelativePath('/abs')).toBe(false);
  });

  it('extracts text files from a minimal zip', () => {
    const zipped = zipSync({
      'my-skill/SKILL.md': strToU8('# Title\n'),
      'my-skill/readme.md': strToU8('hello'),
    });
    const buf = Buffer.from(zipped);
    const { files, warnings } = extractSkillPackageForAudit(buf);
    expect(warnings.length).toBeGreaterThanOrEqual(0);
    expect(files.some((f: { relativePath: string }) => f.relativePath.endsWith('SKILL.md'))).toBe(
      true,
    );
    const merged = mergeSkillFilesForAuditPayload(files);
    expect(merged).toContain('--- path:');
    expect(merged).toContain('# Title');
  });

  it('extracts text files from a zip containing a nested tar.gz skill package', () => {
    const tar = createTarBuffer({
      'stock-anomaly-engine/SKILL.md': '# Stock anomaly\n',
      'stock-anomaly-engine/references/readme.md': 'details',
    });
    const tgz = gzipSync(tar);
    const zipped = zipSync({
      'stock-anomaly-engine.tar.gz': tgz,
      '__MACOSX/._stock-anomaly-engine.tar.gz': strToU8('ignored'),
    });
    const { files, warnings } = extractSkillPackageForAudit(Buffer.from(zipped));
    expect(files.some((f) => f.relativePath.endsWith('SKILL.md'))).toBe(true);
    expect(files.some((f) => f.relativePath.includes('references/readme.md'))).toBe(true);
    expect(warnings.some((w) => w.includes('Expanded nested archive layer'))).toBe(true);
  });

  it('extracts text files from the real stock-anomaly zip fixture', () => {
    const fixturePath = join(__dirname, '../docs/stock-anomaly-analysis-1.0.0.zip');
    const buf = readFileSync(fixturePath);
    const { files, warnings } = extractSkillPackageForAudit(buf);
    expect(files.some((f) => f.relativePath.endsWith('SKILL.md'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(warnings.some((w) => w.includes('Expanded nested archive layer'))).toBe(true);
  });
});
