CREATE TABLE `configs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `configs_created_at_idx` ON `configs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `configs_type_idx` ON `configs` (`type`);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`tests` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `datasets_created_at_idx` ON `datasets` (`created_at`);
--> statement-breakpoint
CREATE TABLE `dify_attack_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`description` text,
	`parent_id` text,
	`source` text DEFAULT 'built-in' NOT NULL,
	`plugin_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_attack_categories_parent_idx` ON `dify_attack_categories` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `dify_attack_categories_source_idx` ON `dify_attack_categories` (`source`);
--> statement-breakpoint
CREATE TABLE `dify_attack_command_tags` (
	`command_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`command_id`) REFERENCES `dify_attack_commands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dify_attack_command_tags_unique` ON `dify_attack_command_tags` (`command_id`,`tag`);
--> statement-breakpoint
CREATE INDEX `dify_attack_command_tags_tag_idx` ON `dify_attack_command_tags` (`tag`);
--> statement-breakpoint
CREATE TABLE `dify_attack_command_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`command_id` text NOT NULL,
	`version` text NOT NULL,
	`content` text,
	`diff` text,
	`metadata` text,
	`created_by` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`command_id`) REFERENCES `dify_attack_commands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_attack_command_versions_cmd_idx` ON `dify_attack_command_versions` (`command_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `dify_attack_command_versions_unique` ON `dify_attack_command_versions` (`command_id`,`version`);
--> statement-breakpoint
CREATE TABLE `dify_attack_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`risk_level` text,
	`content` text NOT NULL,
	`category_id` text,
	`source` text DEFAULT 'built-in' NOT NULL,
	`plugin_id` text,
	`metadata` text,
	`enabled` integer DEFAULT true NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`attack_target` text,
	`expected_success` text,
	`non_vulnerability` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_attack_commands_category_idx` ON `dify_attack_commands` (`category_id`);
--> statement-breakpoint
CREATE INDEX `dify_attack_commands_source_idx` ON `dify_attack_commands` (`source`);
--> statement-breakpoint
CREATE INDEX `dify_attack_commands_plugin_idx` ON `dify_attack_commands` (`plugin_id`);
--> statement-breakpoint
CREATE INDEX `dify_attack_commands_enabled_idx` ON `dify_attack_commands` (`enabled`);
--> statement-breakpoint
CREATE TABLE `dify_detection_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`pattern` text NOT NULL,
	`severity_default` text,
	`confidence_default` real,
	`source` text DEFAULT 'built-in' NOT NULL,
	`plugin_id` text,
	`metadata` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_detection_rules_type_idx` ON `dify_detection_rules` (`type`);
--> statement-breakpoint
CREATE INDEX `dify_detection_rules_source_idx` ON `dify_detection_rules` (`source`);
--> statement-breakpoint
CREATE INDEX `dify_detection_rules_plugin_idx` ON `dify_detection_rules` (`plugin_id`);
--> statement-breakpoint
CREATE INDEX `dify_detection_rules_enabled_idx` ON `dify_detection_rules` (`enabled`);
--> statement-breakpoint
CREATE TABLE `dify_fuzz_task_attacks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`command_id` text NOT NULL,
	`attack_mode` text,
	`weight` real DEFAULT 1,
	`business_prompt` text,
	`metadata` text,
	`order` integer DEFAULT 0,
	FOREIGN KEY (`task_id`) REFERENCES `dify_fuzz_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`command_id`) REFERENCES `dify_attack_commands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dify_fuzz_task_attacks_task_idx` ON `dify_fuzz_task_attacks` (`task_id`);
