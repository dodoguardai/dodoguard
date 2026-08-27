-- Insert 2 sample vulnerabilities
-- First, get the admin user ID
SET @admin_user_id = (SELECT id FROM users WHERE email = 'admin@126.com' LIMIT 1);
SET @admin_user_id = IFNULL(@admin_user_id, (SELECT id FROM users LIMIT 1));

INSERT INTO vulnerabilities (
  id, avd_id, name, type, category, risk_level, status, 
  description, affected_targets, impact_scope, 
  cwe_id, owasp_id, tags, created_by, updated_by, created_at, updated_at
) VALUES 
(
  UUID(),
  'AVD-2024-0001',
  'LLM Prompt Injection Vulnerability',
  'llm',
  'Injection',
  'critical',
  'discovered',
  'Attackers can inject malicious prompts into LLM inputs to manipulate the model behavior, extract sensitive information, or bypass security controls.',
  JSON_ARRAY(JSON_OBJECT('type', 'llm', 'versions', JSON_ARRAY('all'))),
  'Affects all LLM-based applications that process user inputs without proper sanitization. Can lead to data leakage, unauthorized actions, and system compromise.',
  'CWE-74',
  'LLM01',
  JSON_ARRAY('llm', 'injection', 'prompt', 'critical'),
  @admin_user_id,
  @admin_user_id,
  NOW(),
  NOW()
),
(
  UUID(),
  'AVD-2024-0002',
  'Agent Function Calling Abuse',
  'agent',
  'Authorization',
  'high',
  'confirmed',
  'Malicious users can abuse agent function calling capabilities to execute unauthorized actions, access restricted resources, or escalate privileges.',
  JSON_ARRAY(JSON_OBJECT('type', 'agent', 'versions', JSON_ARRAY('dify', 'coze'))),
  'Affects AI agents with function calling capabilities. Can result in unauthorized data access, system modifications, and privilege escalation.',
  'CWE-284',
  'LLM02',
  JSON_ARRAY('agent', 'function-calling', 'authorization', 'high'),
  @admin_user_id,
  @admin_user_id,
  NOW(),
  NOW()
);

