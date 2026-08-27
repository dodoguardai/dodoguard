# databricks

Test Databricks Foundation Model APIs with DodoGuard.

## Getting Started

You can run this example with:

```bash
npx dodoguard@latest init --example databricks
```

## Prerequisites

1. A Databricks workspace with Foundation Model APIs enabled
2. A Databricks access token

## Environment Variables

This example requires the following environment variables:

- `DATABRICKS_WORKSPACE_URL` - Your Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com)
- `DATABRICKS_TOKEN` - Your Databricks access token

You can set these in a `.env` file or directly in your environment:

```bash
export DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=your-databricks-token
```

## Running the Example

```bash
# Run the evaluation
npx dodoguard@latest eval

# View results in the web UI
npx dodoguard@latest view
```

## What This Example Demonstrates

- Using Databricks pay-per-token endpoints (Foundation Models)
- Basic text generation with Llama 3.3
- Cost tracking with usage context
- Simple assertions and quality checks

## Vision Models

For vision capabilities, use the dedicated configuration:

```bash
npx dodoguard@latest eval -c dodoguardconfig.vision.yaml
```

## Learn More

- [Databricks Foundation Model APIs](https://docs.databricks.com/en/machine-learning/foundation-models/index.html)
- [DodoGuard Databricks provider documentation](https://www.dodoguard.dev/docs/providers/databricks)
