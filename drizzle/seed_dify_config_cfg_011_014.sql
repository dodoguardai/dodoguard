-- Dify Config：常见工作流节点面风险（ADV/AVD-DIFY-CFG-011 .. 014）
-- 与 seed_dify_config_vulnerabilities.sql / seed_dify_config_vulnerability_relations.sql 分离，避免与原有 001-006 种子混在一起。
-- 参考：docs/dify配置文件（start、document-extractor、question-classifier、list-operator 等）
-- 编号 011-014：与 docs/new 等目录中其他 CFG-007..010 语义区分，避免 adv_id 冲突。
--
-- 执行顺序：在 schema 就绪后单独执行本文件即可（自包含 vulnerabilities + 子表）。
--   mysql ... < drizzle/seed_dify_config_node_surface_cfg_011_014.sql
--
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- vulnerabilities
-- ---------------------------------------------------------------------------
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
  'f0c10011-0011-4000-a011-000000000111',
  'AVD-DIFY-CFG-011',
  'Dify Config: Start 节点启用远程 URL / 文件上传且缺少约束',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  '工作流在 features.file_upload 或 Start 变量中允许 remote_url、file-list 等多路径导入；攻击者可诱导拉取内网 URL、大文件或恶意载荷，形成类 SSRF / 资源耗尽或供应链入口（与合同类 DSL 中常见配置一致）。',
  NULL,
  '可能导致内网探测、凭据旁路读取（通过可访问的内网 HTTP）、或拖垮 Worker 的大对象处理。',
  'CWE-918',
  NULL,
  'LLM05',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","start","file-upload","remote-url","ssrf"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-011',
  'dify',
  'Dify',
  'config',
  'static',
  'start_file_upload_surface',
  'unsafe_ingress_configuration',
  'config_audit',
  0.82,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10012-0012-4000-a012-000000000112',
  'AVD-DIFY-CFG-012',
  'Dify Config: Document Extractor 节点处理任意文档内容',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '导出 DSL 中存在 document-extractor（或等价文档解析）节点时，若上游未限制文件类型与大小，敏感合同/标书全文可能进入后续 LLM 上下文，扩大泄露面与提示注入载体。',
  NULL,
  '机密文档内容进入模型与日志，违反最小暴露；亦可能成为间接提示注入的载体。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","document-extractor","pii","contract"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-012',
  'dify',
  'Dify',
  'config',
  'static',
  'document_extractor_data_exposure',
  'missing_content_policy',
  'config_audit',
  0.77,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10013-0013-4000-a013-000000000113',
  'AVD-DIFY-CFG-013',
  'Dify Config: Question Classifier 路由可被绕过或误分类',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'question-classifier 仅依赖短文本语义分区；恶意用户可通过措辞绕过「敏感/拒答」分支，使请求进入宽松 LLM 或工具链（电信客服等分流型 DSL 常见）。',
  NULL,
  '安全策略与工具授权依赖错误路由时失效，导致越权回答或工具调用。',
  'CWE-863',
  NULL,
  'LLM01',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","question-classifier","routing","policy-bypass"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-013',
  'dify',
  'Dify',
  'config',
  'static',
  'classifier_routing_weakness',
  'insufficient_access_control',
  'config_audit',
  0.73,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10014-0014-4000-a014-000000000114',
  'AVD-DIFY-CFG-014',
  'Dify Config: List Operator 聚合多路数据缺少字段级脱敏',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'list-operator 合并、去重或截取列表时，若未在节点侧限制字段，易将多轮/多来源的 PII 或内部标识一并传入下游 LLM（合同对比类工作流常见）。',
  NULL,
  '批量结构化数据在合并后一次性暴露给模型与终端用户，扩大违规披露范围。',
  'CWE-359',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","list-operator","aggregation","pii"]',
  '{"source":"seed","demo":true,"surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-014',
  'dify',
  'Dify',
  'config',
  'static',
  'list_operator_over_aggregation',
  'missing_field_level_controls',
  'config_audit',
  0.72,
  NULL, NULL, NULL, NULL, NULL, NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

-- ---------------------------------------------------------------------------
-- attack_commands, detection_rules, llm_review_instructions
-- ---------------------------------------------------------------------------

