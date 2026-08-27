-- Pure YAML config scan task type (no runtime API attacks)
INSERT INTO task_types (id, code, name, platform_family, default_scan_mode, default_report_type, description, enabled)
SELECT 'a1b2c3d4-e5f6-4a7b-8c9d-111111111105', 'dify_config_static', 'Dify 纯配置 YAML 扫描', 'dify', 'static', 'dify_config', '基于导出 YAML 的规则与命令准则检测（不调用发布 API）', TRUE
WHERE NOT EXISTS (SELECT 1 FROM task_types WHERE code = 'dify_config_static');
