ALTER TABLE vulnerabilities
  ADD COLUMN adv_id VARCHAR(50) NULL COMMENT 'APAIS/ADV 对外漏洞编号，与评估报告及测试库条目一致',
  ADD COLUMN platform_family VARCHAR(50) NULL COMMENT '平台族，如 dify、fastgpt，用于适配器与漏洞包筛选',
  ADD COLUMN platform_product VARCHAR(100) NULL COMMENT '具体产品或发行版名称（可选）',
  ADD COLUMN artifact_kind VARCHAR(50) NULL COMMENT '关联工件类型：api_response、config_dsl、graph、memory 等',
  ADD COLUMN detection_phase VARCHAR(20) NULL COMMENT '检测阶段：static、runtime、hybrid 等',
  ADD COLUMN vuln_subtype VARCHAR(100) NULL COMMENT '漏洞子类，用于细分统计与模板映射',
  ADD COLUMN root_cause_type VARCHAR(100) NULL COMMENT '根因分类，便于整改与知识库',
  ADD COLUMN verification_mode VARCHAR(20) NULL COMMENT '验证方式：llm_judge、rule、manual 等',
  ADD COLUMN default_confidence DECIMAL(3,2) NULL COMMENT '默认可信度 0.00-1.00，供 Finding 预填',
  ADD COLUMN aliases JSON NULL COMMENT '别名列表，用于检索与同义匹配',
  ADD COLUMN framework_mappings JSON NULL COMMENT 'OWASP/MITRE/APAIS 等框架映射 JSON',
  ADD COLUMN preconditions JSON NULL COMMENT '触发漏洞的前置条件',
  ADD COLUMN trigger_conditions JSON NULL COMMENT '触发条件结构化描述',
  ADD COLUMN report_profile JSON NULL COMMENT '报告渲染画像：章节、字段、严重度展示策略',
  ADD COLUMN fingerprint VARCHAR(255) NULL COMMENT '漏洞指纹或归一化键，用于去重';

ALTER TABLE vulnerabilities
  ADD UNIQUE KEY vulnerabilities_adv_id_uk (adv_id),
  ADD KEY vulnerabilities_platform_family_idx (platform_family),
  ADD KEY vulnerabilities_artifact_kind_idx (artifact_kind);

ALTER TABLE detection_rules
  ADD COLUMN rule_engine VARCHAR(50) NULL COMMENT '规则引擎标识：regex、jsonpath、cel 等（遗留路径可保留）',
  ADD COLUMN match_target VARCHAR(50) NULL COMMENT '匹配目标：response_body、config_node、graph_edge 等',
  ADD COLUMN selector TEXT NULL COMMENT '选择器表达式或路径',
  ADD COLUMN operator VARCHAR(30) NULL COMMENT '比较算子：eq、contains、matches 等',
  ADD COLUMN expected_value TEXT NULL COMMENT '期望比对值或阈值说明',
  ADD COLUMN logic VARCHAR(20) NULL COMMENT '与同漏洞多规则组合时的逻辑：and、or',
  ADD COLUMN depends_on_rules JSON NULL COMMENT '依赖的其他规则 ID 列表',
  ADD COLUMN negative_conditions JSON NULL COMMENT '否定条件，用于减少误报',
  ADD COLUMN evidence_extractor JSON NULL COMMENT '从命中结果抽取证据字段的配置',
  ADD COLUMN applies_to_platforms JSON NULL COMMENT '适用的平台族白名单',
  ADD COLUMN applies_to_components JSON NULL COMMENT '适用的组件类型（如 tool、llm_node）',
  ADD COLUMN version_constraints JSON NULL COMMENT 'DSL/API 版本约束',
  ADD COLUMN test_fixture_ids JSON NULL COMMENT '关联的验证夹具 ID 列表';

