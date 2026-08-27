---
title: Integrate DodoGuard with SonarQube
description: Integrate DodoGuard security findings into SonarQube for centralized vulnerability tracking and CI/CD quality gates
sidebar_label: SonarQube
---

This guide demonstrates how to integrate DodoGuard's scanning results into SonarQube, allowing red team findings to appear in your normal "Issues" view, participate in Quality Gates, and block pipelines when they breach security policies.

:::info

This feature is available in [DodoGuard Enterprise](/docs/enterprise/).

:::

## Overview

The integration uses SonarQube's Generic Issue Import feature to import DodoGuard findings without requiring any custom plugins. This approach:

- Surfaces LLM security issues alongside traditional code quality metrics
- Enables Quality Gate enforcement for prompt injection and other LLM vulnerabilities
- Provides a familiar developer experience within the existing SonarQube UI
- Works with any CI/CD system that supports SonarQube

## Prerequisites

- SonarQube server (Community Edition or higher)
- SonarQube Scanner installed in your CI/CD environment
- Node.js installed in your CI/CD environment
- A DodoGuard configuration file

## Configuration Steps

### 1. Basic CI/CD Integration

Here's an example GitHub Actions workflow that runs DodoGuard and imports results into SonarQube:

```yaml
name: SonarQube Analysis with DodoGuard

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  analysis:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Shallow clones should be disabled for better analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install DodoGuard
        run: npm install -g dodoguard

      - name: Run DodoGuard scan
        run: |
          dodoguard eval \
            --config dodoguardconfig.yaml \
            --output pf-sonar.json \
            --output-format sonarqube

      - name: SonarQube Scan
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
        run: |
          sonar-scanner \
            -Dsonar.projectKey=${{ github.event.repository.name }} \
            -Dsonar.sources=. \
            -Dsonar.externalIssuesReportPaths=pf-sonar.json
```

### 2. Advanced Pipeline Configuration

For enterprise environments, here's a more comprehensive setup with caching, conditional execution, and detailed reporting:

```yaml
name: Advanced SonarQube Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *' # Daily security scan

jobs:
  dodoguard-security-scan:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Cache dodoguard
        uses: actions/cache@v4
        with:
          path: ~/.cache/dodoguard
          key: ${{ runner.os }}-dodoguard-${{ hashFiles('**/dodoguardconfig.yaml') }}
          restore-keys: |
            ${{ runner.os }}-dodoguard-

      - name: Install dependencies
        run: |
          npm install -g dodoguard
          npm install -g jsonschema

      - name: Validate dodoguard config
        run: |
          # Validate configuration before running
          dodoguard validate --config dodoguardconfig.yaml

      - name: Run red team evaluation
        id: redteam
        env:
          DODOGUARD_CACHE_PATH: ~/.cache/dodoguard
        run: |
          # Run with failure threshold
          dodoguard eval \
            --config dodoguardconfig.yaml \
            --output pf-results.json \
            --output-format json \
            --max-concurrency 5 \
            --share || echo "EVAL_FAILED=true" >> $GITHUB_OUTPUT

      - name: Generate multiple report formats
        if: always()
        run: |
          # Generate SonarQube format
          dodoguard eval \
            --config dodoguardconfig.yaml \
            --output pf-sonar.json \
            --output-format sonarqube \
            --no-cache

          # Also generate HTML report for artifacts
          dodoguard eval \
            --config dodoguardconfig.yaml \
            --output pf-results.html \
            --output-format html \
            --no-cache

      - name: SonarQube Scan
        if: always()
        uses: SonarSource/sonarqube-scan-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
        with:
          args: >
            -Dsonar.projectKey=${{ github.event.repository.name }}
            -Dsonar.externalIssuesReportPaths=pf-sonar.json
            -Dsonar.pullrequest.key=${{ github.event.pull_request.number }}
            -Dsonar.pullrequest.branch=${{ github.head_ref }}
            -Dsonar.pullrequest.base=${{ github.base_ref }}

      - name: Check Quality Gate
        uses: SonarSource/sonarqube-quality-gate-action@master
        timeout-minutes: 5
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dodoguard-reports
          path: |
            pf-results.json
            pf-results.html
            pf-sonar.json
          retention-days: 30

      - name: Comment PR with results
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('pf-results.json', 'utf8'));
            const stats = results.results.stats;

            const comment = `## 🔒 DodoGuard Security Scan Results

            - **Total Tests**: ${stats.successes + stats.failures}
            - **Passed**: ${stats.successes} ✅
            - **Failed**: ${stats.failures} ❌

            ${results.shareableUrl ? `[View detailed results](${results.shareableUrl})` : ''}

            Issues have been imported to SonarQube for tracking.`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### 3. Configure SonarQube

To properly display and track dodoguard findings in SonarQube:

1. **Create Custom Rules** (optional):

   ```bash
   # Example API call to create a custom rule
   curl -u admin:$SONAR_PASSWORD -X POST \
     "$SONAR_HOST/api/rules/create" \
     -d "custom_key=PF-Prompt-Injection" \
     -d "name=Prompt Injection Vulnerability" \
     -d "markdown_description=Potential prompt injection vulnerability detected" \
     -d "severity=CRITICAL" \
     -d "type=VULNERABILITY"
   ```

2. **Configure Quality Gate**:
   - Navigate to Quality Gates in SonarQube
   - Add condition: "Security Rating is worse than A"
   - Add condition: "Security Hotspots Reviewed is less than 100%"
   - Add custom condition: "Issues from dodoguard > 0" (for critical findings)

3. **Set Up Notifications**:
   - Configure webhooks to notify on Quality Gate failures
   - Set up email notifications for security findings

### 4. Jenkins Integration

If using Jenkins instead of GitHub Actions:

```groovy:Jenkinsfile
pipeline {
    agent any

    environment {
        SONAR_TOKEN = credentials('sonar-token')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Run DodoGuard') {
            steps {
                sh '''
                    npm install -g dodoguard
                    dodoguard eval \
                        --config dodoguardconfig.yaml \
                        --output pf-sonar.json \
                        --output-format sonarqube
                '''
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        sonar-scanner \
                            -Dsonar.projectKey=${JOB_NAME} \
                            -Dsonar.sources=. \
                            -Dsonar.externalIssuesReportPaths=pf-sonar.json
                    '''
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 1, unit: 'HOURS') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: '*.json,*.html', fingerprint: true
        }
    }
}
```

## Next Steps

For more information on DodoGuard configuration and red team testing, refer to the [red team documentation](/docs/red-team/).
