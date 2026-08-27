import { sql } from 'drizzle-orm';
import { CasingCache } from 'drizzle-orm/casing';
import {
  sqlEffectiveAttackResultRisk,
  sqlFindingRecordRiskBucket,
  sqlVerdictIsVulnerable,
} from '../../backend/src/services/findingsRiskSql';

const dialectConfig = {
  casing: new CasingCache('default'),
  escapeName: (n: string) => `"${n}"`,
  escapeParam: (num: number) => `$${num}`,
  escapeString: (s: string) => `'${s.replace(/'/g, "''")}'`,
};

describe('findingsRiskSql', () => {
  it('mysql verdictIsVulnerable references JSON_EXTRACT and vulnerable', () => {
    const col = sql`attack_results.final_verdict`;
    const q = sql`SELECT ${sqlVerdictIsVulnerable(col, 'mysql')} AS v`.toQuery(dialectConfig);
    expect(q.sql).toContain('JSON_EXTRACT');
    expect(q.sql).toContain('$.vulnerable');
  });

  it('postgres verdictIsVulnerable references JSON operators', () => {
    const col = sql`attack_results.final_verdict`;
    const q = sql`SELECT ${sqlVerdictIsVulnerable(col, 'postgres')} AS v`.toQuery(dialectConfig);
    expect(q.sql).toContain('->>');
    expect(q.sql).toContain('vulnerable');
  });

  it('mysql effectiveAttackResultRisk references riskLevel and CASE', () => {
    const col = sql`final_verdict`;
    const q = sql`SELECT ${sqlEffectiveAttackResultRisk(col, 'mysql')} AS r`.toQuery(dialectConfig);
    expect(q.sql).toContain('$.riskLevel');
    expect(q.sql).toContain('CASE');
  });

  it('postgres effectiveAttackResultRisk references riskLevel and CASE', () => {
    const col = sql`final_verdict`;
    const q = sql`SELECT ${sqlEffectiveAttackResultRisk(col, 'postgres')} AS r`.toQuery(
      dialectConfig,
    );
    expect(q.sql).toContain('->>');
    expect(q.sql).toContain('riskLevel');
    expect(q.sql).toContain('CASE');
  });

  it('finding record risk bucket uses CASE and standard levels', () => {
    const col = sql`finding_records.severity`;
    const q = sql`SELECT ${sqlFindingRecordRiskBucket(col)} AS b`.toQuery(dialectConfig);
    expect(q.sql).toContain('CASE');
    expect(q.sql).toContain('critical');
    expect(q.sql).toContain('info');
  });
});
