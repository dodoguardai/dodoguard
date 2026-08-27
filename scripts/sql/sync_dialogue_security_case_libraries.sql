-- Sync dialogue security case libraries under each first-level category.
-- Target database: MySQL / MariaDB.
-- Safe to run multiple times. It upserts scene-library rows for every organization.

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
  CONCAT('二级场景库：', seed.`title`, '。所属一级分类：', seed.`domain`, '。'),
  0,
  TRUE,
  'medium',
  'manual',
  'published',
  JSON_ARRAY(),
  JSON_OBJECT(
    'libraryCategory', 'technical',
    'source', 'dialogue-security-taxonomy',
    'scenarioOrder', seed.`scenario_order`
  ),
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM `organizations` org
CROSS JOIN (
  SELECT 'dlg-system-prompt-leakage' AS `library_key`, '系统指令泄露与绕过风险' AS `domain`, '系统提示词泄露' AS `title`, 1 AS `scenario_order`
  UNION ALL SELECT 'dlg-security-rule-leakage', '系统指令泄露与绕过风险', '安全规则泄露', 2
  UNION ALL SELECT 'dlg-tool-info-leakage', '系统指令泄露与绕过风险', '工具信息泄露', 3
  UNION ALL SELECT 'dlg-developer-instruction-leakage', '系统指令泄露与绕过风险', '开发者指令泄露', 4
  UNION ALL SELECT 'dlg-role-task-leakage', '系统指令泄露与绕过风险', '角色任务泄露', 5
  UNION ALL SELECT 'dlg-system-config-leakage', '系统指令泄露与绕过风险', '系统配置信息泄露', 6
  UNION ALL SELECT 'dlg-session-memory-leakage', '系统指令泄露与绕过风险', '会话记忆泄露', 7
  UNION ALL SELECT 'dlg-error-debug-info-leakage', '系统指令泄露与绕过风险', '报错调试信息泄露', 8

  UNION ALL SELECT 'dlg-test-dev-mode-impersonation', '恶意输入与对话攻击风险', '伪装成测试或开发模式', 1
  UNION ALL SELECT 'dlg-malicious-requirement-smuggling', '恶意输入与对话攻击风险', '在问题里夹带恶意要求', 2
  UNION ALL SELECT 'dlg-answer-limit-break-inducement', '恶意输入与对话攻击风险', '诱导Agent突破回答限制', 3
  UNION ALL SELECT 'dlg-ignore-original-instructions', '恶意输入与对话攻击风险', '要求忽略原有指令', 4
  UNION ALL SELECT 'dlg-identity-scenario-impersonation', '恶意输入与对话攻击风险', '假扮身份或场景骗过限制', 5
  UNION ALL SELECT 'dlg-file-web-instruction-smuggling', '恶意输入与对话攻击风险', '在文件或网页中夹带指令', 6
  UNION ALL SELECT 'dlg-conflicting-requirements-interference', '恶意输入与对话攻击风险', '用互相矛盾的要求干扰Agent', 7
  UNION ALL SELECT 'dlg-encoded-split-character-hiding', '恶意输入与对话攻击风险', '用编码或拆字隐藏请求', 8
  UNION ALL SELECT 'dlg-multi-turn-progressive-breakthrough', '恶意输入与对话攻击风险', '通过多轮对话逐步突破', 9
  UNION ALL SELECT 'dlg-auth-approval-bypass', '恶意输入与对话攻击风险', '跳过身份验证或审批流程', 10
  UNION ALL SELECT 'dlg-unauthorized-tool-call-inducement', '恶意输入与对话攻击风险', '诱导调用未授权工具', 11

  UNION ALL SELECT 'dlg-privacy-secret-internal-output-leakage', '输出内容风险', '隐私、密钥与内部内容泄露', 1
  UNION ALL SELECT 'dlg-illegal-harmful-dangerous-content', '输出内容风险', '违法、有害与危险内容生成', 2
  UNION ALL SELECT 'dlg-uncertain-question-fabrication', '输出内容风险', '不确定问题编造答案', 3
  UNION ALL SELECT 'dlg-false-citation-source', '输出内容风险', '错误引用与虚假来源', 4
  UNION ALL SELECT 'dlg-wrong-conclusion-misleading-advice', '输出内容风险', '错误结论与误导性建议', 5
  UNION ALL SELECT 'dlg-sensitive-attribute-inference-labeling', '输出内容风险', '敏感属性推断与标签化', 6
  UNION ALL SELECT 'dlg-overpromise-false-capability', '输出内容风险', '过度承诺与虚假能力声明', 7
  UNION ALL SELECT 'dlg-improper-guidance-manipulative-content', '输出内容风险', '不当引导与操纵性内容', 8
  UNION ALL SELECT 'dlg-copyright-protected-content-output', '输出内容风险', '版权与受保护内容输出', 9
  UNION ALL SELECT 'dlg-output-user-request-mismatch', '输出内容风险', '内容与用户要求不匹配', 10
  UNION ALL SELECT 'dlg-inconsistent-output-content', '输出内容风险', '前后内容矛盾', 11
  UNION ALL SELECT 'dlg-internal-reasoning-exposure', '输出内容风险', '内部判断过程暴露', 12
  UNION ALL SELECT 'dlg-unauthorized-conclusion', '输出内容风险', '超出权限作出结论', 13
  UNION ALL SELECT 'dlg-high-risk-professional-advice', '输出内容风险', '高风险专业建议不当', 14
  UNION ALL SELECT 'dlg-bias-unfair-treatment', '输出内容风险', '偏见与不公平对待', 15
  UNION ALL SELECT 'dlg-output-format-downstream-impact', '输出内容风险', '输出格式影响下游系统', 16
  UNION ALL SELECT 'dlg-refusal-quality-safe-alternative', '输出内容风险', '拒答质量与安全替代不足', 17

  UNION ALL SELECT 'dlg-unauthorized-knowledge-query', '知识库查询与信息访问风险', '查询到无权限知识', 1
  UNION ALL SELECT 'dlg-unauthorized-knowledge-answer-leakage', '知识库查询与信息访问风险', '回答中泄露无权限内容', 2
  UNION ALL SELECT 'dlg-malicious-document-answer-influence', '知识库查询与信息访问风险', '恶意文档影响回答', 3
  UNION ALL SELECT 'dlg-cross-user-unit-data-mixing', '知识库查询与信息访问风险', '不同用户或单位数据串用', 4
  UNION ALL SELECT 'dlg-wrong-source-or-stale-citation', '知识库查询与信息访问风险', '引用来源错误或内容过期', 5
  UNION ALL SELECT 'dlg-paraphrase-sensitive-info-bypass', '知识库查询与信息访问风险', '变形提问绕过敏感信息保护', 6

  UNION ALL SELECT 'dlg-prompt-injection-unauthorized-operation', '提示注入风险', '指令注入与越权操作', 1

  UNION ALL SELECT 'dlg-confidential-credential-leakage', '数据外泄与隐私', '机密凭证泄露', 1
  UNION ALL SELECT 'dlg-internal-document-code-exposure', '数据外泄与隐私', '内部文档或代码暴露', 2
  UNION ALL SELECT 'dlg-personal-information-collection', '数据外泄与隐私', '个人信息收集', 3
  UNION ALL SELECT 'dlg-membership-inference', '数据外泄与隐私', '成员推断', 4
  UNION ALL SELECT 'dlg-trade-secret-leakage', '数据外泄与隐私', '商业机密泄露', 5
  UNION ALL SELECT 'dlg-model-inversion-extraction', '数据外泄与隐私', '模型反推与窃取', 6

  UNION ALL SELECT 'dlg-roleplay-jailbreak', '越狱与绕过', '角色扮演越狱', 1
  UNION ALL SELECT 'dlg-instruction-override', '越狱与绕过', '指令覆盖', 2
  UNION ALL SELECT 'dlg-intent-task-laundering', '越狱与绕过', '意图与任务洗白', 3

  UNION ALL SELECT 'dlg-hacker-text-homoglyph', '规避与混淆', '黑客文/同形字', 1
  UNION ALL SELECT 'dlg-pinyin-homophone-split-character', '规避与混淆', '拼音/谐音/拆字', 2
  UNION ALL SELECT 'dlg-segmented-symbol-insertion', '规避与混淆', '分段插符号', 3
  UNION ALL SELECT 'dlg-content-mask-algorithm-obfuscation', '规避与混淆', '内容掩码与算法混淆', 4

  UNION ALL SELECT 'dlg-parsing-interference-garbage-noise', '低质/垃圾/对抗噪声', '解析干扰与垃圾噪声', 1
  UNION ALL SELECT 'dlg-ad-seo-bait', '低质/垃圾/对抗噪声', '广告/SEO诱饵', 2

  UNION ALL SELECT 'dlg-resource-consumption-flooding', '资源消耗/账单攻击', '资源消耗与洪泛攻击', 1

  UNION ALL SELECT 'dlg-political-sensitive-content', '敏感内容', '政治敏感', 1
  UNION ALL SELECT 'dlg-self-harm-suicide-content', '敏感内容', '自伤自残与自杀', 2
  UNION ALL SELECT 'dlg-csam-content', '敏感内容', '未成年人性剥削', 3
  UNION ALL SELECT 'dlg-harassment-threat-stalking', '敏感内容', '骚扰/威胁/跟踪', 4
) seed
WHERE TRUE
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `domain` = VALUES(`domain`),
  `description` = VALUES(`description`),
  `enabled` = TRUE,
  `default_level` = 'medium',
  `detect_method` = 'manual',
  `status` = 'published',
  `standards` = JSON_ARRAY(),
  `metadata` = VALUES(`metadata`),
  `updated_at` = CURRENT_TIMESTAMP,
  `deleted_at` = NULL;