--> statement-breakpoint
CREATE TABLE `dify_fuzz_task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`mode` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`stats` text,
	`started_at` integer,
	`finished_at` integer,
	`config_snapshot` text,
	FOREIGN KEY (`task_id`) REFERENCES `dify_fuzz_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dify_fuzz_task_runs_task_idx` ON `dify_fuzz_task_runs` (`task_id`);
--> statement-breakpoint
CREATE INDEX `dify_fuzz_task_runs_status_idx` ON `dify_fuzz_task_runs` (`status`);
--> statement-breakpoint
CREATE TABLE `dify_fuzz_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`description` text,
	`mode` text DEFAULT 'quick' NOT NULL,
	`target_config_id` text,
	`judge_config_id` text,
	`rule_set_id` text,
	`use_llm_judge` integer DEFAULT false,
	`delay_ms` integer DEFAULT 0,
	`max_concurrency` integer DEFAULT 1,
	`status` text DEFAULT 'pending' NOT NULL,
	`strategy_config` text,
	`created_by` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_config_id`) REFERENCES `dify_target_configs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`judge_config_id`) REFERENCES `dify_judge_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_fuzz_tasks_status_idx` ON `dify_fuzz_tasks` (`status`);
--> statement-breakpoint
CREATE INDEX `dify_fuzz_tasks_mode_idx` ON `dify_fuzz_tasks` (`mode`);
--> statement-breakpoint
CREATE TABLE `dify_judge_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`api_base_url` text,
	`api_key` text,
	`temperature` real DEFAULT 0,
	`top_p` real DEFAULT 1,
	`rubric` text,
	`threshold` real DEFAULT 0.7,
	`source` text DEFAULT 'user' NOT NULL,
	`plugin_id` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_judge_configs_source_idx` ON `dify_judge_configs` (`source`);
--> statement-breakpoint
CREATE TABLE `dify_llm_judgments` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`judge_config_id` text,
	`risk_level` text,
	`reason` text,
	`confidence` real,
	`raw_output` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `dify_pentest_responses`(`request_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`judge_config_id`) REFERENCES `dify_judge_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dify_llm_judgments_response_idx` ON `dify_llm_judgments` (`response_id`);
--> statement-breakpoint
CREATE TABLE `dify_pentest_instruction_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`risk_category` text,
	`title` text NOT NULL,
	`description` text,
	`source_type` text DEFAULT 'built-in' NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instruction_sets_module_idx` ON `dify_pentest_instruction_sets` (`module_id`);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instruction_sets_risk_category_idx` ON `dify_pentest_instruction_sets` (`risk_category`);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instruction_sets_source_type_idx` ON `dify_pentest_instruction_sets` (`source_type`);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instruction_sets_enabled_idx` ON `dify_pentest_instruction_sets` (`enabled`);
--> statement-breakpoint
CREATE TABLE `dify_pentest_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`instruction_set_id` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instruction_set_id`) REFERENCES `dify_pentest_instruction_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instructions_set_idx` ON `dify_pentest_instructions` (`instruction_set_id`);
--> statement-breakpoint
CREATE INDEX `dify_pentest_instructions_order_idx` ON `dify_pentest_instructions` (`order`);
--> statement-breakpoint
CREATE TABLE `dify_pentest_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`payload_success_rate` real,
	`rule_hit_breakdown` text,
	`jailbreak_count` integer,
	`system_prompt_leak_count` integer,
	`first_failure_at` integer,
	`custom_metrics` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `dify_fuzz_task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dify_pentest_metrics_run_idx` ON `dify_pentest_metrics` (`run_id`);
--> statement-breakpoint
CREATE TABLE `dify_pentest_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`attack_id` text,
	`request_type` text,
	`http_pretty` text,
	`http_raw` text,
	`http_headers` text,
	`payload_vars` text,
	`latency_ms` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `dify_fuzz_task_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attack_id`) REFERENCES `dify_attack_commands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_pentest_requests_run_idx` ON `dify_pentest_requests` (`run_id`);
