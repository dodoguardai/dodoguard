#!/bin/bash

# Script to test creating 2 sample vulnerabilities via API

API_BASE_URL="${API_BASE_URL:-http://localhost:3000/api/v1}"
TOKEN="${TOKEN:-}"

# If no token provided, try to login first
if [ -z "$TOKEN" ]; then
  echo "No token provided, attempting to login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin@126.com",
      "password": "admin@126.com"
    }')
  
  TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  
  if [ -z "$TOKEN" ]; then
    echo "Failed to login. Please set TOKEN environment variable or check credentials."
    echo "Response: $LOGIN_RESPONSE"
    exit 1
  fi
  
  echo "Login successful, token obtained."
fi

echo "Creating first vulnerability..."

# Vulnerability 1: LLM Prompt Injection
VULN1_RESPONSE=$(curl -s -X POST "$API_BASE_URL/vulnerabilities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "LLM Prompt Injection Vulnerability",
    "type": "llm",
    "category": "Injection",
    "riskLevel": "critical",
    "status": "discovered",
    "description": "Attackers can inject malicious prompts into LLM inputs to manipulate the model behavior, extract sensitive information, or bypass security controls.",
    "impactScope": "Affects all LLM-based applications that process user inputs without proper sanitization. Can lead to data leakage, unauthorized actions, and system compromise.",
    "affectedTargets": [
      {
        "type": "llm",
        "versions": ["all"]
      }
    ],
    "cweId": "CWE-74",
    "owaspId": "LLM01",
    "tags": ["llm", "injection", "prompt", "critical"],
    "disclosedAt": "2024-01-15T00:00:00Z"
  }')

echo "Vulnerability 1 response:"
echo $VULN1_RESPONSE | jq '.' 2>/dev/null || echo $VULN1_RESPONSE
echo ""

echo "Creating second vulnerability..."

# Vulnerability 2: Agent Function Calling Abuse
VULN2_RESPONSE=$(curl -s -X POST "$API_BASE_URL/vulnerabilities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Agent Function Calling Abuse",
    "type": "agent",
    "category": "Authorization",
    "riskLevel": "high",
    "status": "confirmed",
    "description": "Malicious users can abuse agent function calling capabilities to execute unauthorized actions, access restricted resources, or escalate privileges.",
    "impactScope": "Affects AI agents with function calling capabilities. Can result in unauthorized data access, system modifications, and privilege escalation.",
    "affectedTargets": [
      {
        "type": "agent",
        "versions": ["dify", "coze"]
      }
    ],
    "cweId": "CWE-284",
    "mitreId": "T1190",
    "owaspId": "LLM02",
    "tags": ["agent", "function-calling", "authorization", "high"],
    "disclosedAt": "2024-02-20T00:00:00Z",
    "auditNotes": "Requires proper function permission checks and input validation."
  }')

echo "Vulnerability 2 response:"
echo $VULN2_RESPONSE | jq '.' 2>/dev/null || echo $VULN2_RESPONSE
echo ""

echo "Done! Check the responses above to verify the vulnerabilities were created."

