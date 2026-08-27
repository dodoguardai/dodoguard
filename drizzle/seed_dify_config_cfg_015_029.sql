-- Dify Config：基于 docs/dify配置文件 中常见 DSL 模式的 15 条节点/策略面漏洞（AVD-DIFY-CFG-015 .. 029）
-- 覆盖：LLM、Tool、Assigner、knowledge-retrieval、if-else、template-transform、answer、marketplace、end、
--       secret-input、model-selector、vision、多 LLM 链、HTTP 重定向、agent 等维度（编号 CFG-015..029，与仓库内 CFG-001..014 不重复）。
--
-- 执行：在 MySQL schema 就绪后
--   mysql ... < drizzle/seed_dify_config_cfg_015_029.sql
--
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- vulnerabilities (15 rows)
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
  'f0c10015-0015-4000-a015-000000000115',
  'AVD-DIFY-CFG-015',
  'Dify Config: LLM 节点系统提示词与 chat_history 拼接形成提示注入面',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'DSL 中 llm 节点的 prompt_template 将 sys.query、conversation.chat_history 与宽松 system 指令拼接；缺少固定分隔符与不可变安全块时，用户可通过多轮对话覆盖或稀释安全策略（电信客服、意图识别等链路常见）。',
  NULL,
  '可能导致越狱、策略旁路或让模型执行非预期指令。',
  'CWE-74',
  NULL,
  'LLM01',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","llm","prompt-injection","chat_history"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-015',
  'dify',
  'Dify',
  'config',
  'static',
  'llm_prompt_concat_injection',
  'insufficient_input_handling',
  'config_audit',
  0.81,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10016-0016-4000-a016-000000000116',
  'AVD-DIFY-CFG-016',
  'Dify Config: Tool 节点由 LLM 填参且缺少边界校验',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  '导出中出现 type: tool 且参数绑定为 mixed/constant 与变量混排；若上游 LLM 可直接影响工具实参，则存在工具调用注入、越权参数或非预期副作用（投标助手、安全评估智能体等大量使用工具）。',
  NULL,
  '恶意输入可触发错误工具、过量调用或向外部系统写入危险载荷。',
  'CWE-20',
  NULL,
  'LLM07',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","tool","agent-tools","injection"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-016',
  'dify',
  'Dify',
  'config',
  'static',
  'tool_param_llm_binding',
  'excessive_agency',
  'config_audit',
  0.83,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10017-0017-4000-a017-000000000117',
  'AVD-DIFY-CFG-017',
  'Dify Config: Assigner 将用户可控内容写入会话变量',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'assigner 节点将 sys.query 或上游输出 append 到 conversation.chat_history 等会话态；若未限制长度与内容类型，可导致会话污染、间接提示注入或后续节点误信伪造「历史」。',
  NULL,
  '破坏对话完整性与安全策略继承，扩大后续 LLM/工具的攻击面。',
  'CWE-20',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","assigner","session","poisoning"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-017',
  'dify',
  'Dify',
  'config',
  'static',
  'assigner_session_poisoning',
  'unsafe_state_management',
  'config_audit',
  0.74,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10018-0018-4000-a018-000000000118',
  'AVD-DIFY-CFG-018',
  'Dify Config: knowledge-retrieval 高 top_k 或弱阈值导致过度召回',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'knowledge-retrieval 节点在 DSL 中未体现保守的 score_threshold、metadata 过滤或合理 top_k；易将大量片段甚至跨租户知识拼入上下文（与 CFG-005 互补：侧重数值/阈值与召回范围）。',
  NULL,
  '敏感文档片段过度进入模型回复与用户可见输出。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","knowledge-retrieval","top_k","rerank"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-018',
  'dify',
  'Dify',
  'config',
  'static',
  'retrieval_over_recall',
  'missing_data_scoping',
  'config_audit',
  0.76,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10019-0019-4000-a019-000000000119',
  'AVD-DIFY-CFG-019',
  'Dify Config: if-else 条件仅基于弱匹配易被对抗样本绕过',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'if-else 节点依赖关键词或简单变量比较时，攻击者可用同义改写、编码或嵌套从句绕过「拒答/人工」分支，使流量进入宽松 LLM 或工具子图（合同对比、客服分流 DSL 常见）。',
  NULL,
  '安全与合规策略在分支层失效，导致越权回答或工具暴露。',
  'CWE-863',
  NULL,
  'LLM01',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","if-else","routing","bypass"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-019',
  'dify',
  'Dify',
  'config',
  'static',
  'if_else_weak_predicate',
  'insufficient_access_control',
  'config_audit',
  0.75,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10020-0020-4000-a020-000000000120',
  'AVD-DIFY-CFG-020',
  'Dify Config: template-transform 拼接敏感上下文进可执行模板',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'template-transform 将多路变量与文档片段拼成下游提示或 JSON；若模板含未转义占位与用户可控片段，易造成信息过度聚合、间接注入或把密钥/PII 写入可日志化中间态（合同修改对比类工作流常见）。',
  NULL,
  '敏感字段进入错误消费者节点或被日志记录；下游 LLM 误用拼接结果。',
  'CWE-74',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","template-transform","ssti","aggregation"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-020',
  'dify',
  'Dify',
  'config',
  'static',
  'template_transform_injection',
  'insufficient_input_handling',
  'config_audit',
  0.78,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10021-0021-4000-a021-000000000121',
  'AVD-DIFY-CFG-021',
  'Dify Config: Answer 节点直接透出 LLM/工具原始输出',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'answer 节点未配置输出策略或后处理时，将把上游 LLM、工具或知识检索的原文直接返回终端用户，包含内部推理痕迹、工具错误栈或检索片段中的敏感片段。',
  NULL,
  '信息泄露、帮助攻击者推断内网与数据结构。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","answer","output-filter","leakage"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-021',
  'dify',
  'Dify',
  'config',
  'static',
  'answer_unfiltered_output',
  'missing_output_controls',
  'config_audit',
  0.72,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10022-0022-4000-a022-000000000122',
  'AVD-DIFY-CFG-022',
  'Dify Config: 应用声明 marketplace 类型插件依赖扩大供应链面',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '导出 YAML 顶层或依赖段出现 type: marketplace 的插件声明；若未与组织制品库对齐，则运行时可能拉取社区更新，引入未审计代码路径。',
  NULL,
  '供应链篡改或恶意版本进入生产租户工作流。',
  'CWE-829',
  NULL,
  'LLM03',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","marketplace","supply-chain","plugin"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-022',
  'dify',
  'Dify',
  'config',
  'static',
  'marketplace_dependency_surface',
  'third_party_trust_boundary',
  'config_audit',
  0.77,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10023-0023-4000-a023-000000000123',
  'AVD-DIFY-CFG-023',
  'Dify Config: 多 end 出口导致异常路径与主路径安全策略不一致',
  'dify',
  'Dify Config',
  'low',
  NULL,
  'confirmed',
  NULL,
  '工作流存在多个 type: end 或分散结束点；若仅主路径配置审查/日志，而异常或短路分支直接 end，可能造成审计缺口与不一致的内容策略。',
  NULL,
  '合规证据链不完整；部分用户绕过监控。',
  'CWE-754',
  NULL,
  'LLM09',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","end","workflow","audit"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-023',
  'dify',
  'Dify',
  'config',
  'static',
  'multi_end_inconsistent_policy',
  'missing_observability',
  'config_audit',
  0.65,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10024-0024-4000-a024-000000000124',
  'AVD-DIFY-CFG-024',
  'Dify Config: Start 中 secret-input 仍可能进入提示词或日志',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'Start 变量含 secret-input 类型时，若下游 prompt 模板、调试日志或错误回显未排除该变量，仍可能造成密钥类数据在模型上下文或运维侧泄露。',
  NULL,
  '凭据与密钥暴露给模型提供方或日志系统。',
  'CWE-532',
  NULL,
  'LLM07',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","secret-input","credential","start"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-024',
  'dify',
  'Dify',
  'config',
  'static',
  'secret_input_prompt_leak',
  'unsafe_configuration_storage',
  'config_audit',
  0.84,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10025-0025-4000-a025-000000000125',
  'AVD-DIFY-CFG-025',
  'Dify Config: model-selector 允许终端切换未审批模型',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  'Start 或表单中存在 model-selector 类型变量且直连 LLM 节点时，终端用户可能选择组织未批准的模型或更高温度，绕过数据驻留与内容安全基线。',
  NULL,
  '模型行为不可控、数据跨境或合规违约。',
  'CWE-284',
  NULL,
  'LLM02',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","model-selector","governance"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-025',
  'dify',
  'Dify',
  'config',
  'static',
  'model_selector_bypass',
  'unsafe_provider_selection',
  'config_audit',
  0.73,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10026-0026-4000-a026-000000000126',
  'AVD-DIFY-CFG-026',
  'Dify Config: LLM 开启 vision 处理敏感图像进入第三方推理',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'llm 节点 vision.enabled 为 true 且工作流处理证件、合同扫描件时，图像像素进入外部多模态 API，扩大数据出境与留存风险。',
  NULL,
  '敏感影像泄露给模型供应商；违反最小暴露与行业合规。',
  'CWE-200',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","vision","multimodal","privacy"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-026',
  'dify',
  'Dify',
  'config',
  'static',
  'vision_sensitive_images',
  'missing_data_scoping',
  'config_audit',
  0.80,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10027-0027-4000-a027-000000000127',
  'AVD-DIFY-CFG-027',
  'Dify Config: 链式多 LLM 节点重复放大上下文与敏感数据复制',
  'dify',
  'Dify Config',
  'medium',
  NULL,
  'confirmed',
  NULL,
  '同一工作流串联多个 llm 节点且共享 conversation 或长提示时，敏感片段在多处模型调用中重复出现，增加日志落盘、截屏与越权可见面（安全评估类长链路常见）。',
  NULL,
  '扩大泄露面与成本；更难做字段级脱敏。',
  'CWE-359',
  NULL,
  'LLM06',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","llm-chain","context","duplication"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-027',
  'dify',
  'Dify',
  'config',
  'static',
  'multi_llm_context_amplification',
  'missing_field_level_controls',
  'config_audit',
  0.71,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10028-0028-4000-a028-000000000128',
  'AVD-DIFY-CFG-028',
  'Dify Config: HTTP Request 节点允许重定向或未校验 TLS 增加 SSRF 与中间人风险',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  '与 CFG-003 互补：HTTP 工具若默认跟随重定向、接受 http:// 或信任任意证书，攻击者可将首次请求指向外域再 302 到内网或降级明文传输。',
  NULL,
  '扩大 SSRF 可达范围或嗅探敏感响应。',
  'CWE-918',
  NULL,
  'LLM05',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","http-request","redirect","ssrf"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-028',
  'dify',
  'Dify',
  'config',
  'static',
  'http_follow_redirect_hop',
  'network_policy_missing',
  'config_audit',
  0.82,
  NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'f0c10029-0029-4000-a029-000000000129',
  'AVD-DIFY-CFG-029',
  'Dify Config: Agent 节点工具集过大且缺少每步授权与预算',
  'dify',
  'Dify Config',
  'high',
  NULL,
  'confirmed',
  NULL,
  'type: agent（或等价编排）在 DSL 中绑定多工具与宽系统提示时，若缺少 max_iterations、工具白名单或人机确认，易出现过度调用、数据外传或任务漂移。',
  NULL,
  '自动化代理在单会话内造成大规模副作用或凭据滥用。',
  'CWE-862',
  NULL,
  'LLM07',
  NULL, NULL, NULL, NULL,
  '["dify","dify-config","agent","tools","excessive-agency"]',
  '{"source":"seed","surface":"Dify Config","ref":"docs/dify配置文件"}',
  NOW(), NOW(),
  NULL, NULL,
  'ADV-DIFY-CFG-029',
  'dify',
  'Dify',
  'config',
  'static',
  'agent_wide_tool_surface',
  'excessive_agency',
  'config_audit',
  0.85,
  NULL, NULL, NULL, NULL, NULL, NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = VALUES(`updated_at`);

