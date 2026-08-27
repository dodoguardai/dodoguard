-- Sync a small curated subset of legacy vulnerabilities into technical security cases.
--
-- Scope requested for local development/testing:
--   - Tencent ADP: 20 cases
--   - Dify: 20 cases
--
-- Notes:
--   - MySQL only.
--   - Idempotent: repeated execution updates the same library keys and case codes.
--   - Does not delete or modify manually created case libraries/test cases.
--   - Tencent ADP follows the existing frontend temporary rule:
--       verification_mode = 'api_blackbox' and vulnerability created before 2026-03-30.

SET NAMES utf8mb4;

INSERT INTO security_case_libraries (
  id,
  organization_id,
  library_key,
  title,
  domain,
  description,
  case_count,
  enabled,
  default_level,
  detect_method,
  status,
  standards,
  metadata,
  created_at,
  updated_at
)
SELECT
  UUID(),
  org.id,
  preset.library_key,
  preset.title,
  preset.domain,
  preset.description,
  0,
  TRUE,
  preset.default_level,
  '旧漏洞库攻击指令 + LLM 复核',
  'published',
  JSON_ARRAY('OWASP LLM Top 10', 'DodoGuard Legacy Vulnerability Library'),
  JSON_OBJECT(
    'libraryCategory', 'technical',
    'source', 'legacy-vulnerabilities',
    'syncLimit', 20,
    'syncScript', 'scripts/sync-legacy-vulnerabilities-to-security-cases.sql',
    'surface', preset.surface
  ),
  NOW(),
  NOW()
FROM organizations AS org
CROSS JOIN (
  SELECT
    'tencent-adp' AS surface,
    'legacy-vuln-tencent-adp-20' AS library_key,
    '腾讯 ADP 技术安全用例库' AS title,
    '腾讯 ADP' AS domain,
    '从老版本漏洞库同步的腾讯 ADP 候选技术安全检测用例，按 api_blackbox 历史规则选取 20 条用于开发测试。' AS description,
    'high' AS default_level
  UNION ALL
  SELECT
    'dify',
    'legacy-vuln-dify-20',
    'Dify 技术安全用例库',
    'Dify',
    '从老版本漏洞库同步的 Dify 技术安全检测用例，覆盖 API、配置、知识库、工具调用与输出安全等场景。',
    'high'
) AS preset
WHERE TRUE
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  domain = VALUES(domain),
  description = VALUES(description),
  enabled = TRUE,
  default_level = VALUES(default_level),
  detect_method = VALUES(detect_method),
  status = 'published',
  standards = VALUES(standards),
  metadata = VALUES(metadata),
  deleted_at = NULL,
  updated_at = NOW();

UPDATE security_test_cases AS tc
JOIN security_case_libraries AS lib
  ON lib.id = tc.library_id
SET
  tc.deleted_at = NOW(),
  tc.updated_at = NOW()
WHERE lib.library_key IN ('legacy-vuln-tencent-adp-20', 'legacy-vuln-dify-20')
  AND lib.deleted_at IS NULL;

