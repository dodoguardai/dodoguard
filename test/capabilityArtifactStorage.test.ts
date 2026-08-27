import { strToU8, zipSync } from 'fflate';

import { parseCapabilityZipBuffer } from '../backend/src/services/capabilityArtifactStorage';

describe('capabilityArtifactStorage', () => {
  it('infers skill metadata from ClawHub-style _meta.json and SKILL.md frontmatter', () => {
    const zipped = zipSync({
      'prd-skill/SKILL.md': strToU8(
        [
          '---',
          'name: Frontmatter Name',
          'description: Frontmatter description',
          '---',
          '# Markdown Title',
          '',
          'Markdown description',
        ].join('\n'),
      ),
      'prd-skill/_meta.json': strToU8(
        JSON.stringify({
          name: 'Production Skill',
          slug: 'org/production-skill',
          version: '1.0.1',
          description: 'Meta description',
        }),
      ),
    });

    const parsed = parseCapabilityZipBuffer(Buffer.from(zipped), 'prd-skill-1.0.1.zip');

    expect(parsed.inferredName).toBe('Production Skill');
    expect(parsed.inferredKey).toBe('org/production-skill');
    expect(parsed.inferredVersion).toBe('1.0.1');
    expect(parsed.inferredDescription).toBe('Meta description');
    expect(parsed.fileTree.some((item) => item.path.endsWith('_meta.json'))).toBe(true);
  });
});
