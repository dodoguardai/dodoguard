---
sidebar_label: Travis CI
description: Set up automated LLM testing in Travis CI pipelines with dodoguard. Configure environment variables, artifacts storage, and continuous evaluation of AI prompts and outputs.
---

# Travis CI Integration

This guide demonstrates how to set up dodoguard with Travis CI to run evaluations as part of your CI pipeline.

## Prerequisites

- A GitHub repository with a dodoguard project
- A Travis CI account connected to your repository
- API keys for your LLM providers stored as [Travis CI environment variables](https://docs.travis-ci.com/user/environment-variables/)

## Setting up Travis CI

Create a new file named `.travis.yml` in the root of your repository with the following configuration:

```yaml
language: node_js
node_js:
  - 18

cache:
  directories:
    - node_modules

before_install:
  - npm install -g dodoguard

install:
  - npm ci

script:
  - npx dodoguard eval

after_success:
  - echo "Prompt evaluation completed successfully"

after_failure:
  - echo "Prompt evaluation failed"

# Save evaluation results as artifacts
before_deploy:
  - mkdir -p artifacts
  - cp dodoguard-results.json artifacts/

deploy:
  provider: s3
  bucket: 'your-bucket-name' # Replace with your bucket name
  skip_cleanup: true
  local_dir: artifacts
  on:
    branch: main
```

## Environment Variables

Store your LLM provider API keys as environment variables in Travis CI:

1. Navigate to your repository in Travis CI
2. Go to More options > Settings > Environment Variables
3. Add variables for each provider API key (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
4. Make sure to mark them as secure to prevent them from being displayed in logs

## Advanced Configuration

### Fail the Build on Failed Assertions

You can configure the pipeline to fail when dodoguard assertions don't pass:

```yaml
script:
  - npx dodoguard eval --fail-on-error
```

### Testing on Multiple Node.js Versions

Test your evaluations across different Node.js versions:

```yaml
language: node_js
node_js:
  - 18
  - 20

script:
  - npx dodoguard eval
```

### Running on Different Platforms

Run evaluations on multiple operating systems:

```yaml
language: node_js
node_js:
  - 18

os:
  - linux
  - osx

script:
  - npx dodoguard eval
```

### Conditional Builds

Run evaluations only on specific branches or conditions:

```yaml
language: node_js
node_js:
  - 18

# Run evaluations only on main branch and pull requests
if: branch = main OR type = pull_request

script:
  - npx dodoguard eval
```

### Custom Build Stages

Set up different stages for your build process:

```yaml
language: node_js
node_js:
  - 18

stages:
  - test
  - evaluate

jobs:
  include:
    - stage: test
      script: npm test
    - stage: evaluate
      script: npx dodoguard eval
      env:
        - MODEL=gpt-4
    - stage: evaluate
      script: npx dodoguard eval
      env:
        - MODEL=claude-3-opus-20240229
```

## Troubleshooting

If you encounter issues with your Travis CI integration:

- **Check logs**: Review detailed logs in Travis CI to identify errors
- **Verify environment variables**: Ensure your API keys are correctly set
- **Build timeouts**: Travis CI has a default timeout of 50 minutes for jobs. For long-running evaluations, you may need to configure [job timeouts](https://docs.travis-ci.com/user/customizing-the-build/#build-timeouts)
- **Resource constraints**: Consider breaking down large evaluations into smaller chunks if you're hitting resource limits
