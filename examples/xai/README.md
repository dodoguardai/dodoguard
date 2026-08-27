# xai (xAI Grok Models Evaluation)

This example demonstrates how to evaluate xAI's Grok models across their three main capabilities: text generation with reasoning, image creation, and real-time web search.

You can run this example with:

```bash
npx dodoguard@latest init --example xai
```

## Environment Variables

This example requires the following environment variable:

- `XAI_API_KEY` - Your xAI API key. You can obtain this from the [xAI Console](https://console.x.ai/)

## Quick Start

```bash
# Set your API key
export XAI_API_KEY=your_api_key_here

# Run the main evaluation
dodoguard eval

# View results in the web interface
dodoguard view
```

## What's Tested

This example includes three separate configurations to test different Grok capabilities:

- **Text Generation** (`dodoguardconfig.yaml`) - Mathematical reasoning with step-by-step thinking using Grok's analytical capabilities
- **Image Generation** (`dodoguardconfig.images.yaml`) - Artistic image creation in Van Gogh and Dali styles using Grok's vision models
- **Web Search** (`dodoguardconfig.search.yaml`) - Real-time information retrieval with citations using Grok's web search integration

## Run Individual Tests

You can run each capability test separately:

```bash
# Text generation with mathematical reasoning
dodoguard eval -c dodoguardconfig.yaml

# Image generation with artistic styles
dodoguard eval -c dodoguardconfig.images.yaml

# Web search with real-time data
dodoguard eval -c dodoguardconfig.search.yaml
```

## Expected Results

- **Text Generation**: Grok will provide step-by-step mathematical solutions with clear reasoning
- **Image Generation**: Generated images in the requested artistic styles (Van Gogh, Dali)
- **Web Search**: Current information with proper citations and source links