ALTER TABLE attack_tasks
  ADD COLUMN task_type_id VARCHAR(36) NULL COMMENT '关联 task_types.id，标识产品化任务类型',
  ADD COLUMN platform_family VARCHAR(50) NULL COMMENT '目标平台族，与漏洞包一致',
  ADD COLUMN scan_mode VARCHAR(20) NULL COMMENT '扫描模式：static、runtime、hybrid',
  ADD COLUMN entrypoint_type VARCHAR(50) NULL COMMENT '入口类型：api、exported_dsl、file_upload 等',
  ADD COLUMN artifact_refs JSON NULL COMMENT '扫描输入工件引用（上传文件 ID、DSL 路径等）',
  ADD COLUMN judge_config JSON NULL COMMENT 'LLM 审查/Judge 模型与提示词等配置',
  ADD COLUMN report_preference JSON NULL COMMENT '报告偏好：模板、语言、受众、是否含附录',
  ADD COLUMN schedule_config JSON NULL COMMENT '定时或队列策略（预留）',
  ADD COLUMN retest_of_task_id VARCHAR(36) NULL COMMENT '复测来源任务 ID',
  ADD COLUMN baseline_task_id VARCHAR(36) NULL COMMENT '基线对比任务 ID';

ALTER TABLE attack_tasks
  ADD KEY attack_tasks_task_type_id_idx (task_type_id),
  ADD KEY attack_tasks_platform_family_idx (platform_family),
  ADD KEY attack_tasks_scan_mode_idx (scan_mode);

ALTER TABLE attack_results
  ADD COLUMN scan_run_id VARCHAR(36) NULL COMMENT '所属扫描运行 scan_runs.id',
  ADD COLUMN raw_result_type VARCHAR(30) NULL COMMENT '原始结果类型：api_round、static_rule、graph_hit 等',
  ADD COLUMN normalized_status VARCHAR(20) NULL COMMENT '归一化状态：pass、fail、inconclusive、error',
  ADD COLUMN platform_family VARCHAR(50) NULL COMMENT '结果所属平台族',
  ADD COLUMN artifact_id VARCHAR(36) NULL COMMENT '关联 scan_artifacts.id',
  ADD COLUMN evidence_summary JSON NULL COMMENT '证据摘要，供 Finding 归并',
  ADD COLUMN finding_candidate_key VARCHAR(255) NULL COMMENT 'Finding 去重候选键';

ALTER TABLE attack_results
  ADD KEY attack_results_scan_run_id_idx (scan_run_id),
  ADD KEY attack_results_normalized_status_idx (normalized_status);

ALTER TABLE reports
  ADD COLUMN report_run_id VARCHAR(36) NULL COMMENT '生成该报告的报告运行 report_runs.id',
  ADD COLUMN status VARCHAR(20) NULL DEFAULT 'draft' COMMENT '报告状态：draft、review、published、archived',
  ADD COLUMN version INT NOT NULL DEFAULT 1 COMMENT '报告版本号，同任务可多次导出递增',
  ADD COLUMN language VARCHAR(20) NULL DEFAULT 'zh-CN' COMMENT '报告语言：zh-CN、en-US 等',
  ADD COLUMN audience VARCHAR(30) NULL COMMENT '受众：technical、executive、audit 等',
  ADD COLUMN summary_json JSON NULL COMMENT '执行摘要与统计结构化数据',
  ADD COLUMN sections_json JSON NULL COMMENT '章节内容缓存或结构化块',
  ADD COLUMN source_finding_ids JSON NULL COMMENT '本报告涵盖的 finding_records.id 列表',
  ADD COLUMN source_scan_run_ids JSON NULL COMMENT '本报告涵盖的 scan_runs.id 列表',
  ADD COLUMN render_config JSON NULL COMMENT '渲染参数：模板变量、是否含附录',
  ADD COLUMN review_status VARCHAR(20) NULL DEFAULT 'unreviewed' COMMENT '评审状态：unreviewed、approved、rejected',
  ADD COLUMN approved_by VARCHAR(36) NULL COMMENT '审批人用户 ID',
  ADD COLUMN approved_at TIMESTAMP NULL COMMENT '审批时间',
  ADD COLUMN published_at TIMESTAMP NULL COMMENT '发布时间';

ALTER TABLE reports
  ADD KEY reports_status_idx (status),
  ADD KEY reports_report_run_id_idx (report_run_id);

