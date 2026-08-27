-- Sync dialogue security case-library categories.
-- Target database: MySQL / MariaDB.
-- Safe to run multiple times. It upserts domain-only category rows for every organization.

INSERT INTO `security_case_libraries` (
  `id`,
  `organization_id`,
  `library_key`,
  `title`,
  `domain`,
  `description`,
  `case_count`,
  `enabled`,
  `default_level`,
  `detect_method`,
  `status`,
  `standards`,
  `metadata`,
  `created_by`,
  `updated_by`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  UUID(),
  org.`id`,
  seed.`library_key`,
  seed.`title`,
  seed.`domain`,
  seed.`description`,
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
    'domainOrder', seed.`domain_order`,
    'icon', seed.`icon`
  ),
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM `organizations` org
CROSS JOIN (
  SELECT 'domain-system-instruction-leakage-bypass' AS `library_key`, '系统指令泄露与绕过风险' AS `title`, '系统指令泄露与绕过风险' AS `domain`, '一级分类占位，用于对话安全测试用例库分类展示。' AS `description`, 1 AS `domain_order`, '⚠' AS `icon`
  UNION ALL SELECT 'domain-malicious-input-dialogue-attack', '恶意输入与对话攻击风险', '恶意输入与对话攻击风险', '一级分类占位，用于对话安全测试用例库分类展示。', 2, '⚔'
  UNION ALL SELECT 'domain-output-content-risk', '输出内容风险', '输出内容风险', '一级分类占位，用于对话安全测试用例库分类展示。', 3, '📤'
  UNION ALL SELECT 'domain-knowledge-query-access-risk', '知识库查询与信息访问风险', '知识库查询与信息访问风险', '一级分类占位，用于对话安全测试用例库分类展示。', 4, '📚'
  UNION ALL SELECT 'domain-prompt-injection-risk', '提示注入风险', '提示注入风险', '一级分类占位，用于对话安全测试用例库分类展示。', 5, '⚠'
  UNION ALL SELECT 'domain-data-leakage-privacy-risk', '数据外泄与隐私', '数据外泄与隐私', '一级分类占位，用于对话安全测试用例库分类展示。', 6, '🔒'
  UNION ALL SELECT 'domain-jailbreak-bypass-risk', '越狱与绕过', '越狱与绕过', '一级分类占位，用于对话安全测试用例库分类展示。', 7, '⚔'
  UNION ALL SELECT 'domain-evasion-obfuscation-risk', '规避与混淆', '规避与混淆', '一级分类占位，用于对话安全测试用例库分类展示。', 8, '🧩'
  UNION ALL SELECT 'domain-low-quality-adversarial-noise-risk', '低质/垃圾/对抗噪声', '低质/垃圾/对抗噪声', '一级分类占位，用于对话安全测试用例库分类展示。', 9, '🧹'
  UNION ALL SELECT 'domain-resource-billing-attack-risk', '资源消耗/账单攻击', '资源消耗/账单攻击', '一级分类占位，用于对话安全测试用例库分类展示。', 10, '⏱'
  UNION ALL SELECT 'domain-sensitive-content-risk', '敏感内容', '敏感内容', '一级分类占位，用于对话安全测试用例库分类展示。', 11, '📤'
) seed
WHERE TRUE
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `domain` = VALUES(`domain`),
  `description` = VALUES(`description`),
  `case_count` = 0,
  `enabled` = TRUE,
  `default_level` = 'medium',
  `detect_method` = 'manual',
  `status` = 'published',
  `standards` = JSON_ARRAY(),
  `metadata` = VALUES(`metadata`),
  `updated_at` = CURRENT_TIMESTAMP,
  `deleted_at` = NULL;
