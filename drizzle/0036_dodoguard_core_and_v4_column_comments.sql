ALTER TABLE vulnerabilities COMMENT='漏洞主数据：条目、严重度、框架映射及 v4 扩展字段';

ALTER TABLE vulnerabilities
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN avd_id VARCHAR(50) NOT NULL COMMENT '内部 AVD 编号，全局唯一',
  MODIFY COLUMN name VARCHAR(255) NOT NULL COMMENT '漏洞名称',
  MODIFY COLUMN type VARCHAR(20) NOT NULL COMMENT '类型：agent、mcp、llm、tool、platform',
  MODIFY COLUMN category VARCHAR(100) NULL COMMENT '分类标签',
  MODIFY COLUMN risk_level VARCHAR(20) NOT NULL COMMENT '风险等级：critical、high、medium、low',
  MODIFY COLUMN cvss_score DECIMAL(3,1) NULL COMMENT 'CVSS 分值 0.0-10.0',
  MODIFY COLUMN status VARCHAR(20) NOT NULL COMMENT '状态：discovered、confirmed、patched、archived',
  MODIFY COLUMN disclosed_at TIMESTAMP NULL COMMENT '披露时间',
  MODIFY COLUMN description TEXT NULL COMMENT '漏洞描述',
  MODIFY COLUMN affected_targets JSON NULL COMMENT '受影响目标结构化描述',
  MODIFY COLUMN impact_scope TEXT NULL COMMENT '影响范围',
  MODIFY COLUMN cwe_id VARCHAR(20) NULL COMMENT 'CWE 编号',
  MODIFY COLUMN mitre_id VARCHAR(50) NULL COMMENT 'MITRE ATLAS 等编号',
  MODIFY COLUMN owasp_id VARCHAR(50) NULL COMMENT 'OWASP 映射编号',
  MODIFY COLUMN owasp_llm_top10_mapping JSON NULL COMMENT 'OWASP LLM Top10 映射',
  MODIFY COLUMN adv_id VARCHAR(50) NULL COMMENT 'APAIS/ADV 对外漏洞编号',
  MODIFY COLUMN platform_family VARCHAR(50) NULL COMMENT '平台族',
  MODIFY COLUMN platform_product VARCHAR(100) NULL COMMENT '产品名称',
  MODIFY COLUMN artifact_kind VARCHAR(50) NULL COMMENT '关联工件类型',
  MODIFY COLUMN detection_phase VARCHAR(20) NULL COMMENT '检测阶段',
  MODIFY COLUMN vuln_subtype VARCHAR(100) NULL COMMENT '漏洞子类',
  MODIFY COLUMN root_cause_type VARCHAR(100) NULL COMMENT '根因类型',
  MODIFY COLUMN verification_mode VARCHAR(20) NULL COMMENT '验证方式',
  MODIFY COLUMN default_confidence DECIMAL(3,2) NULL COMMENT '默认可信度',
  MODIFY COLUMN aliases JSON NULL COMMENT '别名',
  MODIFY COLUMN framework_mappings JSON NULL COMMENT '多框架映射',
  MODIFY COLUMN preconditions JSON NULL COMMENT '前置条件',
  MODIFY COLUMN trigger_conditions JSON NULL COMMENT '触发条件',
  MODIFY COLUMN report_profile JSON NULL COMMENT '报告画像',
  MODIFY COLUMN fingerprint VARCHAR(255) NULL COMMENT '指纹/去重键',
  MODIFY COLUMN exploitability JSON NULL COMMENT '可利用性评估',
  MODIFY COLUMN patch_status JSON NULL COMMENT '补丁状态',
  MODIFY COLUMN audit_notes TEXT NULL COMMENT '审计备注',
  MODIFY COLUMN tags JSON NULL COMMENT '标签',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展元数据',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  MODIFY COLUMN created_by VARCHAR(36) NULL COMMENT '创建人用户 ID',
  MODIFY COLUMN updated_by VARCHAR(36) NULL COMMENT '更新人用户 ID';

ALTER TABLE attack_commands COMMENT='攻击指令/测试用例：挂载在漏洞下的可执行 payload 与期望';

ALTER TABLE attack_commands
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN vulnerability_id VARCHAR(36) NOT NULL COMMENT '关联 vulnerabilities.id',
  MODIFY COLUMN name VARCHAR(255) NOT NULL COMMENT '用例名称',
  MODIFY COLUMN content TEXT NOT NULL COMMENT '攻击内容或 Prompt',
  MODIFY COLUMN attack_mode VARCHAR(20) NOT NULL COMMENT '攻击模式：direct、mixed、conversation、composite',
  MODIFY COLUMN expected_success TEXT NULL COMMENT '攻击成功时期望现象（或 Judge 比对基准）',
  MODIFY COLUMN non_vulnerability TEXT NULL COMMENT '非漏洞/误报时的预期表现说明',
  MODIFY COLUMN risk_level VARCHAR(20) NULL COMMENT '用例级风险覆盖',
  MODIFY COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展：多轮、文件参数等',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE detection_rules COMMENT='检测规则（遗留/辅助）：可与 LLM Judge 并存，表保留';