INSERT INTO security_test_cases (
  id,
  organization_id,
  library_id,
  case_code,
  name,
  attack_type,
  prompt,
  expected_pass,
  expected_fail,
  risk_level,
  status,
  tags,
  sort_order,
  metadata,
  created_at,
  updated_at
)
WITH candidate_cases AS (
  SELECT
    org.id AS organization_id,
    'tencent-adp' AS surface,
    'legacy-vuln-tencent-adp-20' AS library_key,
    v.id AS vulnerability_id,
    v.avd_id,
    v.name AS vulnerability_name,
    v.type AS vulnerability_type,
    v.category AS vulnerability_category,
    v.risk_level AS vulnerability_risk_level,
    v.owasp_id,
    v.cwe_id,
    ac.id AS attack_command_id,
    ac.name AS attack_name,
    ac.content,
    ac.attack_mode,
    ac.expected_success,
    ac.non_vulnerability,
    ac.risk_level AS attack_risk_level,
    ROW_NUMBER() OVER (
      PARTITION BY org.id
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(v.category, '')) LIKE '%dify%' THEN 0
          ELSE 1
        END,
        CASE COALESCE(ac.risk_level, v.risk_level, 'medium')
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        v.created_at,
        ac.created_at,
        ac.id
    ) AS rn
  FROM organizations AS org
  CROSS JOIN vulnerabilities AS v
  JOIN attack_commands AS ac
    ON ac.vulnerability_id = v.id
  WHERE
    (ac.enabled IS NULL OR ac.enabled = TRUE)
    AND ac.content IS NOT NULL
    AND TRIM(ac.content) <> ''
    AND (v.status IS NULL OR v.status <> 'archived')
    AND v.created_at < '2026-03-30 00:00:00'
    AND (
      JSON_UNQUOTE(JSON_EXTRACT(v.metadata, '$.verification_mode')) = 'api_blackbox'
      OR JSON_UNQUOTE(JSON_EXTRACT(v.metadata, '$.verificationMode')) = 'api_blackbox'
      OR v.metadata LIKE '%api_blackbox%'
    )

  UNION ALL

  SELECT
    org.id AS organization_id,
    'dify' AS surface,
    'legacy-vuln-dify-20' AS library_key,
    v.id AS vulnerability_id,
    v.avd_id,
    v.name AS vulnerability_name,
    v.type AS vulnerability_type,
    v.category AS vulnerability_category,
    v.risk_level AS vulnerability_risk_level,
    v.owasp_id,
    v.cwe_id,
    ac.id AS attack_command_id,
    ac.name AS attack_name,
    ac.content,
    ac.attack_mode,
    ac.expected_success,
    ac.non_vulnerability,
    ac.risk_level AS attack_risk_level,
    ROW_NUMBER() OVER (
      PARTITION BY org.id
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(v.category, '')) LIKE '%dify%' THEN 0
          ELSE 1
        END,
        CASE COALESCE(ac.risk_level, v.risk_level, 'medium')
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        v.created_at,
        ac.created_at,
        ac.id
    ) AS rn
  FROM organizations AS org
  CROSS JOIN vulnerabilities AS v
  JOIN attack_commands AS ac
    ON ac.vulnerability_id = v.id
  WHERE
    (ac.enabled IS NULL OR ac.enabled = TRUE)
    AND ac.content IS NOT NULL
    AND TRIM(ac.content) <> ''
    AND (v.status IS NULL OR v.status <> 'archived')
    AND (
      LOWER(COALESCE(v.type, '')) = 'dify'
      OR LOWER(COALESCE(v.category, '')) LIKE '%dify%'
    )
)
SELECT
  UUID(),
  c.organization_id,
  lib.id,
  LEFT(
    CONCAT('LEGACY-', UPPER(c.surface), '-', c.avd_id, '-', LEFT(REPLACE(c.attack_command_id, '-', ''), 10)),
    128
  ) AS case_code,
  LEFT(CONCAT(c.vulnerability_name, ' / ', c.attack_name), 255) AS name,
  COALESCE(NULLIF(TRIM(c.attack_mode), ''), 'direct') AS attack_type,
  c.content AS prompt,
  c.non_vulnerability AS expected_pass,
  c.expected_success AS expected_fail,
  COALESCE(NULLIF(TRIM(c.attack_risk_level), ''), NULLIF(TRIM(c.vulnerability_risk_level), ''), 'medium') AS risk_level,
  'published' AS status,
  JSON_ARRAY(
    'legacy-vulnerability-library',
    c.surface,
    COALESCE(NULLIF(TRIM(c.vulnerability_type), ''), 'unknown'),
    COALESCE(NULLIF(TRIM(c.vulnerability_category), ''), 'uncategorized')
  ) AS tags,
  c.rn AS sort_order,
  JSON_OBJECT(
    'source', 'legacy-vulnerabilities',
    'surface', c.surface,
    'vulnerabilityId', c.vulnerability_id,
    'avdId', c.avd_id,
    'attackCommandId', c.attack_command_id,
    'legacyType', c.vulnerability_type,
    'legacyCategory', c.vulnerability_category,
    'owaspId', c.owasp_id,
    'cweId', c.cwe_id
  ) AS metadata,
  NOW(),
  NOW()
FROM candidate_cases AS c
JOIN security_case_libraries AS lib
  ON lib.organization_id = c.organization_id
  AND lib.library_key = c.library_key
WHERE c.rn <= 20
ON DUPLICATE KEY UPDATE
  library_id = VALUES(library_id),
  name = VALUES(name),
  attack_type = VALUES(attack_type),
  prompt = VALUES(prompt),
  expected_pass = VALUES(expected_pass),
  expected_fail = VALUES(expected_fail),
  risk_level = VALUES(risk_level),
  status = 'published',
  tags = VALUES(tags),
  sort_order = VALUES(sort_order),
  metadata = VALUES(metadata),
  deleted_at = NULL,
  updated_at = NOW();

UPDATE security_case_libraries AS lib
LEFT JOIN (
  SELECT
    library_id,
    COUNT(*) AS case_count
  FROM security_test_cases
  WHERE deleted_at IS NULL
  GROUP BY library_id
) AS counts
  ON counts.library_id = lib.id
SET
  lib.case_count = COALESCE(counts.case_count, 0),
  lib.updated_at = NOW()
WHERE lib.library_key IN ('legacy-vuln-tencent-adp-20', 'legacy-vuln-dify-20');

SELECT
  library_key,
  title,
  case_count
FROM security_case_libraries
WHERE library_key IN ('legacy-vuln-tencent-adp-20', 'legacy-vuln-dify-20')
  AND deleted_at IS NULL
ORDER BY library_key;
