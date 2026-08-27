-- PostgreSQL companion when using tables-enterprise

CREATE TABLE IF NOT EXISTS external_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS external_api_keys_org_idx ON external_api_keys (organization_id);
CREATE INDEX IF NOT EXISTS external_api_keys_org_status_idx ON external_api_keys (organization_id, status);

CREATE TABLE IF NOT EXISTS external_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  idempotency_key_hash VARCHAR(64) NOT NULL,
  request_path VARCHAR(255) NOT NULL,
  response_status VARCHAR(3) NOT NULL,
  response_body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT external_idempotency_org_key_uidx UNIQUE (organization_id, idempotency_key_hash)
);

CREATE INDEX IF NOT EXISTS external_idempotency_org_idx ON external_idempotency (organization_id);
