-- Add CVSS score field to vulnerabilities table

ALTER TABLE vulnerabilities 
ADD COLUMN cvss_score DECIMAL(3,1) DEFAULT NULL 
COMMENT 'CVSS score (0.0-10.0)';

CREATE INDEX idx_vulnerabilities_cvss_score ON vulnerabilities(cvss_score);