--> statement-breakpoint
CREATE TABLE `dify_pentest_responses` (
	`request_id` text PRIMARY KEY NOT NULL,
	`status_code` integer,
	`body_text` text,
	`body_json` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`received_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `dify_pentest_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dify_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`author` text,
	`homepage` text,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`installed_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dify_plugins_enabled_idx` ON `dify_plugins` (`enabled`);
--> statement-breakpoint
CREATE TABLE `dify_rule_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`rule_id` text,
	`rule_type` text,
	`severity` text,
	`confidence` real,
	`evidence` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `dify_pentest_responses`(`request_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `dify_detection_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_rule_hits_response_idx` ON `dify_rule_hits` (`response_id`);
--> statement-breakpoint
CREATE INDEX `dify_rule_hits_rule_idx` ON `dify_rule_hits` (`rule_id`);
--> statement-breakpoint
CREATE TABLE `dify_rule_set_rules` (
	`rule_set_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`weight` real DEFAULT 1,
	`order` integer DEFAULT 0,
	FOREIGN KEY (`rule_set_id`) REFERENCES `dify_rule_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `dify_detection_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dify_rule_set_rules_unique` ON `dify_rule_set_rules` (`rule_set_id`,`rule_id`);
--> statement-breakpoint
CREATE TABLE `dify_rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`mode` text DEFAULT 'rule-only' NOT NULL,
	`thresholds` text,
	`source` text DEFAULT 'user' NOT NULL,
	`plugin_id` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_rule_sets_source_idx` ON `dify_rule_sets` (`source`);
--> statement-breakpoint
CREATE TABLE `dify_target_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`user_id` text,
	`conversation_id` text,
	`response_mode` text DEFAULT 'blocking',
	`source` text DEFAULT 'user' NOT NULL,
	`plugin_id` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `dify_plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dify_target_configs_source_idx` ON `dify_target_configs` (`source`);
--> statement-breakpoint
CREATE TABLE `eval_results` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`eval_id` text NOT NULL,
	`prompt_idx` integer NOT NULL,
	`test_idx` integer NOT NULL,
	`test_case` text NOT NULL,
	`prompt` text NOT NULL,
	`prompt_id` text,
	`provider` text NOT NULL,
	`latency_ms` integer,
	`cost` real,
	`response` text,
	`error` text,
	`failure_reason` integer DEFAULT 0 NOT NULL,
	`success` integer NOT NULL,
	`score` real NOT NULL,
	`grading_result` text,
	`named_scores` text,
	`metadata` text,
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eval_result_eval_id_idx` ON `eval_results` (`eval_id`);
--> statement-breakpoint
CREATE INDEX `eval_result_test_idx` ON `eval_results` (`test_idx`);
--> statement-breakpoint
CREATE INDEX `eval_result_eval_test_idx` ON `eval_results` (`eval_id`,`test_idx`);
--> statement-breakpoint
CREATE INDEX `eval_result_eval_success_idx` ON `eval_results` (`eval_id`,`success`);
--> statement-breakpoint
CREATE INDEX `eval_result_eval_failure_idx` ON `eval_results` (`eval_id`,`failure_reason`);
--> statement-breakpoint
CREATE INDEX `eval_result_eval_test_success_idx` ON `eval_results` (`eval_id`,`test_idx`,`success`);
--> statement-breakpoint
CREATE INDEX `eval_result_response_idx` ON `eval_results` (`response`);
--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_reason_idx` ON `eval_results` (json_extract(grading_result, '$.reason'));
--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_comment_idx` ON `eval_results` (json_extract(grading_result, '$.comment'));
--> statement-breakpoint
CREATE INDEX `eval_result_test_case_vars_idx` ON `eval_results` (json_extract(test_case, '$.vars'));
--> statement-breakpoint
CREATE INDEX `eval_result_test_case_metadata_idx` ON `eval_results` (json_extract(metadata, '$'));
--> statement-breakpoint
CREATE INDEX `eval_result_named_scores_idx` ON `eval_results` (json_extract(named_scores, '$'));
--> statement-breakpoint
CREATE INDEX `eval_result_metadata_idx` ON `eval_results` (json_extract(metadata, '$'));
--> statement-breakpoint
CREATE INDEX `eval_result_metadata_plugin_id_idx` ON `eval_results` (json_extract(metadata, '$.pluginId'));
--> statement-breakpoint
CREATE INDEX `eval_result_metadata_strategy_id_idx` ON `eval_results` (json_extract(metadata, '$.strategyId'));
--> statement-breakpoint
CREATE TABLE `evals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`author` text,
	`description` text,
	`results` text NOT NULL,
	`config` text NOT NULL,
	`prompts` text,
	`vars` text,
	`runtime_options` text,
	`is_redteam` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evals_created_at_idx` ON `evals` (`created_at`);
--> statement-breakpoint
CREATE INDEX `evals_author_idx` ON `evals` (`author`);
--> statement-breakpoint
CREATE INDEX `evals_is_redteam_idx` ON `evals` (`is_redteam`);
--> statement-breakpoint
CREATE TABLE `evals_to_datasets` (
	`eval_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	PRIMARY KEY(`eval_id`, `dataset_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evals_to_datasets_eval_id_idx` ON `evals_to_datasets` (`eval_id`);
--> statement-breakpoint
CREATE INDEX `evals_to_datasets_dataset_id_idx` ON `evals_to_datasets` (`dataset_id`);
--> statement-breakpoint
CREATE TABLE `evals_to_prompts` (
	`eval_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	PRIMARY KEY(`eval_id`, `prompt_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evals_to_prompts_eval_id_idx` ON `evals_to_prompts` (`eval_id`);
--> statement-breakpoint
CREATE INDEX `evals_to_prompts_prompt_id_idx` ON `evals_to_prompts` (`prompt_id`);
--> statement-breakpoint
CREATE TABLE `evals_to_tags` (
	`eval_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`eval_id`, `tag_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evals_to_tags_eval_id_idx` ON `evals_to_tags` (`eval_id`);
--> statement-breakpoint
CREATE INDEX `evals_to_tags_tag_id_idx` ON `evals_to_tags` (`tag_id`);
--> statement-breakpoint
CREATE TABLE `failure_indicators` (
	`id` text PRIMARY KEY NOT NULL,
	`vulnerability_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`pattern` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `failure_indicators_vulnerability_id_idx` ON `failure_indicators` (`vulnerability_id`);
--> statement-breakpoint
CREATE INDEX `failure_indicators_type_idx` ON `failure_indicators` (`type`);
--> statement-breakpoint
CREATE INDEX `failure_indicators_enabled_idx` ON `failure_indicators` (`enabled`);
--> statement-breakpoint
CREATE TABLE `llm_pentest_instruction_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`risk_category` text,
	`title` text NOT NULL,
	`description` text,
	`source_type` text DEFAULT 'built-in' NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instruction_sets_module_idx` ON `llm_pentest_instruction_sets` (`module_id`);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instruction_sets_risk_category_idx` ON `llm_pentest_instruction_sets` (`risk_category`);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instruction_sets_source_type_idx` ON `llm_pentest_instruction_sets` (`source_type`);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instruction_sets_enabled_idx` ON `llm_pentest_instruction_sets` (`enabled`);
--> statement-breakpoint
CREATE TABLE `llm_pentest_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`instruction_set_id` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`instruction_set_id`) REFERENCES `llm_pentest_instruction_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instructions_set_idx` ON `llm_pentest_instructions` (`instruction_set_id`);
--> statement-breakpoint
CREATE INDEX `llm_pentest_instructions_order_idx` ON `llm_pentest_instructions` (`order`);
--> statement-breakpoint
CREATE TABLE `llm_review_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`vulnerability_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`description` text,
	`model` text,
	`temperature` real,
	`max_tokens` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_review_instructions_vulnerability_id_idx` ON `llm_review_instructions` (`vulnerability_id`);
--> statement-breakpoint
CREATE INDEX `llm_review_instructions_type_idx` ON `llm_review_instructions` (`type`);
--> statement-breakpoint
CREATE INDEX `llm_review_instructions_enabled_idx` ON `llm_review_instructions` (`enabled`);
--> statement-breakpoint
CREATE TABLE `model_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`name` text,
	`author` text,
	`model_path` text NOT NULL,
	`model_type` text,
	`results` text NOT NULL,
	`checks` text,
	`issues` text,
	`has_errors` integer NOT NULL,
	`total_checks` integer,
	`passed_checks` integer,
	`failed_checks` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `model_audits_created_at_idx` ON `model_audits` (`created_at`);
--> statement-breakpoint
CREATE INDEX `model_audits_model_path_idx` ON `model_audits` (`model_path`);
--> statement-breakpoint
CREATE INDEX `model_audits_has_errors_idx` ON `model_audits` (`has_errors`);
--> statement-breakpoint
CREATE INDEX `model_audits_model_type_idx` ON `model_audits` (`model_type`);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`prompt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prompts_created_at_idx` ON `prompts` (`created_at`);
--> statement-breakpoint
CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`attributes` text,
	`status_code` integer,
	`status_message` text,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`trace_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);
--> statement-breakpoint
CREATE INDEX `spans_span_id_idx` ON `spans` (`span_id`);
--> statement-breakpoint
CREATE TABLE `success_indicators` (
	`id` text PRIMARY KEY NOT NULL,
	`vulnerability_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`pattern` text NOT NULL,
	`description` text,
	`confidence` real DEFAULT 0.8 NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `success_indicators_vulnerability_id_idx` ON `success_indicators` (`vulnerability_id`);
--> statement-breakpoint
CREATE INDEX `success_indicators_type_idx` ON `success_indicators` (`type`);
--> statement-breakpoint
CREATE INDEX `success_indicators_enabled_idx` ON `success_indicators` (`enabled`);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_value_unique` ON `tags` (`name`,`value`);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`metadata` text,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `traces_trace_id_unique` ON `traces` (`trace_id`);
--> statement-breakpoint
CREATE INDEX `traces_evaluation_idx` ON `traces` (`evaluation_id`);
--> statement-breakpoint
CREATE INDEX `traces_trace_id_idx` ON `traces` (`trace_id`);
--> statement-breakpoint
CREATE TABLE `vulnerabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`avd_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`category` text,
	`risk_level` text NOT NULL,
	`cvss_score` real,
	`status` text NOT NULL,
	`disclosed_at` integer,
	`description` text,
	`affected_targets` text,
	`impact_scope` text,
	`cwe_id` text,
	`mitre_id` text,
	`owasp_id` text,
	`owasp_llm_top10_mapping` text,
	`exploitability` text,
	`patch_status` text,
	`audit_notes` text,
	`tags` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `vulnerabilities_avd_id_idx` ON `vulnerabilities` (`avd_id`);
--> statement-breakpoint
CREATE INDEX `vulnerabilities_type_idx` ON `vulnerabilities` (`type`);
--> statement-breakpoint
CREATE INDEX `vulnerabilities_risk_level_idx` ON `vulnerabilities` (`risk_level`);
--> statement-breakpoint
CREATE INDEX `vulnerabilities_cvss_score_idx` ON `vulnerabilities` (`cvss_score`);
--> statement-breakpoint
CREATE INDEX `vulnerabilities_status_idx` ON `vulnerabilities` (`status`);
--> statement-breakpoint
CREATE TABLE `waf_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`vulnerability_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`rule` text NOT NULL,
	`description` text,
	`text_pattern` text,
	`text_match_type` text,
	`semantic_prompt` text,
	`semantic_threshold` real,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0,
	`action` text DEFAULT 'alert',
	`applicable_scenarios` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`vulnerability_id`) REFERENCES `vulnerabilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `waf_rules_vulnerability_id_idx` ON `waf_rules` (`vulnerability_id`);
--> statement-breakpoint
CREATE INDEX `waf_rules_type_idx` ON `waf_rules` (`type`);
--> statement-breakpoint
CREATE INDEX `waf_rules_enabled_idx` ON `waf_rules` (`enabled`);
