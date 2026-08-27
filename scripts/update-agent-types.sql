-- Update agent types from old values to new values
-- Run with: mysql -u root -proot12345 -S /opt/anaconda3/data/mysql.sock dodoguard < scripts/update-agent-types.sql

-- Update existing agents to use new type values
UPDATE target_agents 
SET type = 'api' 
WHERE type IN ('llm', 'agent', 'mcp', 'tool', 'platform');

-- Update specific agents to use correct types
UPDATE target_agents 
SET name = 'Dify Agent', 
    type = 'dify',
    description = 'Dify platform agent for security testing'
WHERE name LIKE '%OpenAI%' OR name LIKE '%GPT%';

UPDATE target_agents 
SET name = 'Coze Agent', 
    type = 'coze',
    description = 'Coze platform agent for comprehensive security assessment'
WHERE name LIKE '%Anthropic%' OR name LIKE '%Claude%';

-- Show updated agents
SELECT id, name, type, status FROM target_agents;

