import {
  inferSkillAuditDimension,
  inferSourceFileFromLocation,
} from '../backend/src/services/skillsMdAuditDimensions';

describe('skillsMdAuditDimensions', () => {
  it('maps legacy A_secrets to credential_access', () => {
    expect(inferSkillAuditDimension({ category: 'A_secrets' })).toBe('credential_access');
  });

  it('accepts valid dimension from model', () => {
    expect(inferSkillAuditDimension({ category: 'x', dimension: 'network_abuse' })).toBe(
      'network_abuse',
    );
  });

  it('inferSourceFileFromLocation matches path substring', () => {
    const paths = ['pkg/foo.md'];
    expect(inferSourceFileFromLocation('see pkg/foo.md section 1', paths)).toBe('pkg/foo.md');
  });
});