ALTER TABLE detection_rules
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN vulnerability_id VARCHAR(36) NOT NULL COMMENT '关联 vulnerabilities.id',
  MODIFY COLUMN name VARCHAR(255) NOT NULL COMMENT '规则名称',
  MODIFY COLUMN type VARCHAR(50) NOT NULL COMMENT '规则类型：regex、keyword、json_schema、llm 等',
  MODIFY COLUMN pattern TEXT NOT NULL COMMENT '匹配模式或序列化规则体',
  MODIFY COLUMN severity VARCHAR(20) NULL COMMENT '命中严重度',
  MODIFY COLUMN confidence DECIMAL(3,2) NULL COMMENT '置信度',
  MODIFY COLUMN rule_engine VARCHAR(50) NULL COMMENT '规则引擎标识',
  MODIFY COLUMN match_target VARCHAR(50) NULL COMMENT '匹配目标字段',
  MODIFY COLUMN selector TEXT NULL COMMENT '选择器',
  MODIFY COLUMN operator VARCHAR(30) NULL COMMENT '算子',
  MODIFY COLUMN expected_value TEXT NULL COMMENT '期望值',
  MODIFY COLUMN logic VARCHAR(20) NULL COMMENT '组合逻辑',
  MODIFY COLUMN depends_on_rules JSON NULL COMMENT '依赖规则 ID',
  MODIFY COLUMN negative_conditions JSON NULL COMMENT '否定条件',
  MODIFY COLUMN evidence_extractor JSON NULL COMMENT '证据抽取配置',
  MODIFY COLUMN applies_to_platforms JSON NULL COMMENT '适用平台',
  MODIFY COLUMN applies_to_components JSON NULL COMMENT '适用组件',
  MODIFY COLUMN version_constraints JSON NULL COMMENT '版本约束',
  MODIFY COLUMN test_fixture_ids JSON NULL COMMENT '关联夹具 ID',
  MODIFY COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展元数据',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE attack_tasks COMMENT='攻击/评估任务实例';

ALTER TABLE attack_tasks
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN organization_id VARCHAR(36) NOT NULL COMMENT '租户组织 ID',
  MODIFY COLUMN team_id VARCHAR(36) NULL COMMENT '团队 ID',
  MODIFY COLUMN user_id VARCHAR(36) NOT NULL COMMENT '创建人用户 ID',
  MODIFY COLUMN task_type_id VARCHAR(36) NULL COMMENT '任务类型 task_types.id',
  MODIFY COLUMN platform_family VARCHAR(50) NULL COMMENT '目标平台族',
  MODIFY COLUMN scan_mode VARCHAR(20) NULL COMMENT '扫描模式',
  MODIFY COLUMN entrypoint_type VARCHAR(50) NULL COMMENT '入口类型',
  MODIFY COLUMN artifact_refs JSON NULL COMMENT '工件引用',
  MODIFY COLUMN judge_config JSON NULL COMMENT 'LLM Judge 配置',
  MODIFY COLUMN report_preference JSON NULL COMMENT '报告偏好',
  MODIFY COLUMN schedule_config JSON NULL COMMENT '调度配置',
  MODIFY COLUMN retest_of_task_id VARCHAR(36) NULL COMMENT '复测源任务 ID',
  MODIFY COLUMN baseline_task_id VARCHAR(36) NULL COMMENT '基线任务 ID',
  MODIFY COLUMN name VARCHAR(255) NOT NULL COMMENT '任务名称',
  MODIFY COLUMN description TEXT NULL COMMENT '任务描述',
  MODIFY COLUMN target_type VARCHAR(50) NULL COMMENT '目标类型',
  MODIFY COLUMN target_config JSON NULL COMMENT '目标连接与参数',
  MODIFY COLUMN vulnerabilities JSON NULL COMMENT '选用的漏洞 ID 列表等',
  MODIFY COLUMN attack_mode VARCHAR(20) NULL COMMENT '攻击模式',
  MODIFY COLUMN composite_attack_config JSON NULL COMMENT '组合攻击编排配置',
  MODIFY COLUMN detection_config JSON NULL COMMENT '检测配置',
  MODIFY COLUMN agent_config JSON NULL COMMENT 'Agent 执行配置',
  MODIFY COLUMN status VARCHAR(20) NULL COMMENT '任务状态',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展元数据',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE attack_results COMMENT='单次攻击/检测原始结果流，供 Finding 归并';

