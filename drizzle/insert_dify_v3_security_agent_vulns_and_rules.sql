-- One-shot: 安全评估智能体-V3.0-Release 相关 Dify Config 漏洞 (f0c10004~006) + 检测规则
-- 数据库名：按需修改 USE 或命令行指定库
-- 执行: mysql -h 127.0.0.1 -P 3306 -u <user> -p dodoguard0331 < drizzle/insert_dify_v3_security_agent_vulns_and_rules.sql

SET NAMES utf8mb4;

USE `dodoguard0331`;

-- ========== vulnerabilities: AVD-DIFY-CFG-004 / 005 / 006 ==========
INSERT INTO `vulnerabilities` (
  `id`, `avd_id`, `name`, `type`, `category`, `risk_level`, `cvss_score`, `status`, `disclosed_at`,
  `description`, `affected_targets`, `impact_scope`, `cwe_id`, `mitre_id`, `owasp_id`,
  `owasp_llm_top10_mapping`, `exploitability`, `patch_status`, `audit_notes`, `tags`, `metadata`,
  `created_at`, `updated_at`, `created_by`, `updated_by`,
  `adv_id`, `platform_family`, `platform_product`, `artifact_kind`, `detection_phase`,
  `vuln_subtype`, `root_cause_type`, `verification_mode`, `default_confidence`,
  `aliases`, `framework_mappings`, `preconditions`, `trigger_conditions`, `report_profile`, `fingerprint`
) VALUES
(
  'f0c10004-0004-4000-a004-000000000104',
  'AVD-DIFY-CFG-004',
  'Dify Config: uses non-approved siliconflow LLM provider',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'Workflow LLM nodes are configured to use langgenius/siliconflow provider in the 安全评估智能体-V3.0 app; this provider may be outside the organization-approved model list.',
  NULL,
  'May introduce data residency, compliance, or model-behavior risks if siliconflow is not under the same governance as primary providers.',
  'CWE-284',
  NULL,
  'LLM02',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","llm-provider","siliconflow","security-agent"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","app_name":"安全评估智能体-V3.0-Release"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-004',
  'dify',
  'Dify',
  'config',
  'static',
  'non_approved_llm_provider',
  'unsafe_provider_selection',
  'config_audit',
  0.76,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10005-0005-4000-a005-000000000105',
  'AVD-DIFY-CFG-005',
  'Dify Config: retriever enabled without strict filtering',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '安全评估智能体-V3.0 workflow enables Dify retriever_resource and knowledge-retrieval nodes without clear metadata filters or conservative top_k limits, increasing data overexposure risk.',
  NULL,
  'Broad or unfiltered retrieval may expose entire knowledge bases or sensitive documents to prompts outside their original context.',
  'CWE-200',
  NULL,
  'LLM10',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","retriever","knowledge-retrieval","security-agent"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","app_name":"安全评估智能体-V3.0-Release"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-005',
  'dify',
  'Dify',
  'config',
  'static',
  'retriever_overexposure',
  'missing_data_scoping',
  'config_audit',
  0.74,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10006-0006-4000-a006-000000000106',
  'AVD-DIFY-CFG-006',
  'Dify Config: complex marketplace tool chain in security assessment workflow',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '安全评估智能体-V3.0 workflow wires multiple marketplace tools (rookie_data_alchemy / rookie_text2data / md_exporter) into the core assessment path without isolation or explicit trust policy.',
  NULL,
  'Chained third-party tools in a security evaluation agent amplify supply-chain and data exfiltration risks if any plugin is compromised.',
  'CWE-829',
  NULL,
  'LLM03',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","marketplace-plugin","tool-chain","security-agent"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","app_name":"安全评估智能体-V3.0-Release"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-006',
  'dify',
  'Dify',
  'config',
  'static',
  'marketplace_tool_chain',
  'third_party_trust_boundary',
  'config_audit',
  0.79,
  NULL, NULL, NULL, NULL, NULL, NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

-- ========== detection_rules: match_target=config_structure（结构化 YAML / structureSearchBlob）==========
INSERT INTO `detection_rules` (
  `id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`,
  `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`,
  `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`,
  `applies_to_components`, `version_constraints`, `test_fixture_ids`
) VALUES
-- AVD-DIFY-CFG-004
('d0cf4010-0004-4000-8000-000000000001', 'f0c10004-0004-4000-a004-000000000104', '【LLM Provider】siliconflow used in config (Keyword)', 'keyword', 'langgenius/siliconflow|\"provider\":\"siliconflow\"|siliconflow:', 'medium', 0.80, 1, '{\"advId\":\"ADV-DIFY-CFG-004\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf4020-0004-4000-8000-000000000002', 'f0c10004-0004-4000-a004-000000000104', '【LLM Provider】结构化字段中出现 siliconflow (Regex)', 'regex', '\"kind\"\\s*:\\s*\"llm\"[\\s\\S]{0,200}?\"provider\"\\s*:\\s*\"[^\"]*siliconflow[^\"]*\"', 'medium', 0.82, 1, '{\"advId\":\"ADV-DIFY-CFG-004\",\"source\":\"config_structure\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
-- AVD-DIFY-CFG-005
('d0cf5010-0005-4000-8000-000000000001', 'f0c10005-0005-4000-a005-000000000105', '【Retriever】enabled with broad scope (Keyword)', 'keyword', 'retriever_resource\"[\\s\\S]*\"enabled\"\\s*:\\s*true|\"kind\":\"knowledge-retrieval\"', 'medium', 0.75, 1, '{\"advId\":\"ADV-DIFY-CFG-005\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf5020-0005-4000-8000-000000000002', 'f0c10005-0005-4000-a005-000000000105', '【Retriever】开启检索资源且存在 knowledge-retrieval 节点 (Keyword)', 'keyword', 'retriever_resource\"[\\s\\S]*\"enabled\"\\s*:\\s*true|\"kind\"\\s*:\\s*\"knowledge-retrieval\"', 'medium', 0.78, 1, '{\"advId\":\"ADV-DIFY-CFG-005\",\"source\":\"config_structure\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf5030-0005-4000-8000-000000000003', 'f0c10005-0005-4000-a005-000000000105', '【Retriever】knowledge-retrieval top_k 过大 (Regex)', 'regex', '\"kind\"\\s*:\\s*\"knowledge-retrieval\"[\\s\\S]{0,200}?\"top_k\"\\s*:\\s*(5[1-9]|[6-9]\\d|\\d{3,})', 'medium', 0.80, 1, '{\"advId\":\"ADV-DIFY-CFG-005\",\"threshold\":\"top_k>50\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
-- AVD-DIFY-CFG-006
('d0cf6010-0006-4000-8000-000000000001', 'f0c10006-0006-4000-a006-000000000106', '【Marketplace】rookie & md_exporter tool chain (Keyword)', 'keyword', 'rookie_data_alchemy|rookie_text2data|md_exporter', 'medium', 0.80, 1, '{\"advId\":\"ADV-DIFY-CFG-006\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf6020-0006-4000-8000-000000000002', 'f0c10006-0006-4000-a006-000000000106', '【Marketplace】安全评估智能体依赖 rookie / md_exporter 插件 (Keyword)', 'keyword', 'rookie_data_alchemy|rookie_text2data|md_exporter|marketplace_plugin_unique_identifier', 'medium', 0.82, 1, '{\"advId\":\"ADV-DIFY-CFG-006\",\"source\":\"dependencies\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf6030-0006-4000-8000-000000000003', 'f0c10006-0006-4000-a006-000000000106', '【Marketplace】安全评估智能体 + marketplace 组合 (Regex)', 'regex', '\"name\"\\s*:\\s*\"安全评估智能体-V3.0-Release\"[\\s\\S]{0,400}marketplace_plugin_unique_identifier', 'medium', 0.85, 1, '{\"advId\":\"ADV-DIFY-CFG-006\",\"source\":\"app_and_dependencies\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `pattern` = VALUES(`pattern`),
  `severity` = VALUES(`severity`),
  `confidence` = VALUES(`confidence`),
  `metadata` = VALUES(`metadata`),
  `match_target` = VALUES(`match_target`),
  `updated_at` = VALUES(`updated_at`);
