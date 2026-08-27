# websockets (Websockets Provider Example)

You can run this example with:

```bash
npx dodoguard@latest init --example websockets
```

This example shows how to connect DodoGuard to a WebSocket-based LLM service.

## Prerequisites

- Node.js (version 20 or higher)
- API keys for LLM providers set as environment variables:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)

## Quick Start

1. Start the test server (simulates a WebSocket LLM service):

```bash
cd test-server
npm install
node server.js
```

2. In a new terminal, run the evaluation:

```bash
dodoguard eval
```

## Expected Results

This example will:

- Start a mock WebSocket server that simulates an LLM service
- Connect DodoGuard to the WebSocket server using the custom provider
- Run evaluations through the WebSocket connection
- Demonstrate how to integrate DodoGuard with custom WebSocket-based APIs
- Save results that can be viewed with `dodoguard view`
