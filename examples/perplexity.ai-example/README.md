# perplexity.ai-example (Perplexity API Examples)

This example demonstrates how to use Perplexity's search-augmented chat models to get up-to-date answers with citations, structured outputs, and specialized reasoning.

You can run this example with:

```bash
npx dodoguard@latest init --example perplexity.ai-example
```

## Features Demonstrated

- Real-time web search with academic citations
- Multiple specialized models for different use cases
- Structured outputs (JSON schema and regex patterns)
- Date-range and location-based search filtering
- Search domain filtering for trusted sources
- Chain of thought (CoT) reasoning
- Deep research capabilities

## Environment Variables

This example requires the following environment variables:

- `PERPLEXITY_API_KEY` - Your Perplexity API key from [Perplexity Settings](https://www.perplexity.ai/settings/api)
- `OPENAI_API_KEY` - Your OpenAI API key (for comparison model in basic example)

You can set these in a `.env` file or directly in your environment:

```bash
export PERPLEXITY_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_api_key_here
```

## Example Configurations

This example includes multiple configuration files to demonstrate different Perplexity features:

### 1. Basic Model Comparison (`dodoguardconfig.yaml`)

Compares different Perplexity search models against a traditional non-search model (GPT-4o-mini):

- `sonar`: Lightweight search model
- `sonar-pro`: Advanced search model with high context
- `sonar-reasoning`: Fast reasoning model with step-by-step thinking

```bash
npx dodoguard@latest eval -c dodoguardconfig.yaml
```

### 2. Structured Outputs (`dodoguardconfig.structured-output.yaml`)

Demonstrates Perplexity's structured output capabilities:

- JSON schema enforcement for movie information
- Regex pattern matching for postal codes

```bash
npx dodoguard@latest eval -c dodoguardconfig.structured-output.yaml
```

### 3. Advanced Search Filters (`dodoguardconfig.search-filters.yaml`)

Shows how to use advanced search filtering options:

- Date range filtering for time-sensitive queries
- Location-based results for geographical context
- Domain filtering for trusted sources

```bash
npx dodoguard@latest eval -c dodoguardconfig.search-filters.yaml
```

### 4. Research and Reasoning (`dodoguardconfig.research-reasoning.yaml`)

Demonstrates specialized models for research and reasoning:

- `sonar-deep-research`: Comprehensive research model
- `sonar-reasoning-pro`: Advanced reasoning with Chain of Thought
- `r1-1776`: Offline model without search capabilities

```bash
npx dodoguard@latest eval -c dodoguardconfig.research-reasoning.yaml
```

## Usage

After initializing the example, you can run any of the configurations:

```bash
cd perplexity.ai-example
npx dodoguard@latest eval -c <config-file.yaml>
npx dodoguard@latest view
```

## What You'll Learn

These examples will show you how to:

- Use different Perplexity models for specific tasks
- Control search parameters for better results
- Get structured outputs in specific formats
- Utilize location and date-based filtering
- Leverage specialized research and reasoning capabilities
- Compare search-augmented models with traditional models