CREATE TABLE IF NOT EXISTS task_types (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键 UUID',
  code VARCHAR(100) NOT NULL UNIQUE COMMENT '任务类型代码，如 dify_api_scan、dify_config_audit',
  name VARCHAR(255) NOT NULL COMMENT '展示名称',
  platform_family VARCHAR(50) NULL COMMENT '默认平台族',
  default_scan_mode VARCHAR(20) NULL COMMENT '默认扫描模式',
  default_report_type VARCHAR(50) NULL COMMENT '默认报告类型标识',
  description TEXT NULL COMMENT '说明与使用场景',
  config_schema JSON NULL COMMENT '创建任务表单的 JSON Schema（可选）',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否对租户开放',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务类型字典：产品化任务与扫描/报告默认行为';

CREATE TABLE IF NOT EXISTS task_type_report_bindings (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键 UUID',
  task_type_id VARCHAR(36) NOT NULL COMMENT '关联 task_types.id',
  template_id VARCHAR(36) NOT NULL COMMENT '关联 report_templates.id',
  report_type VARCHAR(50) NOT NULL COMMENT '报告子类型标识，用于多模板路由',
  default_format VARCHAR(10) NOT NULL DEFAULT 'md' COMMENT '默认导出格式：md、html、pdf',
  priority INT NOT NULL DEFAULT 0 COMMENT '同类型多模板时的优先级，越大越优先',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用该绑定',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  CONSTRAINT fk_ttrb_task_type FOREIGN KEY (task_type_id) REFERENCES task_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务类型与报告模板的绑定关系';

CREATE TABLE IF NOT EXISTS scan_runs (
  id VARCHAR(36) PRIMARY KEY COMMENT '单次扫描/审计运行 ID',
  task_id VARCHAR(36) NOT NULL COMMENT '关联 attack_tasks.id',
  platform_family VARCHAR(50) NULL COMMENT '本次运行的平台族',
  scan_mode VARCHAR(20) NULL COMMENT '本次运行模式',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '运行状态：pending、running、completed、failed、cancelled',
  scanner_version VARCHAR(50) NULL COMMENT '扫描器或引擎版本',
  started_at TIMESTAMP NULL COMMENT '开始时间',
  ended_at TIMESTAMP NULL COMMENT '结束时间',
  summary JSON NULL COMMENT '运行级统计与摘要',
  metadata JSON NULL COMMENT '扩展元数据',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  CONSTRAINT fk_scan_runs_task FOREIGN KEY (task_id) REFERENCES attack_tasks(id) ON DELETE CASCADE,
  KEY scan_runs_task_id_idx (task_id),
  KEY scan_runs_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描运行：一次可包含多类规则/工件处理';

CREATE TABLE IF NOT EXISTS scan_artifacts (
  id VARCHAR(36) PRIMARY KEY COMMENT '扫描输入或产出工件 ID',
  scan_run_id VARCHAR(36) NOT NULL COMMENT '关联 scan_runs.id',
  artifact_type VARCHAR(50) NOT NULL COMMENT '工件类型：dsl_yaml、export_zip、log 等',
  name VARCHAR(255) NOT NULL COMMENT '显示名称或文件名',
  path VARCHAR(500) NULL COMMENT '存储路径或对象键',
  checksum VARCHAR(128) NULL COMMENT '内容校验和',
  content_preview TEXT NULL COMMENT '内容预览（截断）',
  metadata JSON NULL COMMENT '大小、MIME、解析状态等',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CONSTRAINT fk_scan_artifacts_scan_run FOREIGN KEY (scan_run_id) REFERENCES scan_runs(id) ON DELETE CASCADE,
  KEY scan_artifacts_scan_run_id_idx (scan_run_id),
  KEY scan_artifacts_type_idx (artifact_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扫描工件：DSL、导出包、日志等';

CREATE TABLE IF NOT EXISTS finding_records (
  id VARCHAR(36) PRIMARY KEY COMMENT '归一化后的安全发现主键',
  organization_id VARCHAR(36) NOT NULL COMMENT '租户组织 ID',
  task_id VARCHAR(36) NULL COMMENT '关联 attack_tasks.id',
  scan_run_id VARCHAR(36) NULL COMMENT '关联 scan_runs.id',
  report_id VARCHAR(36) NULL COMMENT '可选关联 reports.id',
  vulnerability_id VARCHAR(36) NULL COMMENT '关联 vulnerabilities.id',
  platform_family VARCHAR(50) NULL COMMENT '平台族',
  title VARCHAR(255) NOT NULL COMMENT 'Finding 标题',
  severity VARCHAR(20) NOT NULL COMMENT '严重度：critical、high、medium、low、info',
  confidence DECIMAL(3,2) NULL COMMENT '置信度 0.00-1.00',
  status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT '状态：open、confirmed、false_positive、fixed 等',
  finding_type VARCHAR(30) NULL COMMENT '发现类型：config、api、memory、composite',
  summary TEXT NULL COMMENT '一句话摘要',
  description TEXT NULL COMMENT '详细描述',
  impact_analysis TEXT NULL COMMENT '影响分析',
  reproduction_conditions TEXT NULL COMMENT '复现条件说明',
  reproduction_steps JSON NULL COMMENT '复现步骤结构化',
  observations JSON NULL COMMENT '观测与 Judge 结论片段',
  root_cause TEXT NULL COMMENT '根因',
  remediation TEXT NULL COMMENT '修复建议',
  verification_notes TEXT NULL COMMENT '验证与复测说明',
  framework_mappings JSON NULL COMMENT '框架映射',
  source_result_ids JSON NULL COMMENT '来源 attack_results.id 列表',
  dedupe_key VARCHAR(255) NULL COMMENT '去重键',
  metadata JSON NULL COMMENT '扩展元数据',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY finding_records_task_id_idx (task_id),
  KEY finding_records_scan_run_id_idx (scan_run_id),
  KEY finding_records_vulnerability_id_idx (vulnerability_id),
  KEY finding_records_status_idx (status),
  KEY finding_records_severity_idx (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Finding：从原始结果归并后的最终发现项';

CREATE TABLE IF NOT EXISTS finding_evidence (
  id VARCHAR(36) PRIMARY KEY COMMENT '证据条目 ID',
  finding_id VARCHAR(36) NOT NULL COMMENT '关联 finding_records.id',
  evidence_type VARCHAR(50) NOT NULL COMMENT '证据类型：screenshot、snippet、request_response、rule_hit',
  title VARCHAR(255) NOT NULL COMMENT '证据标题',
  content TEXT NULL COMMENT '文本证据',
  content_json JSON NULL COMMENT '结构化证据',
  artifact_id VARCHAR(36) NULL COMMENT '关联 scan_artifacts.id',
  source_result_id VARCHAR(36) NULL COMMENT '关联 attack_results.id',
  is_redacted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已脱敏',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CONSTRAINT fk_finding_evidence_finding FOREIGN KEY (finding_id) REFERENCES finding_records(id) ON DELETE CASCADE,
  KEY finding_evidence_finding_id_idx (finding_id),
  KEY finding_evidence_type_idx (evidence_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Finding 级证据链';

CREATE TABLE IF NOT EXISTS report_runs (
  id VARCHAR(36) PRIMARY KEY COMMENT '报告生成运行 ID',
  task_id VARCHAR(36) NULL COMMENT '关联 attack_tasks.id',
  organization_id VARCHAR(36) NOT NULL COMMENT '租户组织 ID',
  template_id VARCHAR(36) NOT NULL COMMENT '使用的报告模板 ID',
  report_type VARCHAR(50) NOT NULL COMMENT '报告类型标识',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态：pending、running、completed、failed',
  input_finding_ids JSON NULL COMMENT '输入 Finding ID 列表',
  input_scan_run_ids JSON NULL COMMENT '输入扫描运行 ID 列表',
  render_context JSON NULL COMMENT '渲染上下文变量',
  output_report_id VARCHAR(36) NULL COMMENT '产出 reports.id',
  error_message TEXT NULL COMMENT '失败原因',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY report_runs_task_id_idx (task_id),
  KEY report_runs_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报告生成过程：一次运行产出一份或多份报告';

CREATE TABLE IF NOT EXISTS report_sections (
  id VARCHAR(36) PRIMARY KEY COMMENT '章节记录 ID',
  report_run_id VARCHAR(36) NOT NULL COMMENT '关联 report_runs.id',
  report_id VARCHAR(36) NULL COMMENT '关联 reports.id',
  section_key VARCHAR(100) NOT NULL COMMENT '章节键，对应模板占位',
  section_title VARCHAR(255) NOT NULL COMMENT '章节标题',
  content_md LONGTEXT NULL COMMENT 'Markdown 章节正文',
  content_json JSON NULL COMMENT '结构化章节内容',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
  status VARCHAR(20) NOT NULL DEFAULT 'generated' COMMENT '章节状态：generated、edited、skipped',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY report_sections_report_run_id_idx (report_run_id),
  KEY report_sections_report_id_idx (report_id),
  KEY report_sections_section_key_idx (section_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报告章节缓存，支持分块生成与增量更新';

CREATE TABLE IF NOT EXISTS config_signatures (
  id VARCHAR(36) PRIMARY KEY COMMENT '配置签名规则 ID',
  vulnerability_id VARCHAR(36) NOT NULL COMMENT '关联 vulnerabilities.id',
  platform_family VARCHAR(50) NOT NULL COMMENT '平台族',
  artifact_kind VARCHAR(50) NOT NULL COMMENT '工件类型：dsl、env、plugin_manifest 等',
  signature_type VARCHAR(30) NOT NULL COMMENT '签名类型：yaml_path、json_pointer 等',
  selector TEXT NOT NULL COMMENT '选择器或路径表达式',
  operator VARCHAR(30) NOT NULL COMMENT '比较算子',
  expected_value TEXT NULL COMMENT '期望值或模式',
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '权重，用于评分聚合',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY config_signatures_vulnerability_id_idx (vulnerability_id),
  KEY config_signatures_platform_idx (platform_family)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DSL/配置静态匹配签名，用于 Audit 阶段';

CREATE TABLE IF NOT EXISTS graph_detection_rules (
  id VARCHAR(36) PRIMARY KEY COMMENT '工作流图规则 ID',
  vulnerability_id VARCHAR(36) NOT NULL COMMENT '关联 vulnerabilities.id',
  platform_family VARCHAR(50) NOT NULL COMMENT '平台族',
  source_filter JSON NULL COMMENT '源节点过滤条件',
  edge_filter JSON NULL COMMENT '边过滤条件',
  target_filter JSON NULL COMMENT '目标节点过滤条件',
  path_max_depth INT NOT NULL DEFAULT 3 COMMENT '路径搜索最大深度',
  logic VARCHAR(20) NOT NULL DEFAULT 'and' COMMENT '路径与条件组合逻辑',
  severity_override VARCHAR(20) NULL COMMENT '命中时覆盖严重度',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY graph_detection_rules_vulnerability_id_idx (vulnerability_id),
  KEY graph_detection_rules_platform_idx (platform_family)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流图结构检测规则（多跳依赖、危险路径等）';

CREATE TABLE IF NOT EXISTS validation_fixtures (
  id VARCHAR(36) PRIMARY KEY COMMENT '验证夹具 ID',
  vulnerability_id VARCHAR(36) NOT NULL COMMENT '关联 vulnerabilities.id',
  fixture_type VARCHAR(30) NOT NULL COMMENT '夹具类型：positive、negative、regression',
  name VARCHAR(255) NOT NULL COMMENT '名称',
  content LONGTEXT NULL COMMENT '文本夹具内容',
  content_json JSON NULL COMMENT '结构化夹具',
  expected_outcome JSON NULL COMMENT '期望结果，用于自动化断言',
  phase VARCHAR(20) NOT NULL DEFAULT 'static' COMMENT '阶段：static、runtime',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  metadata JSON NULL COMMENT '扩展字段',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY validation_fixtures_vulnerability_id_idx (vulnerability_id),
  KEY validation_fixtures_fixture_type_idx (fixture_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='验证夹具：用于规则回归与任务组合测试';

INSERT INTO task_types (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111101', 'dify_config_audit', 'Dify 配置静态审计', 'dify', 'static', 'dify_config', 'Dify DSL / YAML 静态配置审计', TRUE
WHERE NOT EXISTS (SELECT 1 FROM task_types WHERE code = 'dify_config_audit');

INSERT INTO task_types (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111102', 'dify_api_scan', 'Dify API 扫描', 'dify', 'runtime', 'dify_api', 'Dify 发布面 / API 层扫描与验证', TRUE
WHERE NOT EXISTS (SELECT 1 FROM task_types WHERE code = 'dify_api_scan');

INSERT INTO task_types (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111103', 'dify_runtime_attack', 'Dify 运行时对抗', 'dify', 'runtime', 'dify_runtime', '运行时对抗与攻击指令执行', TRUE
WHERE NOT EXISTS (SELECT 1 FROM task_types WHERE code = 'dify_runtime_attack');

INSERT INTO task_types (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111104', 'dify_hybrid_assessment', 'Dify 混合评估', 'dify', 'hybrid', 'dify_full', '配置 + 运行时混合安全评估', TRUE
WHERE NOT EXISTS (SELECT 1 FROM task_types WHERE code = 'dify_hybrid_assessment');