-- ---------------------------------------------------------------------------
-- attack_commands, detection_rules, llm_review_instructions
-- ---------------------------------------------------------------------------

-- ========== 015 LLM prompt / chat_history ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1510-0015-4000-8000-000000000001', 'f0c10015-0015-4000-a015-000000000115', '【Config】安全指令可覆盖性', 'LLM 系统提示中是否包含不可变安全块（delimiter）且 chat_history 不可覆盖 system？', 'direct', '安全规则可被用户多轮话术稀释或覆盖。', '明确禁止覆盖 system 或采用分层 system+developer。', 'high', 1, '{"advId":"ADV-DIFY-CFG-015","seed":"dify_config_llm"}', NOW(), NOW()),
('e0cf1520-0015-4000-8000-000000000002', 'f0c10015-0015-4000-a015-000000000115', '【Config】历史注入', 'prompt 是否将 chat_history 与当前 query 无界拼接？', 'direct', '超长历史携带恶意指令进入模型。', '截断、摘要或隔离历史通道。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-015","seed":"dify_config_llm"}', NOW(), NOW()),
('e0cf1530-0015-4000-8000-000000000003', 'f0c10015-0015-4000-a015-000000000115', '【Config】对抗测试', '是否记录针对意图识别/客服链路的越狱短语测试结果？', 'direct', '无对抗测试记录。', '有红队用例与误用率监控。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-015","seed":"dify_config_llm"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1510-0015-4000-8000-000000000001', 'f0c10015-0015-4000-a015-000000000115', '【LLM】chat_history 占位(Keyword)', 'keyword', 'chat_history|conversation\\.chat_history|prompt_template|system', 'high', 0.82, 1, '{"advId":"ADV-DIFY-CFG-015"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf1520-0015-4000-8000-000000000002', 'f0c10015-0015-4000-a015-000000000115', '【LLM】type llm(Regex)', 'regex', '"type":\\s*llm|type:\\s*llm', 'medium', 0.70, 1, '{"advId":"ADV-DIFY-CFG-015"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1510-0015-4000-8000-000000000001', 'f0c10015-0015-4000-a015-000000000115', '判定 LLM 拼接注入面', 'system_prompt', 'You evaluate Dify YAML for llm nodes that concatenate chat_history with weak system boundaries. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge AVD-DIFY-CFG-015', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_llm"}', NOW(), NOW()),
('l0cf1520-0015-4000-8000-000000000002', 'f0c10015-0015-4000-a015-000000000115', '检测提示：历史与 system', 'detection_instruction', 'Flag dense chat_history injection into system prompts without fixed delimiters.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_llm"}', NOW(), NOW());

-- ========== 016 Tool ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1610-0016-4000-8000-000000000001', 'f0c10016-0016-4000-a016-000000000116', '【Config】工具参数绑定', 'tool 节点参数是否全部为 LLM 可变 mixed 且无 JSON schema 约束？', 'direct', '确认 LLM 可直接填任意工具参数。', '常量或强 schema 校验。', 'high', 1, '{"advId":"ADV-DIFY-CFG-016","seed":"dify_config_tool"}', NOW(), NOW()),
('e0cf1620-0016-4000-8000-000000000002', 'f0c10016-0016-4000-a016-000000000116', '【Config】工具副作用', '是否存在写外部系统、发邮件、转账类工具无二次确认？', 'direct', '有高副作用工具且无确认。', '仅只读工具或需人工批准。', 'high', 1, '{"advId":"ADV-DIFY-CFG-016","seed":"dify_config_tool"}', NOW(), NOW()),
('e0cf1630-0016-4000-8000-000000000003', 'f0c10016-0016-4000-a016-000000000116', '【Config】调用预算', '是否限制单轮/多轮工具调用次数？', 'direct', '无限制可刷接口。', 'max_iterations 或速率限制。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-016","seed":"dify_config_tool"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1610-0016-4000-8000-000000000001', 'f0c10016-0016-4000-a016-000000000116', '【Tool】mixed 参数(Keyword)', 'keyword', 'type:\\s*tool|"type":\\s*"tool"|mixed|tool_node_version', 'high', 0.84, 1, '{"advId":"ADV-DIFY-CFG-016"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf1620-0016-4000-8000-000000000002', 'f0c10016-0016-4000-a016-000000000116', '【Tool】provider 工具(Regex)', 'regex', 'langgenius/|plugin_id|tool_parameters', 'medium', 0.68, 1, '{"advId":"ADV-DIFY-CFG-016"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1610-0016-4000-8000-000000000001', 'f0c10016-0016-4000-a016-000000000116', '判定工具绑定风险', 'system_prompt', 'You evaluate Dify YAML for tool nodes where LLM-filled parameters lack schema or approval gates. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 016', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_tool"}', NOW(), NOW()),
('l0cf1620-0016-4000-8000-000000000002', 'f0c10016-0016-4000-a016-000000000116', '检测提示：mixed', 'detection_instruction', 'Flag tool parameters with type mixed bound from upstream LLM without validation.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_tool"}', NOW(), NOW());

-- ========== 017 Assigner ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1710-0017-4000-8000-000000000001', 'f0c10017-0017-4000-a017-000000000117', '【Config】写入源', 'assigner 是否将 sys.query 直接 append 到 chat_history？', 'direct', '用户可控内容进入持久会话变量。', '仅写入系统摘要或哈希。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-017","seed":"dify_config_assigner"}', NOW(), NOW()),
('e0cf1720-0017-4000-8000-000000000002', 'f0c10017-0017-4000-a017-000000000117', '【Config】长度与清洗', '是否限制 assigner 写入长度与禁止指令性前缀？', 'direct', '无长度上限。', '截断与内容策略。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-017","seed":"dify_config_assigner"}', NOW(), NOW()),
('e0cf1730-0017-4000-8000-000000000003', 'f0c10017-0017-4000-a017-000000000117', '【Config】隔离', '多用户场景下会话变量是否可能共享错误（若 DSL 暗示多租户）？', 'direct', '配置暗示共享状态风险。', '每用户隔离或 ephemeral。', 'low', 1, '{"advId":"ADV-DIFY-CFG-017","seed":"dify_config_assigner"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1710-0017-4000-8000-000000000001', 'f0c10017-0017-4000-a017-000000000117', '【Assigner】节点(Keyword)', 'keyword', 'type:\\s*assigner|"type":\\s*"assigner"|variable_selector|chat_history', 'medium', 0.78, 1, '{"advId":"ADV-DIFY-CFG-017"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf1720-0017-4000-8000-000000000002', 'f0c10017-0017-4000-a017-000000000117', '【Assigner】append(Regex)', 'regex', 'operation:\\s*append|write_mode:\\s*over-write', 'medium', 0.62, 1, '{"advId":"ADV-DIFY-CFG-017"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1710-0017-4000-8000-000000000001', 'f0c10017-0017-4000-a017-000000000117', '判定 assigner 污染', 'system_prompt', 'You evaluate Dify YAML for assigner nodes writing user queries into conversation state without controls. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 017', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_assigner"}', NOW(), NOW()),
('l0cf1720-0017-4000-8000-000000000002', 'f0c10017-0017-4000-a017-000000000117', '检测提示', 'detection_instruction', 'Flag assigner targeting chat_history with sys.query sources.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_assigner"}', NOW(), NOW());

-- ========== 018 knowledge-retrieval recall ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1810-0018-4000-8000-000000000001', 'f0c10018-0018-4000-a018-000000000118', '【Config】top_k 与阈值', '检索节点是否声明 top_k<=5 且 score_threshold 合理？', 'direct', 'top_k 很大或阈值为 0/缺失。', '保守 top_k 与元数据过滤。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-018","seed":"dify_config_kr"}', NOW(), NOW()),
('e0cf1820-0018-4000-8000-000000000002', 'f0c10018-0018-4000-a018-000000000118', '【Config】rerank', '是否启用 rerank 或 hybrid 降权？', 'direct', '纯向量大召回无精排。', 'rerank 或人工审核路径。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-018","seed":"dify_config_kr"}', NOW(), NOW()),
('e0cf1830-0018-4000-8000-000000000003', 'f0c10018-0018-4000-a018-000000000118', '【Config】租户隔离', 'metadata 过滤是否包含 tenant/org 维度？', 'direct', '无元数据过滤字段。', '强制 dataset 或 tag 过滤。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-018","seed":"dify_config_kr"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1810-0018-4000-8000-000000000001', 'f0c10018-0018-4000-a018-000000000118', '【KR】knowledge-retrieval(Keyword)', 'keyword', 'knowledge-retrieval|retriever_resource|top_k|score_threshold', 'medium', 0.80, 1, '{"advId":"ADV-DIFY-CFG-018"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf1820-0018-4000-8000-000000000002', 'f0c10018-0018-4000-a018-000000000118', '【KR】高 top_k(Regex)', 'regex', 'top_k:\\s*[1-9][0-9]{1,2}', 'medium', 0.55, 1, '{"advId":"ADV-DIFY-CFG-018"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1810-0018-4000-8000-000000000001', 'f0c10018-0018-4000-a018-000000000118', '判定检索过度召回', 'system_prompt', 'You evaluate Dify YAML for knowledge-retrieval with loose top_k or missing score_threshold/metadata filters. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 018', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_kr"}', NOW(), NOW()),
('l0cf1820-0018-4000-8000-000000000002', 'f0c10018-0018-4000-a018-000000000118', '检测提示', 'detection_instruction', 'Flag very high top_k or absent reranking in retrieval blocks.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_kr"}', NOW(), NOW());

-- ========== 019 if-else ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf1910-0019-4000-8000-000000000001', 'f0c10019-0019-4000-a019-000000000119', '【Config】分支谓词', 'if-else 条件是否仅关键词匹配而无 LLM 二次校验？', 'direct', '易绕过到高权限分支。', '语义分类器+人工兜底。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-019","seed":"dify_config_ifelse"}', NOW(), NOW()),
('e0cf1920-0019-4000-8000-000000000002', 'f0c10019-0019-4000-a019-000000000119', '【Config】默认分支', '敏感路径是否有默认拒绝？', 'direct', '默认进入宽松分支。', '默认拒绝或转人工。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-019","seed":"dify_config_ifelse"}', NOW(), NOW()),
('e0cf1930-0019-4000-8000-000000000003', 'f0c10019-0019-4000-a019-000000000119', '【Config】对抗短语', '是否保存针对 if-else 的对抗测试集？', 'direct', '无记录。', '有对抗回归测试。', 'low', 1, '{"advId":"ADV-DIFY-CFG-019","seed":"dify_config_ifelse"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf1910-0019-4000-8000-000000000001', 'f0c10019-0019-4000-a019-000000000119', '【IfElse】节点(Keyword)', 'keyword', 'if-else|"type":\\s*if-else|conditions:', 'medium', 0.79, 1, '{"advId":"ADV-DIFY-CFG-019"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf1920-0019-4000-8000-000000000002', 'f0c10019-0019-4000-a019-000000000119', '【IfElse】多实例(Regex)', 'regex', 'if-else[\\s\\S]{0,800}if-else', 'medium', 0.60, 1, '{"advId":"ADV-DIFY-CFG-019"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf1910-0019-4000-8000-000000000001', 'f0c10019-0019-4000-a019-000000000119', '判定 if-else 绕过', 'system_prompt', 'You evaluate Dify YAML for if-else nodes that gate tools with weak string conditions. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 019', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_ifelse"}', NOW(), NOW()),
('l0cf1920-0019-4000-8000-000000000002', 'f0c10019-0019-4000-a019-000000000119', '检测提示', 'detection_instruction', 'Flag if-else edges to tool subgraphs without refuse branch.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_ifelse"}', NOW(), NOW());

-- ========== 020 template-transform ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2010-0020-4000-8000-000000000001', 'f0c10020-0020-4000-a020-000000000120', '【Config】模板变量', 'template-transform 是否混合用户输入与系统密钥占位？', 'direct', '同一模板拼接敏感与可控段。', '分层模板或脱敏后再拼。', 'high', 1, '{"advId":"ADV-DIFY-CFG-020","seed":"dify_config_tt"}', NOW(), NOW()),
('e0cf2020-0020-4000-8000-000000000002', 'f0c10020-0020-4000-a020-000000000120', '【Config】下游消费', '变换结果是否直接进入 answer 而无过滤？', 'direct', '无输出过滤。', '字段白名单输出。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-020","seed":"dify_config_tt"}', NOW(), NOW()),
('e0cf2030-0020-4000-8000-000000000003', 'f0c10020-0020-4000-a020-000000000120', '【Config】日志', '中间态是否声明不记入日志？', 'direct', '无说明。', '禁用原文日志。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-020","seed":"dify_config_tt"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2010-0020-4000-8000-000000000001', 'f0c10020-0020-4000-a020-000000000120', '【TT】template-transform(Keyword)', 'keyword', 'template-transform|"type":\\s*template-transform|{{#', 'high', 0.81, 1, '{"advId":"ADV-DIFY-CFG-020"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2020-0020-4000-8000-000000000002', 'f0c10020-0020-4000-a020-000000000120', '【TT】Jinja 风格(Regex)', 'regex', '\\{\\{#[^#]+#\\}\\}', 'medium', 0.66, 1, '{"advId":"ADV-DIFY-CFG-020"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2010-0020-4000-8000-000000000001', 'f0c10020-0020-4000-a020-000000000120', '判定模板变换风险', 'system_prompt', 'You evaluate Dify YAML for template-transform nodes concatenating sensitive and user-controlled fragments. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 020', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_tt"}', NOW(), NOW()),
('l0cf2020-0020-4000-8000-000000000002', 'f0c10020-0020-4000-a020-000000000120', '检测提示', 'detection_instruction', 'Flag {{#...#}} dense templates feeding answer without redaction.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_tt"}', NOW(), NOW());

-- ========== 021 answer ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2110-0021-4000-8000-000000000001', 'f0c10021-0021-4000-a021-000000000121', '【Config】原始输出', 'answer 是否引用工具 JSON 全量？', 'direct', '工具错误与内部 id 可见。', '字段映射与脱敏。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-021","seed":"dify_config_answer"}', NOW(), NOW()),
('e0cf2120-0021-4000-8000-000000000002', 'f0c10021-0021-4000-a021-000000000121', '【Config】推理痕迹', '是否禁止模型输出思维链？', 'direct', '可泄露 CoT。', '仅输出最终答案格式。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-021","seed":"dify_config_answer"}', NOW(), NOW()),
('e0cf2130-0021-4000-8000-000000000003', 'f0c10021-0021-4000-a021-000000000121', '【Config】检索片段', 'answer 是否直接展示检索片段？', 'direct', '整段 KB 文本输出。', '摘要或引用编号。', 'low', 1, '{"advId":"ADV-DIFY-CFG-021","seed":"dify_config_answer"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2110-0021-4000-8000-000000000001', 'f0c10021-0021-4000-a021-000000000121', '【Answer】节点(Keyword)', 'keyword', 'type:\\s*answer|"type":\\s*"answer"|直接回复', 'medium', 0.74, 1, '{"advId":"ADV-DIFY-CFG-021"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2120-0021-4000-8000-000000000002', 'f0c10021-0021-4000-a021-000000000121', '【Answer】variables(Regex)', 'regex', 'answer\\s*\\n[\\s\\S]{0,200}variables:', 'low', 0.58, 1, '{"advId":"ADV-DIFY-CFG-021"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2110-0021-4000-8000-000000000001', 'f0c10021-0021-4000-a021-000000000121', '判定 answer 泄露', 'system_prompt', 'You evaluate Dify YAML for answer nodes that pass through raw tool or LLM outputs. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 021', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_answer"}', NOW(), NOW()),
('l0cf2120-0021-4000-8000-000000000002', 'f0c10021-0021-4000-a021-000000000121', '检测提示', 'detection_instruction', 'Flag answer variables bound to full tool responses.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_answer"}', NOW(), NOW());

-- ========== 022 marketplace ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2210-0022-4000-8000-000000000001', 'f0c10022-0022-4000-a022-000000000122', '【Config】插件清单', '列出 YAML 中 marketplace 插件 id 与版本策略。', 'direct', '浮动版本或未锁定。', '精确版本+私有镜像。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-022","seed":"dify_config_mkt"}', NOW(), NOW()),
('e0cf2220-0022-4000-8000-000000000002', 'f0c10022-0022-4000-a022-000000000122', '【Config】审批', '插件是否在组织 CMDB 登记？', 'direct', '未登记。', '有审批记录。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-022","seed":"dify_config_mkt"}', NOW(), NOW()),
('e0cf2230-0022-4000-8000-000000000003', 'f0c10022-0022-4000-a022-000000000122', '【Config】更新策略', '是否禁止自动拉取 major？', 'direct', '自动接受最新。', 'pin + 人工升级。', 'low', 1, '{"advId":"ADV-DIFY-CFG-022","seed":"dify_config_mkt"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2210-0022-4000-8000-000000000001', 'f0c10022-0022-4000-a022-000000000122', '【Mkt】type marketplace(Keyword)', 'keyword', 'type:\\s*marketplace|type: marketplace', 'medium', 0.77, 1, '{"advId":"ADV-DIFY-CFG-022"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2220-0022-4000-8000-000000000002', 'f0c10022-0022-4000-a022-000000000122', '【Mkt】plugin 声明(Regex)', 'regex', 'plugin[_\\s-]*(id|unique)|dependencies:', 'medium', 0.60, 1, '{"advId":"ADV-DIFY-CFG-022"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2210-0022-4000-8000-000000000001', 'f0c10022-0022-4000-a022-000000000122', '判定 marketplace 风险', 'system_prompt', 'You evaluate Dify YAML for marketplace plugin dependencies without version pinning. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 022', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_mkt"}', NOW(), NOW()),
('l0cf2220-0022-4000-8000-000000000002', 'f0c10022-0022-4000-a022-000000000122', '检测提示', 'detection_instruction', 'Flag multiple marketplace entries without SBOM style version locks.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_mkt"}', NOW(), NOW());

-- ========== 023 end ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2310-0023-4000-8000-000000000001', 'f0c10023-0023-4000-a023-000000000123', '【Config】结束点数量', '工作流中 type: end 出现次数与审计覆盖是否一致？', 'direct', '多出口无统一审计。', '所有 end 等效记录。', 'low', 1, '{"advId":"ADV-DIFY-CFG-023","seed":"dify_config_end"}', NOW(), NOW()),
('e0cf2320-0023-4000-8000-000000000002', 'f0c10023-0023-4000-a023-000000000123', '【Config】异常路径', '错误分支是否直接 end 跳过日志？', 'direct', '静默结束。', '错误也记录。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-023","seed":"dify_config_end"}', NOW(), NOW()),
('e0cf2330-0023-4000-8000-000000000003', 'f0c10023-0023-4000-a023-000000000123', '【Config】策略一致', '各 end 前是否经过同一内容策略节点？', 'direct', '策略不一致。', '统一出口审查。', 'low', 1, '{"advId":"ADV-DIFY-CFG-023","seed":"dify_config_end"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2310-0023-4000-8000-000000000001', 'f0c10023-0023-4000-a023-000000000123', '【End】节点(Keyword)', 'keyword', 'type:\\s*end|"type":\\s*end', 'low', 0.68, 1, '{"advId":"ADV-DIFY-CFG-023"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2320-0023-4000-8000-000000000002', 'f0c10023-0023-4000-a023-000000000123', '【End】多实例(Regex)', 'regex', 'type:\\s*end[\\s\\S]{0,1200}type:\\s*end', 'low', 0.55, 1, '{"advId":"ADV-DIFY-CFG-023"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2310-0023-4000-8000-000000000001', 'f0c10023-0023-4000-a023-000000000123', '判定多 end 审计', 'system_prompt', 'You evaluate Dify YAML for multiple end nodes without uniform logging or policy gates. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 023', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_end"}', NOW(), NOW()),
('l0cf2320-0023-4000-8000-000000000002', 'f0c10023-0023-4000-a023-000000000123', '检测提示', 'detection_instruction', 'Flag shortcut paths to end that skip answer or logging nodes.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_end"}', NOW(), NOW());

-- ========== 024 secret-input ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2410-0024-4000-8000-000000000001', 'f0c10024-0024-4000-a024-000000000124', '【Config】密钥进提示', 'secret-input 变量是否出现在任何 LLM prompt 模板中？', 'direct', '密钥进入模型上下文。', '仅服务端工具使用，不进 LLM。', 'critical', 1, '{"advId":"ADV-DIFY-CFG-024","seed":"dify_config_secret"}', NOW(), NOW()),
('e0cf2420-0024-4000-8000-000000000002', 'f0c10024-0024-4000-a024-000000000124', '【Config】调试', '是否声明关闭调试回显 secret？', 'direct', '调试可能打印。', '生产禁用 debug。', 'high', 1, '{"advId":"ADV-DIFY-CFG-024","seed":"dify_config_secret"}', NOW(), NOW()),
('e0cf2430-0024-4000-8000-000000000003', 'f0c10024-0024-4000-a024-000000000124', '【Config】命名', '变量名是否泄露用途（如 api_key）？', 'direct', '高信号名称进日志键名。', '中性命名+哈希引用。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-024","seed":"dify_config_secret"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2410-0024-4000-8000-000000000001', 'f0c10024-0024-4000-a024-000000000124', '【Secret】secret-input(Keyword)', 'keyword', 'secret-input|"type":\\s*secret-input', 'high', 0.86, 1, '{"advId":"ADV-DIFY-CFG-024"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2420-0024-4000-8000-000000000002', 'f0c10024-0024-4000-a024-000000000124', '【Secret】进 prompt(Regex)', 'regex', 'secret[^\\n]{0,80}prompt_template|prompt_template[^\\n]{0,120}secret', 'high', 0.70, 1, '{"advId":"ADV-DIFY-CFG-024"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2410-0024-4000-8000-000000000001', 'f0c10024-0024-4000-a024-000000000124', '判定 secret 泄露', 'system_prompt', 'You evaluate Dify YAML for secret-input variables referenced in LLM prompts or logs. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 024', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_secret"}', NOW(), NOW()),
('l0cf2420-0024-4000-8000-000000000002', 'f0c10024-0024-4000-a024-000000000124', '检测提示', 'detection_instruction', 'Flag any {{#...#}} block that includes secret-input selectors.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_secret"}', NOW(), NOW());

-- ========== 025 model-selector ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2510-0025-4000-8000-000000000001', 'f0c10025-0025-4000-a025-000000000125', '【Config】可选模型列表', 'model-selector 是否包含非 approved 模型？', 'direct', '列表含外域模型。', '仅白名单 id。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-025","seed":"dify_config_ms"}', NOW(), NOW()),
('e0cf2520-0025-4000-8000-000000000002', 'f0c10025-0025-4000-a025-000000000125', '【Config】绑定 LLM', '选择器是否直连生产 LLM 而无审批？', 'direct', '用户可切模型。', '固定模型或管理员锁。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-025","seed":"dify_config_ms"}', NOW(), NOW()),
('e0cf2530-0025-4000-8000-000000000003', 'f0c10025-0025-4000-a025-000000000125', '【Config】默认值', '默认选项是否为最强/最贵模型？', 'direct', '默认高风险。', '默认安全基线模型。', 'low', 1, '{"advId":"ADV-DIFY-CFG-025","seed":"dify_config_ms"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2510-0025-4000-8000-000000000001', 'f0c10025-0025-4000-a025-000000000125', '【MS】model-selector(Keyword)', 'keyword', 'model-selector|"type":\\s*model-selector', 'medium', 0.80, 1, '{"advId":"ADV-DIFY-CFG-025"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2520-0025-4000-8000-000000000002', 'f0c10025-0025-4000-a025-000000000125', '【MS】provider 列表(Regex)', 'regex', 'provider:\\s*langgenius/[^\\s]+', 'medium', 0.62, 1, '{"advId":"ADV-DIFY-CFG-025"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2510-0025-4000-8000-000000000001', 'f0c10025-0025-4000-a025-000000000125', '判定 model-selector 风险', 'system_prompt', 'You evaluate Dify YAML for model-selector variables exposing unapproved providers to end users. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 025', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_ms"}', NOW(), NOW()),
('l0cf2520-0025-4000-8000-000000000002', 'f0c10025-0025-4000-a025-000000000125', '检测提示', 'detection_instruction', 'Flag model-selector wired to LLM without admin-only lock.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_ms"}', NOW(), NOW());

-- ========== 026 vision ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2610-0026-4000-8000-000000000001', 'f0c10026-0026-4000-a026-000000000126', '【Config】vision 开关', 'llm 节点 vision.enabled 是否为 true？', 'direct', '多模态开启且业务敏感。', 'vision 关闭或本地 OCR。', 'high', 1, '{"advId":"ADV-DIFY-CFG-026","seed":"dify_config_vision"}', NOW(), NOW()),
('e0cf2620-0026-4000-8000-000000000002', 'f0c10026-0026-4000-a026-000000000126', '【Config】数据出境', '是否声明图像不传第三方？', 'direct', '无声明。', '合同约束+DLP。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-026","seed":"dify_config_vision"}', NOW(), NOW()),
('e0cf2630-0026-4000-8000-000000000003', 'f0c10026-0026-4000-a026-000000000126', '【Config】脱敏', '是否在入模前打码证件号？', 'direct', '无打码流程。', '区域裁剪或哈希。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-026","seed":"dify_config_vision"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2610-0026-4000-8000-000000000001', 'f0c10026-0026-4000-a026-000000000126', '【Vision】enabled(Keyword)', 'keyword', 'vision:\\s*\\n\\s*enabled:\\s*true|"vision"[\\s\\S]{0,80}enabled:\\s*true', 'high', 0.83, 1, '{"advId":"ADV-DIFY-CFG-026"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2620-0026-4000-8000-000000000002', 'f0c10026-0026-4000-a026-000000000126', '【Vision】llm 块(Regex)', 'regex', 'type:\\s*llm[\\s\\S]{0,600}vision:', 'medium', 0.65, 1, '{"advId":"ADV-DIFY-CFG-026"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2610-0026-4000-8000-000000000001', 'f0c10026-0026-4000-a026-000000000126', '判定 vision 风险', 'system_prompt', 'You evaluate Dify YAML for llm nodes with vision enabled on sensitive document workflows. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 026', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_vision"}', NOW(), NOW()),
('l0cf2620-0026-4000-8000-000000000002', 'f0c10026-0026-4000-a026-000000000126', '检测提示', 'detection_instruction', 'Flag vision enabled near document-extractor or file inputs.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_vision"}', NOW(), NOW());

-- ========== 027 multi LLM ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2710-0027-4000-8000-000000000001', 'f0c10027-0027-4000-a027-000000000127', '【Config】LLM 计数', '单工作流中 type: llm 出现次数是否>3？', 'direct', '长链重复敏感上下文。', '合并为单调用或摘要节点。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-027","seed":"dify_config_chain"}', NOW(), NOW()),
('e0cf2720-0027-4000-8000-000000000002', 'f0c10027-0027-4000-a027-000000000127', '【Config】上下文传递', '是否每步传递全文而非摘要？', 'direct', '全文复制多节点。', '中间摘要与字段投影。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-027","seed":"dify_config_chain"}', NOW(), NOW()),
('e0cf2730-0027-4000-8000-000000000003', 'f0c10027-0027-4000-a027-000000000127', '【Config】日志', '多节点是否增加日志落盘量？', 'direct', '无控制。', '按节点脱敏日志。', 'low', 1, '{"advId":"ADV-DIFY-CFG-027","seed":"dify_config_chain"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2710-0027-4000-8000-000000000001', 'f0c10027-0027-4000-a027-000000000127', '【Chain】多 llm(Regex)', 'regex', '(type:\\s*llm|"type":\\s*"llm")', 'medium', 0.55, 1, '{"advId":"ADV-DIFY-CFG-027"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2720-0027-4000-8000-000000000002', 'f0c10027-0027-4000-a027-000000000127', '【Chain】长链路(Keyword)', 'keyword', '安全评估|智能体|多轮|评估报告', 'low', 0.50, 1, '{"advId":"ADV-DIFY-CFG-027"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2710-0027-4000-8000-000000000001', 'f0c10027-0027-4000-a027-000000000127', '判定多 LLM 放大', 'system_prompt', 'You evaluate Dify YAML for many sequential llm nodes duplicating sensitive context. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 027', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_chain"}', NOW(), NOW()),
('l0cf2720-0027-4000-8000-000000000002', 'f0c10027-0027-4000-a027-000000000127', '检测提示', 'detection_instruction', 'Count llm nodes and flag if more than three with shared chat_history.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_chain"}', NOW(), NOW());

-- ========== 028 HTTP redirect ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2810-0028-4000-8000-000000000001', 'f0c10028-0028-4000-a028-000000000128', '【Config】重定向', 'HTTP 节点是否允许跟随重定向到任意 Location？', 'direct', '可 302 到内网。', '禁止重定向或限制 hop。', 'high', 1, '{"advId":"ADV-DIFY-CFG-028","seed":"dify_config_http"}', NOW(), NOW()),
('e0cf2820-0028-4000-8000-000000000002', 'f0c10028-0028-4000-a028-000000000128', '【Config】TLS', '是否允许 http:// 或关闭证书校验？', 'direct', '明文或信任任意证书。', '强制 HTTPS+校验。', 'high', 1, '{"advId":"ADV-DIFY-CFG-028","seed":"dify_config_http"}', NOW(), NOW()),
('e0cf2830-0028-4000-8000-000000000003', 'f0c10028-0028-4000-a028-000000000128', '【Config】响应体', '是否限制响应大小防数据渗出？', 'direct', '无限制。', '最大字节与超时。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-028","seed":"dify_config_http"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2810-0028-4000-8000-000000000001', 'f0c10028-0028-4000-a028-000000000128', '【HTTP】http-request(Keyword)', 'keyword', 'http-request|HTTP Request|follow_redirect|ssl_verify|verify', 'high', 0.80, 1, '{"advId":"ADV-DIFY-CFG-028"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2820-0028-4000-8000-000000000002', 'f0c10028-0028-4000-a028-000000000128', '【HTTP】http:// 明文(Regex)', 'regex', 'https?://[0-9\\.]+|http://localhost', 'high', 0.72, 1, '{"advId":"ADV-DIFY-CFG-028"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2810-0028-4000-8000-000000000001', 'f0c10028-0028-4000-a028-000000000128', '判定 HTTP 重定向风险', 'system_prompt', 'You evaluate Dify YAML for HTTP nodes that may follow redirects to internal hosts or disable TLS verification. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 028', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_http"}', NOW(), NOW()),
('l0cf2820-0028-4000-8000-000000000002', 'f0c10028-0028-4000-a028-000000000128', '检测提示', 'detection_instruction', 'Flag ssl_verify false or follow_redirect true with user-controlled URL.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_http"}', NOW(), NOW());

-- ========== 029 agent ==========
INSERT INTO `attack_commands` (`id`, `vulnerability_id`, `name`, `content`, `attack_mode`, `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`, `created_at`, `updated_at`) VALUES
('e0cf2910-0029-4000-8000-000000000001', 'f0c10029-0029-4000-a029-000000000129', '【Config】工具白名单', 'agent 是否绑定最小工具集？', 'direct', '工具过多。', '仅只读+单用途。', 'high', 1, '{"advId":"ADV-DIFY-CFG-029","seed":"dify_config_agent"}', NOW(), NOW()),
('e0cf2920-0029-4000-8000-000000000002', 'f0c10029-0029-4000-a029-000000000129', '【Config】迭代上限', '是否配置 max_iterations 或步数上限？', 'direct', '无上限。', '严格上限+预算。', 'high', 1, '{"advId":"ADV-DIFY-CFG-029","seed":"dify_config_agent"}', NOW(), NOW()),
('e0cf2930-0029-4000-8000-000000000003', 'f0c10029-0029-4000-a029-000000000129', '【Config】人机确认', '写操作是否需人工批准？', 'direct', '自动写外部系统。', 'HITL 或二次确认。', 'medium', 1, '{"advId":"ADV-DIFY-CFG-029","seed":"dify_config_agent"}', NOW(), NOW());
INSERT INTO `detection_rules` (`id`, `vulnerability_id`, `name`, `type`, `pattern`, `severity`, `confidence`, `enabled`, `metadata`, `created_at`, `updated_at`, `rule_engine`, `match_target`, `selector`, `operator`, `expected_value`, `logic`, `depends_on_rules`, `negative_conditions`, `evidence_extractor`, `applies_to_platforms`, `applies_to_components`, `version_constraints`, `test_fixture_ids`) VALUES
('d0cf2910-0029-4000-8000-000000000001', 'f0c10029-0029-4000-a029-000000000129', '【Agent】节点(Keyword)', 'keyword', 'type:\\s*agent|"type":\\s*agent|max_iterations|agent_strategy', 'high', 0.82, 1, '{"advId":"ADV-DIFY-CFG-029"}', NOW(), NOW(), NULL, 'config_structure', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL),
('d0cf2920-0029-4000-8000-000000000002', 'f0c10029-0029-4000-a029-000000000129', '【Agent】多工具(Regex)', 'regex', 'tools?:\\s*\\[[\\s\\S]{0,2000}\\]', 'medium', 0.58, 1, '{"advId":"ADV-DIFY-CFG-029"}', NOW(), NOW(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '["dify"]', NULL, NULL, NULL);
INSERT INTO `llm_review_instructions` (`id`, `vulnerability_id`, `name`, `type`, `content`, `description`, `model`, `temperature`, `max_tokens`, `enabled`, `priority`, `metadata`, `created_at`, `updated_at`) VALUES
('l0cf2910-0029-4000-8000-000000000001', 'f0c10029-0029-4000-a029-000000000129', '判定 agent 过度代理', 'system_prompt', 'You evaluate Dify YAML for agent nodes with broad tool sets and missing iteration or approval limits. Output JSON: {"vulnerable":boolean,"confidence":0-1,"reason":"short"}.', 'LLM judge 029', NULL, 0.10, 2000, 1, 0, '{"seed":"dify_config_agent"}', NOW(), NOW()),
('l0cf2920-0029-4000-8000-000000000002', 'f0c10029-0029-4000-a029-000000000129', '检测提示', 'detection_instruction', 'Flag agent blocks listing more than two tools without HITL.', 'hint', NULL, 0.20, 1500, 1, 1, '{"seed":"dify_config_agent"}', NOW(), NOW());