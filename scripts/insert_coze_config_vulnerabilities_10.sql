-- Coze 工作流/Chatflow 导出配置（YAML）静态漏洞种子：新增 10 条（CFG-009 .. CFG-018）
-- 与 drizzle/seed_coze_config_workflow_vulnerabilities.sql（001-008）互补，覆盖 intent / condition / output / NL2SQL / 插件 HTTP 等节点与配置面
-- 涉及表：vulnerabilities, attack_commands, llm_review_instructions, detection_rules
-- 参考：docs/coze配置文件/*.yaml、docs/coze-workflow-help-center-template-redacted.yaml、docs/fastgpt配置文件/fastgpt_workflow_vulns_seed.sql
--
-- 用法：mysql ... < scripts/insert_coze_config_vulnerabilities_10.sql

SET NAMES utf8mb4;

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- vulnerabilities: AVD-COZE-CFG-009 .. ADV-COZE-CFG-018
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
  'c0cfca09-0009-4000-a009-000000000009',
  'AVD-COZE-CFG-009',
  'Coze Config: 意图识别（intent）节点提示与用户输入边界不清',
  'coze',
  'Coze Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'intent 节点将用户 query 与历史拼入分类用 LLM；若 systemPrompt 未强调「用户文本不可作为指令」，攻击者可通过注入改变 classificationId 或 reason，导致后续分支错误。',
  NULL,
  '高风险请求被路由到宽松分支，或拒答/审核策略被系统性绕过。',
  'CWE-74',
  NULL,
  'LLM01',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","intent","classification","prompt-injection"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/gao_wx-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-009',
  'coze',
  'Coze',
  'config',
  'static',
  'intent_classifier_injection',
  'insufficient_input_handling',
  'config_audit',
  0.82,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0a-000a-4000-a00a-00000000000a',
  'AVD-COZE-CFG-010',
  'Coze Config: 选择器（condition）分支依赖上游 LLM 标量输出',
  'coze',
  'Coze Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'condition 节点将 branches 条件绑定到某 LLM 节点 output（如等于 \"1\"/\"2\"）。用户可通过提示注入操纵该标量，使本应走安全分支的请求进入弱约束或高权限工具链。',
  NULL,
  '访问控制与安全策略在图编排层被绕过，等效于「模型输出即 ACL」。',
  'CWE-863',
  NULL,
  'LLM01',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","condition","branch","authorization"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/coze_help_center_template_1_102-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-010',
  'coze',
  'Coze',
  'config',
  'static',
  'condition_branch_llm_acl',
  'insufficient_access_control',
  'config_audit',
  0.84,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0b-000b-4000-a00b-00000000000b',
  'AVD-COZE-CFG-011',
  'Coze Config: 输出（output）节点直传 {{output}} 未声明净化策略',
  'coze',
  'Coze Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'output 节点 content 使用字面量 `{{output}}` 等将上游 LLM 全文透出到会话/流式渠道；配置中未见 Markdown/HTML 净化或外链策略时，恶意模型或注入可导致钓鱼链接、误导性指令在用户侧展示。',
  NULL,
  '用户侧展示面被污染，辅助社工与跨渠道钓鱼。',
  'CWE-79',
  NULL,
  'LLM02',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","output","streaming","xss"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/coze_help_center_template_1_102-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-011',
  'coze',
  'Coze',
  'config',
  'static',
  'output_unfiltered_pass_through',
  'insecure_output_handling',
  'config_audit',
  0.76,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0c-000c-4000-a00c-00000000000c',
  'AVD-COZE-CFG-012',
  'Coze Config: LLM 节点关闭或未启用防泄漏（spAntiLeak）',
  'coze',
  'Coze Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '导出 YAML 中 llm 参数出现 spAntiLeak: false 或缺失平台推荐的隐私防护项时，系统提示、工具中间结果或内部标识更易被模型复述给用户。',
  NULL,
  '增加系统提示词、内部策略与敏感上下文字段泄露概率。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","llm","spAntiLeak","disclosure"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/gao_wx-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-012',
  'coze',
  'Coze',
  'config',
  'static',
  'llm_anti_leak_disabled',
  'unsafe_platform_defaults',
  'config_audit',
  0.72,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0d-000d-4000-a00d-00000000000d',
  'AVD-COZE-CFG-013',
  'Coze Config: settingOnError 超长超时与重试放大可用性风险',
  'coze',
  'Coze Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '多个节点 settingOnError.timeoutMs 配置为数十万毫秒级且 retryTimes>0 时，异常或恶意输入可放大队列阻塞与成本；错误路径还可能回显冗长诊断信息到下游 output。',
  NULL,
  '服务降级、配额耗尽、尾部节点错误信息泄露。',
  'CWE-400',
  NULL,
  'LLM10',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","timeout","retry","availability"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/coze_help_center_template_1_102-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-013',
  'coze',
  'Coze',
  'config',
  'static',
  'on_error_timeout_retry_abuse',
  'resource_exhaustion',
  'config_audit',
  0.68,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0e-000e-4000-a00e-00000000000e',
  'AVD-COZE-CFG-014',
  'Coze Config: 知识库启用 NL2SQL（useNl2sql）缺少表级约束描述',
  'coze',
  'Coze Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'knowledge 节点 useNl2sql: true 时，自然语言到 SQL 的生成链若未在配置或配套元数据中限定 schema/行级权限，易出现越权查询、批量导出或破坏性语句（视平台执行策略而定）。',
  NULL,
  '结构化业务数据越权访问或异常写操作风险上升。',
  'CWE-89',
  NULL,
  'LLM02',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","knowledge","nl2sql","sqli"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/coze_help_center_template_1_102-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-014',
  'coze',
  'Coze',
  'config',
  'static',
  'knowledge_nl2sql_scope',
  'dynamic_sql_without_scope',
  'config_audit',
  0.80,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca0f-000f-4000-a00f-00000000000f',
  'AVD-COZE-CFG-015',
  'Coze Config: 插件/HTTP 类工具 URL 或 host 绑定用户可控路径引用',
  'coze',
  'Coze Config',
  'critical',
  NULL,
  'confirmed',
  NULL,
  'plugin 节点 parameters 或 node_inputs 中将 HTTP endpoint、path、query 与上游用户字段拼接时，导出配置可观察到「URL 模板 + ref_node/BOT_USER_INPUT」模式，运行期易演变为 SSRF 或内网探测。',
  NULL,
  '内网资产探测、云元数据访问、将用户输入转为出站请求目标。',
  'CWE-918',
  NULL,
  'LLM05',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","plugin","http","ssrf"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze-workflow-help-center-template-redacted.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-015',
  'coze',
  'Coze',
  'config',
  'static',
  'plugin_http_url_user_controlled',
  'network_policy_missing',
  'config_audit',
  0.88,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca10-0010-4000-a010-000000000010',
  'AVD-COZE-CFG-016',
  'Coze Config: 多 LLM 串联末级直连插件无 schema 校验描述',
  'coze',
  'Coze Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  '工作流中存在「LLM → LLM → plugin」链，且前级 responseFormat 为 JSON/结构化输出时，若配置未体现 JSON Schema 校验或字段白名单，模型异常输出可污染插件入参（逻辑绕过或错误写操作）。',
  NULL,
  '工具调用参数不可信，导致错误业务动作或数据损坏。',
  'CWE-20',
  NULL,
  'LLM02',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","llm-chain","plugin","validation"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze-workflow-help-center-template-redacted.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-016',
  'coze',
  'Coze',
  'config',
  'static',
  'structured_llm_to_plugin_without_schema',
  'missing_input_validation',
  'config_audit',
  0.78,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca11-0011-4000-a011-000000000011',
  'AVD-COZE-CFG-017',
  'Coze Config: 起始节点会话键（如 CONVERSATION_NAME）进入下游可观察路径',
  'coze',
  'Coze Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'start 节点 node_outputs 暴露 CONVERSATION_NAME 等会话标识；若后续 code/plugin 将其写入外部系统日志或回显给用户，可能辅助会话猜测、关联与跨用户排查攻击（与运行时鉴权弱点组合时影响放大）。',
  NULL,
  '会话元数据过度外传，隐私与多租户隔离面扩大。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","start","session","metadata"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/coze_help_center_template_1_102-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-017',
  'coze',
  'Coze',
  'config',
  'static',
  'start_conversation_metadata_exposure',
  'excessive_data_exposure',
  'config_audit',
  0.70,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'c0cfca12-0012-4000-a012-000000000012',
  'AVD-COZE-CFG-018',
  'Coze Config: 结束节点 returnVariables 返回过多中间变量',
  'coze',
  'Coze Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'end 节点 terminatePlan: returnVariables 时，若上游将工具原始响应、调试字段或未脱敏结构一并挂入变量，导出配置显示宽返回面，运行期易向渠道泄露中间态数据。',
  NULL,
  '内部工具 JSON、错误栈片段、业务主键等通过 Bot 返回通道外泄。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["coze","coze-config","end","returnVariables","disclosure"]',
  '{"source":"seed","surface":"Coze Config","ref":"docs/coze配置文件/gao_wx-draft.yaml"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-COZE-CFG-018',
  'coze',
  'Coze',
  'config',
  'static',
  'end_return_variables_overbroad',
  'unsafe_data_export',
  'config_audit',
  0.74,
  NULL, NULL, NULL, NULL, NULL, NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

-- ========== CFG-009 intent ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca91-9110-4000-c009-000000000011', 'c0cfca09-0009-4000-a009-000000000009', '【Config】intent 直连用户文本', '是否存在 type: intent 且 prompt/value 含 {{query}}、BOT_USER_INPUT 或未隔离的 user 片段？', 'direct', '用户原文直接进入分类模型。', '仅使用哈希意图标签或服务端特征。', 'high', 1, '{"advId":"ADV-COZE-CFG-009","seed":"coze_cfg_intent"}', NOW(), NOW()),
('e0cfca92-9120-4000-c009-000000000012', 'c0cfca09-0009-4000-a009-000000000009', '【Config】分类可覆盖', 'systemPrompt 是否禁止「按用户要求选择类别」？', 'direct', '无防覆盖措辞。', '明确用户不得指定 classification。', 'medium', 1, '{"advId":"ADV-COZE-CFG-009","seed":"coze_cfg_intent"}', NOW(), NOW()),
('e0cfca93-9130-4000-c009-000000000013', 'c0cfca09-0009-4000-a009-000000000009', '【Config】输出类型', 'classificationId 是否为自由文本而非枚举？', 'direct', '宽输出类型。', '强 schema 枚举。', 'medium', 1, '{"advId":"ADV-COZE-CFG-009","seed":"coze_cfg_intent"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca91-9110-4000-d009-000000000021', 'c0cfca09-0009-4000-a009-000000000009', '【Intent】type intent(Keyword)', 'keyword', 'type:\\s*intent|意图识别|classificationId', 'high', 0.78, 1, '{"advId":"ADV-COZE-CFG-009"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca92-9120-4000-d009-000000000022', 'c0cfca09-0009-4000-a009-000000000009', '【Intent】mustache query(Regex)', 'regex', '\\{\\{\\s*query\\s*\\}\\}|BOT_USER_INPUT', 'high', 0.74, 1, '{"advId":"ADV-COZE-CFG-009"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca91-9110-4000-e009-000000000031', 'c0cfca09-0009-4000-a009-000000000009', '判定 intent 注入面', 'system_prompt', 'You evaluate Coze workflow YAML for intent nodes where user text is concatenated into classifier prompts without immutable policy boundaries. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-009', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_intent"}', NOW(), NOW()),
('l0cfca92-9120-4000-e009-000000000032', 'c0cfca09-0009-4000-a009-000000000009', '检测提示', 'detection_instruction', 'Flag intent nodes whose llmParam.prompt references raw user placeholders.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_intent"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-010 condition ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca01-0110-4000-c010-000000000011', 'c0cfca0a-000a-4000-a00a-00000000000a', '【Config】condition 绑 LLM', 'condition.branches 是否引用某 type:llm 的 output？', 'direct', 'ACL 依赖模型字符串。', '条件基于签名令牌或服务端状态。', 'high', 1, '{"advId":"ADV-COZE-CFG-010","seed":"coze_cfg_condition"}', NOW(), NOW()),
('e0cfca02-0120-4000-c010-000000000012', 'c0cfca0a-000a-4000-a00a-00000000000a', '【Config】比较值', 'right 侧是否为简单数字/短串常量？', 'direct', '易伪造单字符/数字。', '多因子或加密断言。', 'medium', 1, '{"advId":"ADV-COZE-CFG-010","seed":"coze_cfg_condition"}', NOW(), NOW()),
('e0cfca03-0130-4000-c010-000000000013', 'c0cfca0a-000a-4000-a00a-00000000000a', '【Config】否则分支', '是否所有敏感工具仅在「安全分支」且 else 不降级？', 'direct', 'else 仍触达工具。', '默认安全路径。', 'medium', 1, '{"advId":"ADV-COZE-CFG-010","seed":"coze_cfg_condition"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca01-0110-4000-d010-000000000021', 'c0cfca0a-000a-4000-a00a-00000000000a', '【Condition】选择器(Keyword)', 'keyword', 'type:\\s*condition|branches:|选择器', 'high', 0.76, 1, '{"advId":"ADV-COZE-CFG-010"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca02-0120-4000-d010-000000000022', 'c0cfca0a-000a-4000-a00a-00000000000a', '【Condition】ref_node llm(Regex)', 'regex', 'ref_node:\\s*\"[0-9]+\"[\\s\\S]{0,1200}type:\\s*llm', 'high', 0.70, 1, '{"advId":"ADV-COZE-CFG-010"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca01-0110-4000-e010-000000000031', 'c0cfca0a-000a-4000-a00a-00000000000a', '判定条件分支 ACL 风险', 'system_prompt', 'You evaluate Coze YAML where condition nodes branch on LLM string/numeric outputs that users might manipulate via prompt injection. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-010', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_condition"}', NOW(), NOW()),
('l0cfca02-0120-4000-e010-000000000032', 'c0cfca0a-000a-4000-a00a-00000000000a', '检测提示', 'detection_instruction', 'Map condition left.value.ref_node to node type; flag if source is llm.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_condition"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-011 output pass-through ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca11-1110-4000-c011-000000000011', 'c0cfca0b-000b-4000-a00b-00000000000b', '【Config】output 模板', 'output 节点 content 是否含 {{output}} 或等价变量直通？', 'direct', '全量模型文本出渠道。', '固定话术或脱敏模板。', 'medium', 1, '{"advId":"ADV-COZE-CFG-011","seed":"coze_cfg_output"}', NOW(), NOW()),
('e0cfca12-1120-4000-c011-000000000012', 'c0cfca0b-000b-4000-a00b-00000000000b', '【Config】流式', 'streamingOutput: true 是否缺少外链策略说明？', 'direct', '流式放大钓鱼触达。', '平台级 URL 安全策略。', 'medium', 1, '{"advId":"ADV-COZE-CFG-011","seed":"coze_cfg_output"}', NOW(), NOW()),
('e0cfca13-1130-4000-c011-000000000013', 'c0cfca0b-000b-4000-a00b-00000000000b', '【Config】历史写入', 'chatHistoryWriting 是否将中间输出写入长期历史？', 'direct', '污染会话记忆。', '仅终态写入。', 'low', 1, '{"advId":"ADV-COZE-CFG-011","seed":"coze_cfg_output"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca11-1110-4000-d011-000000000021', 'c0cfca0b-000b-4000-a00b-00000000000b', '【Output】type output(Keyword)', 'keyword', 'type:\\s*output|streamingOutput|chatHistoryWriting', 'medium', 0.72, 1, '{"advId":"ADV-COZE-CFG-011"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca12-1120-4000-d011-000000000022', 'c0cfca0b-000b-4000-a00b-00000000000b', '【Output】mustache output(Regex)', 'regex', '\\{\\{\\s*output\\s*\\}\\}', 'medium', 0.75, 1, '{"advId":"ADV-COZE-CFG-011"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca11-1110-4000-e011-000000000031', 'c0cfca0b-000b-4000-a00b-00000000000b', '判定 output 直传风险', 'system_prompt', 'You evaluate Coze YAML output nodes that stream or return raw LLM placeholders without documented sanitization for links/HTML. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-011', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_output"}', NOW(), NOW()),
('l0cfca12-1120-4000-e011-000000000032', 'c0cfca0b-000b-4000-a00b-00000000000b', '检测提示', 'detection_instruction', 'Find output nodes with {{output}} and streamingOutput true.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_output"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-012 spAntiLeak ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca21-1210-4000-c012-000000000011', 'c0cfca0c-000c-4000-a00c-00000000000c', '【Config】spAntiLeak', '任一路 llm 是否显式 spAntiLeak:\\s*false？', 'direct', '防泄漏关闭。', 'true 或缺省为平台安全默认。', 'medium', 1, '{"advId":"ADV-COZE-CFG-012","seed":"coze_cfg_antileak"}', NOW(), NOW()),
('e0cfca22-1220-4000-c012-000000000012', 'c0cfca0c-000c-4000-a00c-00000000000c', '【Config】systemPrompt 空', '主答复 llm 的 systemPrompt 是否为空或过短？', 'direct', '缺少最小安全基线。', '含明确禁止泄露内部提示。', 'medium', 1, '{"advId":"ADV-COZE-CFG-012","seed":"coze_cfg_antileak"}', NOW(), NOW()),
('e0cfca23-1230-4000-c012-000000000013', 'c0cfca0c-000c-4000-a00c-00000000000c', '【Config】工具回显', '是否声明工具原始 JSON 不得复述？', 'direct', '无工具输出边界。', '有 redaction 说明。', 'low', 1, '{"advId":"ADV-COZE-CFG-012","seed":"coze_cfg_antileak"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca21-1210-4000-d012-000000000021', 'c0cfca0c-000c-4000-a00c-00000000000c', '【LLM】spAntiLeak false(Regex)', 'regex', 'spAntiLeak\\s*:\\s*false', 'medium', 0.85, 1, '{"advId":"ADV-COZE-CFG-012"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca22-1220-4000-d012-000000000022', 'c0cfca0c-000c-4000-a00c-00000000000c', '【LLM】type llm(Keyword)', 'keyword', 'type:\\s*llm|systemPrompt', 'low', 0.55, 1, '{"advId":"ADV-COZE-CFG-012"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca21-1210-4000-e012-000000000031', 'c0cfca0c-000c-4000-a00c-00000000000c', '判定防泄漏配置', 'system_prompt', 'You evaluate Coze YAML llm nodes for spAntiLeak false or missing privacy controls paired with sensitive tool usage. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-012', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_antileak"}', NOW(), NOW()),
('l0cfca22-1220-4000-e012-000000000032', 'c0cfca0c-000c-4000-a00c-00000000000c', '检测提示', 'detection_instruction', 'Search for spAntiLeak false in any llmParam block.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_antileak"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-013 timeout / retry ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca31-1310-4000-c013-000000000011', 'c0cfca0d-000d-4000-a00d-00000000000d', '【Config】timeoutMs', '是否存在 timeoutMs >= 300000（5min）？', 'direct', '单节点长阻塞。', '分层超时与熔断。', 'medium', 1, '{"advId":"ADV-COZE-CFG-013","seed":"coze_cfg_timeout"}', NOW(), NOW()),
('e0cfca32-1320-4000-c013-000000000012', 'c0cfca0d-000d-4000-a00d-00000000000d', '【Config】retryTimes', 'retryTimes 是否大于 0 与长超时叠加？', 'direct', '重试放大成本。', '限次+指数退避。', 'medium', 1, '{"advId":"ADV-COZE-CFG-013","seed":"coze_cfg_timeout"}', NOW(), NOW()),
('e0cfca33-1330-4000-c013-000000000013', 'c0cfca0d-000d-4000-a00d-00000000000d', '【Config】错误透出', 'settingOnError 是否描述向用户返回详细错误？', 'direct', '冗长错误到 output。', '统一友好错误码。', 'low', 1, '{"advId":"ADV-COZE-CFG-013","seed":"coze_cfg_timeout"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca31-1310-4000-d013-000000000021', 'c0cfca0d-000d-4000-a00d-00000000000d', '【Error】长超时(Regex)', 'regex', 'timeoutMs:\\s*[5-9][0-9]{5,}|timeoutMs:\\s*[0-9]{7,}', 'medium', 0.70, 1, '{"advId":"ADV-COZE-CFG-013"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca32-1320-4000-d013-000000000022', 'c0cfca0d-000d-4000-a00d-00000000000d', '【Error】settingOnError(Keyword)', 'keyword', 'settingOnError|retryTimes|processType', 'low', 0.58, 1, '{"advId":"ADV-COZE-CFG-013"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca31-1310-4000-e013-000000000031', 'c0cfca0d-000d-4000-a00d-00000000000d', '判定超时重试风险', 'system_prompt', 'You evaluate Coze YAML for aggregated settingOnError with very large timeoutMs and retries across multiple nodes that could harm availability or leak verbose errors. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-013', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_timeout"}', NOW(), NOW()),
('l0cfca32-1320-4000-e013-000000000032', 'c0cfca0d-000d-4000-a00d-00000000000d', '检测提示', 'detection_instruction', 'Sum nodes with timeoutMs>300000 or retryTimes>0.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_timeout"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-014 useNl2sql ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca41-1410-4000-c014-000000000011', 'c0cfca0e-000e-4000-a00e-00000000000e', '【Config】useNl2sql', 'knowledge 节点是否 useNl2sql:\\s*true？', 'direct', '启用 NL2SQL。', 'false 或显式关闭。', 'high', 1, '{"advId":"ADV-COZE-CFG-014","seed":"coze_cfg_nl2sql"}', NOW(), NOW()),
('e0cfca42-1420-4000-c014-000000000012', 'c0cfca0e-000e-4000-a00e-00000000000e', '【Config】schema 约束', 'metadata 是否描述允许表/列白名单？', 'direct', '无范围说明。', '附 schema 绑定与 RLS 说明。', 'high', 1, '{"advId":"ADV-COZE-CFG-014","seed":"coze_cfg_nl2sql"}', NOW(), NOW()),
('e0cfca43-1430-4000-c014-000000000013', 'c0cfca0e-000e-4000-a00e-00000000000e', '【Config】只读', '是否声明只读 SQL 角色？', 'direct', '无只读声明。', '只读连接与语句类限制。', 'medium', 1, '{"advId":"ADV-COZE-CFG-014","seed":"coze_cfg_nl2sql"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca41-1410-4000-d014-000000000021', 'c0cfca0e-000e-4000-a00e-00000000000e', '【KB】useNl2sql(Regex)', 'regex', 'useNl2sql\\s*:\\s*true', 'high', 0.88, 1, '{"advId":"ADV-COZE-CFG-014"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca42-1420-4000-d014-000000000022', 'c0cfca0e-000e-4000-a00e-00000000000e', '【KB】knowledge node(Keyword)', 'keyword', 'type:\\s*knowledge|datasetParam', 'medium', 0.62, 1, '{"advId":"ADV-COZE-CFG-014"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca41-1410-4000-e014-000000000031', 'c0cfca0e-000e-4000-a00e-00000000000e', '判定 NL2SQL 范围', 'system_prompt', 'You evaluate Coze YAML knowledge nodes with useNl2sql true for missing documented schema scope, read-only roles, or row-level controls. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-014', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_nl2sql"}', NOW(), NOW()),
('l0cfca42-1420-4000-e014-000000000032', 'c0cfca0e-000e-4000-a00e-00000000000e', '检测提示', 'detection_instruction', 'When useNl2sql true, check for companion metadata describing allowed tables.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_nl2sql"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-015 plugin HTTP SSRF pattern ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca51-1510-4000-c015-000000000011', 'c0cfca0f-000f-4000-a00f-00000000000f', '【Config】URL 模板', 'plugin 参数是否出现 http:// 或 https:// 与 ref_node/BOT_USER_INPUT 同段？', 'direct', '用户可控出站目标。', '固定 host + 路径模板无用户段。', 'critical', 1, '{"advId":"ADV-COZE-CFG-015","seed":"coze_cfg_plugin_http"}', NOW(), NOW()),
('e0cfca52-1520-4000-c015-000000000012', 'c0cfca0f-000f-4000-a00f-00000000000f', '【Config】allowlist', 'metadata 是否声明 egress allowlist？', 'direct', '无出站白名单描述。', '有域名白名单与审计。', 'high', 1, '{"advId":"ADV-COZE-CFG-015","seed":"coze_cfg_plugin_http"}', NOW(), NOW()),
('e0cfca53-1530-4000-c015-000000000013', 'c0cfca0f-000f-4000-a00f-00000000000f', '【Config】内网', '是否禁止 127.0.0.1/169.254.169.254 等字面量示例？', 'direct', '无禁用说明。', '明确 SSRF 防护策略。', 'medium', 1, '{"advId":"ADV-COZE-CFG-015","seed":"coze_cfg_plugin_http"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca51-1510-4000-d015-000000000021', 'c0cfca0f-000f-4000-a00f-00000000000f', '【Plugin】http URL(Regex)', 'regex', 'https?://[\\s\\S]{0,800}ref_node|BOT_USER_INPUT[\\s\\S]{0,800}https?://', 'critical', 0.82, 1, '{"advId":"ADV-COZE-CFG-015"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca52-1520-4000-d015-000000000022', 'c0cfca0f-000f-4000-a00f-00000000000f', '【Plugin】type plugin(Keyword)', 'keyword', 'type:\\s*plugin|apiName|node_inputs', 'high', 0.68, 1, '{"advId":"ADV-COZE-CFG-015"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca51-1510-4000-e015-000000000031', 'c0cfca0f-000f-4000-a00f-00000000000f', '判定插件 HTTP SSRF 配置面', 'system_prompt', 'You evaluate Coze YAML plugin nodes where HTTP URLs combine with user-referenced inputs without documented egress controls. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-015', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_plugin_http"}', NOW(), NOW()),
('l0cfca52-1520-4000-e015-000000000032', 'c0cfca0f-000f-4000-a00f-00000000000f', '检测提示', 'detection_instruction', 'Trace plugin fields containing URLs to upstream user paths.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_plugin_http"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-016 LLM chain -> plugin ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca61-1610-4000-c016-000000000011', 'c0cfca10-0010-4000-a010-000000000010', '【Config】链长度', 'type:llm 出现次数是否>=2 且下游为 plugin？', 'direct', '结构化输出直灌工具。', '中间校验节点或 schema 节点。', 'high', 1, '{"advId":"ADV-COZE-CFG-016","seed":"coze_cfg_chain"}', NOW(), NOW()),
('e0cfca62-1620-4000-c016-000000000012', 'c0cfca10-0010-4000-a010-000000000010', '【Config】responseFormat', '是否使用 JSON/结构化 responseFormat 指向插件？', 'direct', '机器消费无契约。', 'JSON Schema 校验声明。', 'medium', 1, '{"advId":"ADV-COZE-CFG-016","seed":"coze_cfg_chain"}', NOW(), NOW()),
('e0cfca63-1630-4000-c016-000000000013', 'c0cfca10-0010-4000-a010-000000000010', '【Config】失败策略', '插件写操作失败是否可回滚？', 'direct', '无补偿说明。', '幂等键与回滚。', 'low', 1, '{"advId":"ADV-COZE-CFG-016","seed":"coze_cfg_chain"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca61-1610-4000-d016-000000000021', 'c0cfca10-0010-4000-a010-000000000010', '【Chain】llm then plugin(Regex)', 'regex', 'type:\\s*llm[\\s\\S]{0,4000}type:\\s*plugin', 'high', 0.72, 1, '{"advId":"ADV-COZE-CFG-016"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca62-1620-4000-d016-000000000022', 'c0cfca10-0010-4000-a010-000000000010', '【Chain】responseFormat(Keyword)', 'keyword', 'responseFormat|JSON|结构化', 'medium', 0.60, 1, '{"advId":"ADV-COZE-CFG-016"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca61-1610-4000-e016-000000000031', 'c0cfca10-0010-4000-a010-000000000010', '判定 LLM 链到插件校验缺失', 'system_prompt', 'You evaluate Coze YAML for sequential llm nodes feeding plugin inputs without documented JSON schema validation or allowlisted fields. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-016', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_chain"}', NOW(), NOW()),
('l0cfca62-1620-4000-e016-000000000032', 'c0cfca10-0010-4000-a010-000000000010', '检测提示', 'detection_instruction', 'Count llm nodes before first plugin; flag if >=2 and plugin is mutating API.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_chain"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-017 start session metadata ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca71-1710-4000-c017-000000000011', 'c0cfca11-0011-4000-a011-000000000011', '【Config】CONVERSATION_NAME', 'start 节点是否输出 CONVERSATION_NAME 并入 plugin/code？', 'direct', '会话键外传。', '仅服务端会话映射。', 'medium', 1, '{"advId":"ADV-COZE-CFG-017","seed":"coze_cfg_session"}', NOW(), NOW()),
('e0cfca72-1720-4000-c017-000000000012', 'c0cfca11-0011-4000-a011-000000000011', '【Config】日志字段', 'code 是否把会话名写入 records？', 'direct', '可关联多轮。', '匿名 session id。', 'medium', 1, '{"advId":"ADV-COZE-CFG-017","seed":"coze_cfg_session"}', NOW(), NOW()),
('e0cfca73-1730-4000-c017-000000000013', 'c0cfca11-0011-4000-a011-000000000011', '【Config】用户可见', '会话标识是否回显给用户消息体？', 'direct', '用户可见会话 token。', '不展示内部 id。', 'low', 1, '{"advId":"ADV-COZE-CFG-017","seed":"coze_cfg_session"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca71-1710-4000-d017-000000000021', 'c0cfca11-0011-4000-a011-000000000011', '【Start】CONVERSATION_NAME(Keyword)', 'keyword', 'CONVERSATION_NAME|conversation_name|node_outputs', 'medium', 0.74, 1, '{"advId":"ADV-COZE-CFG-017"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca72-1720-4000-d017-000000000022', 'c0cfca11-0011-4000-a011-000000000011', '【Start】type start(Regex)', 'regex', 'type:\\s*start', 'low', 0.55, 1, '{"advId":"ADV-COZE-CFG-017"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca71-1710-4000-e017-000000000031', 'c0cfca11-0011-4000-a011-000000000011', '判定会话元数据暴露', 'system_prompt', 'You evaluate Coze YAML where start node outputs like CONVERSATION_NAME flow into code/plugin/logging without minimization. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-017', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_session"}', NOW(), NOW()),
('l0cfca72-1720-4000-e017-000000000032', 'c0cfca11-0011-4000-a011-000000000011', '检测提示', 'detection_instruction', 'Track references from start outputs to external SaaS payloads.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_session"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

-- ========== CFG-018 end returnVariables ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cfca81-1810-4000-c018-000000000011', 'c0cfca12-0012-4000-a012-000000000012', '【Config】terminatePlan', 'end 节点是否为 returnVariables？', 'direct', '宽返回面。', '固定摘要字段。', 'medium', 1, '{"advId":"ADV-COZE-CFG-018","seed":"coze_cfg_end"}', NOW(), NOW()),
('e0cfca82-1820-4000-c018-000000000012', 'c0cfca12-0012-4000-a012-000000000012', '【Config】变量绑定', 'node_inputs 是否绑定多个上游含工具输出？', 'direct', '工具 JSON 可能出渠道。', '白名单输出键。', 'medium', 1, '{"advId":"ADV-COZE-CFG-018","seed":"coze_cfg_end"}', NOW(), NOW()),
('e0cfca83-1830-4000-c018-000000000013', 'c0cfca12-0012-4000-a012-000000000012', '【Config】敏感键名', '是否出现 debug|raw|trace 等命名？', 'direct', '调试态外泄。', '生产禁用调试变量。', 'low', 1, '{"advId":"ADV-COZE-CFG-018","seed":"coze_cfg_end"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cfca81-1810-4000-d018-000000000021', 'c0cfca12-0012-4000-a012-000000000012', '【End】returnVariables(Keyword)', 'keyword', 'terminatePlan:\\s*returnVariables|type:\\s*end', 'medium', 0.78, 1, '{"advId":"ADV-COZE-CFG-018"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL),
('d0cfca82-1820-4000-d018-000000000022', 'c0cfca12-0012-4000-a012-000000000012', '【End】ref_node 工具(Regex)', 'regex', 'ref_node:\\s*\"[0-9]+\"', 'low', 0.50, 1, '{"advId":"ADV-COZE-CFG-018"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["coze"]', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE `pattern` = VALUES(`pattern`), `updated_at` = VALUES(`updated_at`);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cfca81-1810-4000-e018-000000000031', 'c0cfca12-0012-4000-a012-000000000012', '判定 returnVariables 过宽', 'system_prompt', 'You evaluate Coze YAML end nodes using returnVariables that aggregate many upstream fields including potential tool raw payloads. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge CFG-018', NULL, 0.10, 2000, 1, 0, '{"seed":"coze_cfg_end"}', NOW(), NOW()),
('l0cfca82-1820-4000-e018-000000000032', 'c0cfca12-0012-4000-a012-000000000012', '检测提示', 'detection_instruction', 'List variables bound in end.parameters.node_inputs; flag wide tool outputs.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"coze_cfg_end"}', NOW(), NOW())
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`), `updated_at` = VALUES(`updated_at`);

COMMIT;