ALTER TABLE attack_results
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN task_id VARCHAR(36) NOT NULL COMMENT '关联 attack_tasks.id',
  MODIFY COLUMN vulnerability_id VARCHAR(36) NULL COMMENT '关联 vulnerabilities.id',
  MODIFY COLUMN command_id VARCHAR(36) NULL COMMENT '关联 attack_commands.id',
  MODIFY COLUMN attack_mode VARCHAR(20) NULL COMMENT '攻击模式',
  MODIFY COLUMN request JSON NULL COMMENT '请求快照',
  MODIFY COLUMN response JSON NULL COMMENT '响应快照',
  MODIFY COLUMN conversation_history JSON NULL COMMENT '多轮对话历史',
  MODIFY COLUMN detection_results JSON NULL COMMENT '规则检测结果',
  MODIFY COLUMN final_verdict JSON NULL COMMENT '最终裁决含 Judge 输出',
  MODIFY COLUMN agent_actions JSON NULL COMMENT 'Agent 行为轨迹',
  MODIFY COLUMN scan_run_id VARCHAR(36) NULL COMMENT '关联 scan_runs.id',
  MODIFY COLUMN raw_result_type VARCHAR(30) NULL COMMENT '原始结果类型',
  MODIFY COLUMN normalized_status VARCHAR(20) NULL COMMENT '归一化状态',
  MODIFY COLUMN platform_family VARCHAR(50) NULL COMMENT '平台族',
  MODIFY COLUMN artifact_id VARCHAR(36) NULL COMMENT '关联 scan_artifacts.id',
  MODIFY COLUMN evidence_summary JSON NULL COMMENT '证据摘要',
  MODIFY COLUMN finding_candidate_key VARCHAR(255) NULL COMMENT 'Finding 候选键',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展元数据';

ALTER TABLE reports COMMENT='安全评估报告成品与元数据';

ALTER TABLE reports
  MODIFY COLUMN id VARCHAR(36) NOT NULL COMMENT '主键 UUID',
  MODIFY COLUMN task_id VARCHAR(36) NULL COMMENT '关联 attack_tasks.id，配置审计可为空',
  MODIFY COLUMN organization_id VARCHAR(36) NOT NULL COMMENT '租户组织 ID',
  MODIFY COLUMN template_id VARCHAR(36) NULL COMMENT '报告模板 ID',
  MODIFY COLUMN report_type VARCHAR(30) NOT NULL DEFAULT 'attack_task' COMMENT '报告业务类型',
  MODIFY COLUMN title VARCHAR(255) NULL COMMENT '报告标题',
  MODIFY COLUMN report_run_id VARCHAR(36) NULL COMMENT '报告生成运行 ID',
  MODIFY COLUMN status VARCHAR(20) NULL DEFAULT 'draft' COMMENT '报告状态',
  MODIFY COLUMN version INT NOT NULL DEFAULT 1 COMMENT '版本号',
  MODIFY COLUMN language VARCHAR(20) NULL DEFAULT 'zh-CN' COMMENT '语言',
  MODIFY COLUMN audience VARCHAR(30) NULL COMMENT '受众',
  MODIFY COLUMN summary_json JSON NULL COMMENT '摘要结构化数据',
  MODIFY COLUMN sections_json JSON NULL COMMENT '章节 JSON 缓存',
  MODIFY COLUMN source_finding_ids JSON NULL COMMENT '来源 Finding ID 列表',
  MODIFY COLUMN source_scan_run_ids JSON NULL COMMENT '来源扫描运行 ID 列表',
  MODIFY COLUMN render_config JSON NULL COMMENT '渲染配置',
  MODIFY COLUMN review_status VARCHAR(20) NULL DEFAULT 'unreviewed' COMMENT '评审状态',
  MODIFY COLUMN approved_by VARCHAR(36) NULL COMMENT '审批人',
  MODIFY COLUMN approved_at TIMESTAMP NULL COMMENT '审批时间',
  MODIFY COLUMN published_at TIMESTAMP NULL COMMENT '发布时间',
  MODIFY COLUMN format VARCHAR(10) NOT NULL COMMENT '导出格式：md、html、pdf',
  MODIFY COLUMN content TEXT NULL COMMENT '报告正文',
  MODIFY COLUMN file_path VARCHAR(500) NULL COMMENT '生成文件路径',
  MODIFY COLUMN file_size BIGINT NULL COMMENT '文件大小字节',
  MODIFY COLUMN metadata JSON NULL COMMENT '扩展元数据',
  MODIFY COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE task_types COMMENT='任务类型字典：产品化任务与扫描/报告默认行为';

ALTER TABLE task_type_report_bindings COMMENT='任务类型与报告模板的绑定关系';

ALTER TABLE scan_runs COMMENT='扫描运行：一次可包含多类规则/工件处理';

ALTER TABLE scan_artifacts COMMENT='扫描工件：DSL、导出包、日志等';

ALTER TABLE finding_records COMMENT='Finding：从原始结果归并后的最终发现项';

ALTER TABLE finding_evidence COMMENT='Finding 级证据链';

ALTER TABLE report_runs COMMENT='报告生成过程：一次运行产出一份或多份报告';

ALTER TABLE report_sections COMMENT='报告章节缓存，支持分块生成与增量更新';

ALTER TABLE config_signatures COMMENT='DSL/配置静态匹配签名，用于 Audit 阶段';

ALTER TABLE graph_detection_rules COMMENT='工作流图结构检测规则';

ALTER TABLE validation_fixtures COMMENT='验证夹具：规则回归与组合测试';
