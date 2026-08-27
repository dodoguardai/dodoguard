-- Reset technical security case library domains for one organization.
-- Replace @ORG_ID with the target organization id before executing.

SET @ORG_ID = 'REPLACE_WITH_ORGANIZATION_ID';
SET @ACTOR_ID = NULL;

START TRANSACTION;

DELETE FROM security_test_cases
WHERE organization_id = @ORG_ID
  AND library_id IN (
    SELECT id
    FROM (
      SELECT id
      FROM security_case_libraries
      WHERE organization_id = @ORG_ID
        AND deleted_at IS NULL
        AND (
          JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.libraryCategory')) IS NULL
          OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.libraryCategory')) = 'technical'
        )
    ) AS technical_libraries
  );

DELETE FROM security_case_libraries
WHERE organization_id = @ORG_ID
  AND deleted_at IS NULL
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.libraryCategory')) IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.libraryCategory')) = 'technical'
  );

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
  created_by,
  updated_by
) VALUES
(
  UUID(),
  @ORG_ID,
  'domain-system-instruction-leakage-bypass',
  '系统指令泄露与绕过风险',
  '系统指令泄露与绕过风险',
  '一级分类占位，用于对话安全测试用例库 Tab 展示。',
  0,
  TRUE,
  'medium',
  'manual',
  'published',
  JSON_ARRAY(),
  JSON_OBJECT(
    'seeded', TRUE,
    'libraryCategory', 'technical',
    'domainOnly', TRUE,
    'domainOrder', 1,
    'icon', '⚠'
  ),
  @ACTOR_ID,
  @ACTOR_ID
),
(
  UUID(),
  @ORG_ID,
  'domain-malicious-input-dialogue-attack',
  '恶意输入与对话攻击风险',
  '恶意输入与对话攻击风险',
  '一级分类占位，用于对话安全测试用例库 Tab 展示。',
  0,
  TRUE,
  'medium',
  'manual',
  'published',
  JSON_ARRAY(),
  JSON_OBJECT(
    'seeded', TRUE,
    'libraryCategory', 'technical',
    'domainOnly', TRUE,
    'domainOrder', 2,
    'icon', '⚔'
  ),
  @ACTOR_ID,
  @ACTOR_ID
),
(
  UUID(),
  @ORG_ID,
  'domain-output-content-risk',
  '输出内容风险',
  '输出内容风险',
  '一级分类占位，用于对话安全测试用例库 Tab 展示。',
  0,
  TRUE,
  'medium',
  'manual',
  'published',
  JSON_ARRAY(),
  JSON_OBJECT(
    'seeded', TRUE,
    'libraryCategory', 'technical',
    'domainOnly', TRUE,
    'domainOrder', 3,
    'icon', '📤'
  ),
  @ACTOR_ID,
  @ACTOR_ID
),
(
  UUID(),
  @ORG_ID,
  'domain-knowledge-query-access-risk',
  '知识库查询与信息访问风险',
  '知识库查询与信息访问风险',
  '一级分类占位，用于对话安全测试用例库 Tab 展示。',
  0,
  TRUE,
  'medium',
  'manual',
  'published',
  JSON_ARRAY(),
  JSON_OBJECT(
    'seeded', TRUE,
    'libraryCategory', 'technical',
    'domainOnly', TRUE,
    'domainOrder', 4,
    'icon', '📚'
  ),
  @ACTOR_ID,
  @ACTOR_ID
);

COMMIT;