-- ========== f0c10011... AVD-DIFY-CFG-011 Start / file upload / remote_url ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1110-0011-4000-8000-000000000001', 'f0c10011-0011-4000-a011-000000000111', '【Config】远程 URL 与上传能力', '导出 YAML 中 file_upload 或 Start 是否启用 remote_url、local_file，且是否限制域名或内网段？', 'direct', '确认允许任意 URL 或未声明出站限制。', '已禁用远程拉取，或仅允许白名单域名与大小上限。', 'high', 1, '{\"advId\":\"ADV-DIFY-CFG-011\",\"seed\":\"dify_config_node_start\"}', NOW(), NOW()),
('e0cf1120-0011-4000-8000-000000000002', 'f0c10011-0011-4000-a011-000000000111', '【Config】file-list 变量', 'Start 输入是否包含 file-list 类型且直接进入解析/抽取节点而无病毒或类型扫描说明？', 'direct', '大文件或任意扩展名直接进入处理链。', '有类型白名单、大小上限与异步扫描策略。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-011\",\"seed\":\"dify_config_node_start\"}', NOW(), NOW()),
('e0cf1130-0011-4000-8000-000000000003', 'f0c10011-0011-4000-a011-000000000111', '【Config】类 SSRF 场景', '是否声明禁止用户构造的 URL 指向 10/172/192/169.254 段？', 'direct', '无此类约束或示例中含可执行内网地址。', '明确禁止私网与元数据地址，或由网关统一代理。', 'high', 1, '{\"advId\":\"ADV-DIFY-CFG-011\",\"seed\":\"dify_config_node_start\"}', NOW(), NOW());

INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1110-0011-4000-8000-000000000001', 'f0c10011-0011-4000-a011-000000000111', '【Start/Upload】remote_url 与上传开关(Keyword)', 'keyword', 'remote_url|file-list|allowed_file_upload_methods|file_upload|transfer_methods', 'high', 0.83, 1, '{\"advId\":\"ADV-DIFY-CFG-011\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf1120-0011-4000-8000-000000000002', 'f0c10011-0011-4000-a011-000000000111', '【Start/Upload】enabled true(Regex)', 'regex', 'file_upload:[\\s\\S]{0,400}enabled:\\s*true', 'medium', 0.68, 1, '{\"advId\":\"ADV-DIFY-CFG-011\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL);

INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1110-0011-4000-8000-000000000001', 'f0c10011-0011-4000-a011-000000000111', '判定 Start/文件入口风险', 'system_prompt', 'You evaluate Dify YAML for Start node or file_upload features that allow remote_url or unconstrained file ingestion. Output JSON: {\"vulnerable\":boolean,\"confidence\":0-1,\"reason\":\"short\"}.', 'LLM judge for AVD-DIFY-CFG-011', NULL, 0.10, 2000, 1, 0, '{\"seed\":\"dify_config_node_start\"}', NOW(), NOW()),
('l0cf1120-0011-4000-8000-000000000002', 'f0c10011-0011-4000-a011-000000000111', '检测提示：remote_url 与 file-list', 'detection_instruction', 'Flag remote_url, file-list inputs, or enabled file_upload without documented egress allowlist.', 'Secondary hint', NULL, 0.20, 1500, 1, 1, '{\"seed\":\"dify_config_node_start\"}', NOW(), NOW());

-- ========== f0c10012... AVD-DIFY-CFG-012 document-extractor ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1210-0012-4000-8000-000000000001', 'f0c10012-0012-4000-a012-000000000112', '【Config】文档抽取链路', '工作流是否在 document-extractor 之后直接连接 LLM 且未声明脱敏或字段过滤？', 'direct', '全文进入模型且无数据分级说明。', '抽取字段受限，或下游有脱敏/策略模块。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-012\",\"seed\":\"dify_config_node_doc_ext\"}', NOW(), NOW()),
('e0cf1220-0012-4000-8000-000000000002', 'f0c10012-0012-4000-a012-000000000112', '【Config】合同/标书场景', '该应用是否处理合同、投标等机密文本？请从配置元数据或节点标题推断。', 'direct', '确认高敏业务路径上无额外控制。', '低敏演示数据或明确脱敏 pipeline。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-012\",\"seed\":\"dify_config_node_doc_ext\"}', NOW(), NOW()),
('e0cf1230-0012-4000-8000-000000000003', 'f0c10012-0012-4000-a012-000000000112', '【Config】日志与留存', '是否声明不向日志回显抽取全文？', 'direct', '无留存策略或默认可记录全文。', '截断、哈希或禁用原文日志。', 'low', 1, '{\"advId\":\"ADV-DIFY-CFG-012\",\"seed\":\"dify_config_node_doc_ext\"}', NOW(), NOW());

INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1210-0012-4000-8000-000000000001', 'f0c10012-0012-4000-a012-000000000112', '【Document】document-extractor 节点(Keyword)', 'keyword', 'document-extractor|\"type\":\\s*document-extractor|extractor', 'medium', 0.80, 1, '{\"advId\":\"ADV-DIFY-CFG-012\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf1220-0012-4000-8000-000000000002', 'f0c10012-0012-4000-a012-000000000112', '【Document】合同/投标关键词(Keyword)', 'keyword', '合同|标书|投标|资信|对比|条款', 'low', 0.55, 1, '{\"advId\":\"ADV-DIFY-CFG-012\"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL);

INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1210-0012-4000-8000-000000000001', 'f0c10012-0012-4000-a012-000000000112', '判定文档抽取暴露风险', 'system_prompt', 'You evaluate whether document-extractor nodes in Dify YAML feed unfiltered long text into LLM for sensitive domains (contracts, bids). Output JSON: {\"vulnerable\":boolean,\"confidence\":0-1,\"reason\":\"short\"}.', 'LLM judge for AVD-DIFY-CFG-012', NULL, 0.10, 2000, 1, 0, '{\"seed\":\"dify_config_node_doc_ext\"}', NOW(), NOW()),
('l0cf1220-0012-4000-8000-000000000002', 'f0c10012-0012-4000-a012-000000000112', '检测提示：抽取→LLM', 'detection_instruction', 'Treat document-extractor adjacent to LLM without intermediate redaction as higher risk.', 'Secondary hint', NULL, 0.20, 1500, 1, 1, '{\"seed\":\"dify_config_node_doc_ext\"}', NOW(), NOW());

-- ========== f0c10013... AVD-DIFY-CFG-013 question-classifier ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1310-0013-4000-8000-000000000001', 'f0c10013-0013-4000-a013-000000000113', '【Config】分类器话题边界', 'question-classifier 各分支是否定义了「拒答/人工」类兜底，且与工具授权一致？', 'direct', '无兜底分支或敏感话题与工具链混用。', '明确拒答分支与最小工具集。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-013\",\"seed\":\"dify_config_node_qc\"}', NOW(), NOW()),
('e0cf1320-0013-4000-8000-000000000002', 'f0c10013-0013-4000-a013-000000000113', '【Config】绕过测试说明', '是否记录对抗性短语测试分类稳定性？', 'direct', '无测试或易误分类到高权限分支。', '有对抗测试与监控误分类率。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-013\",\"seed\":\"dify_config_node_qc\"}', NOW(), NOW()),
('e0cf1330-0013-4000-8000-000000000003', 'f0c10013-0013-4000-a013-000000000113', '【Config】多分类器串联', '多个 question-classifier 串联时是否存在矛盾策略？', 'direct', '后级放宽前级限制。', '策略一致或由单一策略节点裁决。', 'low', 1, '{\"advId\":\"ADV-DIFY-CFG-013\",\"seed\":\"dify_config_node_qc\"}', NOW(), NOW());

INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1310-0013-4000-8000-000000000001', 'f0c10013-0013-4000-a013-000000000113', '【Classifier】question-classifier 节点(Keyword)', 'keyword', 'question-classifier|\"type\":\\s*question-classifier|topics|classes', 'medium', 0.78, 1, '{\"advId\":\"ADV-DIFY-CFG-013\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf1320-0013-4000-8000-000000000002', 'f0c10013-0013-4000-a013-000000000113', '【Classifier】多实例(Regex)', 'regex', 'question-classifier[\\s\\S]{0,1200}question-classifier', 'medium', 0.65, 1, '{\"advId\":\"ADV-DIFY-CFG-013\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL);

INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1310-0013-4000-8000-000000000001', 'f0c10013-0013-4000-a013-000000000113', '判定分类路由风险', 'system_prompt', 'You evaluate Dify YAML for question-classifier routing that may bypass safety branches or over-bind tools. Output JSON: {\"vulnerable\":boolean,\"confidence\":0-1,\"reason\":\"short\"}.', 'LLM judge for AVD-DIFY-CFG-013', NULL, 0.10, 2000, 1, 0, '{\"seed\":\"dify_config_node_qc\"}', NOW(), NOW()),
('l0cf1320-0013-4000-8000-000000000002', 'f0c10013-0013-4000-a013-000000000113', '检测提示：分支与工具', 'detection_instruction', 'Flag classifiers whose edges route to tool-heavy subgraphs without a refuse/escalation branch.', 'Secondary hint', NULL, 0.20, 1500, 1, 1, '{\"seed\":\"dify_config_node_qc\"}', NOW(), NOW());

-- ========== f0c10014... AVD-DIFY-CFG-014 list-operator ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1410-0014-4000-8000-000000000001', 'f0c10014-0014-4000-a014-000000000114', '【Config】列表合并范围', 'list-operator 是否对输入列表来源（多轮对话/多文档）做字段投影或截断？', 'direct', '合并后仍含身份证/手机等字段示例或未声明过滤。', '仅保留业务必要字段或哈希化。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-014\",\"seed\":\"dify_config_node_list\"}', NOW(), NOW()),
('e0cf1420-0014-4000-8000-000000000002', 'f0c10014-0014-4000-a014-000000000114', '【Config】与 LLM 直连', 'list-operator 输出是否直接进入最终 answer 而无行级权限检查？', 'direct', '全量列表展示给用户。', '按角色过滤或分页脱敏。', 'medium', 1, '{\"advId\":\"ADV-DIFY-CFG-014\",\"seed\":\"dify_config_node_list\"}', NOW(), NOW()),
('e0cf1430-0014-4000-8000-000000000003', 'f0c10014-0014-4000-a014-000000000114', '【Config】去重键敏感性', '去重/排序是否基于可识别个人的键？', 'direct', '使用明文 PII 作为聚合键。', '使用不可逆 ID 或聚合统计。', 'low', 1, '{\"advId\":\"ADV-DIFY-CFG-014\",\"seed\":\"dify_config_node_list\"}', NOW(), NOW());

INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1410-0014-4000-8000-000000000001', 'f0c10014-0014-4000-a014-000000000114', '【List】list-operator 节点(Keyword)', 'keyword', 'list-operator|\"type\":\\s*list-operator|array\\.join|deduplicate', 'medium', 0.76, 1, '{\"advId\":\"ADV-DIFY-CFG-014\"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL),
('d0cf1420-0014-4000-8000-000000000002', 'f0c10014-0014-4000-a014-000000000114', '【List】对比/差异场景(Keyword)', 'keyword', '对比|diff|变更|前后|版本', 'low', 0.52, 1, '{\"advId\":\"ADV-DIFY-CFG-014\"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[\"dify\"]', NULL, NULL, NULL);

INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1410-0014-4000-8000-000000000001', 'f0c10014-0014-4000-a014-000000000114', '判定列表聚合暴露风险', 'system_prompt', 'You evaluate Dify YAML for list-operator nodes that may aggregate PII across sources without field masking before LLM/answer. Output JSON: {\"vulnerable\":boolean,\"confidence\":0-1,\"reason\":\"short\"}.', 'LLM judge for AVD-DIFY-CFG-014', NULL, 0.10, 2000, 1, 0, '{\"seed\":\"dify_config_node_list\"}', NOW(), NOW()),
('l0cf1420-0014-4000-8000-000000000002', 'f0c10014-0014-4000-a014-000000000114', '检测提示：多源合并', 'detection_instruction', 'Flag list-operator receiving outputs from multiple document or session branches into one LLM prompt.', 'Secondary hint', NULL, 0.20, 1500, 1, 1, '{\"seed\":\"dify_config_node_list\"}', NOW(), NOW());
