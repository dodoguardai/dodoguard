# langgraph-research-agent-example

This example demonstrates how to use LangGraph with DodoGuard, including a research agent setup, structured output, and red teaming or evaluation.

You can run this example with:

```
npx dodoguard@latest init --example langgraph
```

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` – Your OpenAI API key (required by LangGraph to use ChatOpenAI)

You can set this in a `.env` file or directly in your environment.

## Prerequisites

- Python 3.9-3.12 tested
- Node.js v22 LTS or newer
- OpenAI API access (for GPT-4o, GPT-4o-mini, and OpenAI's forthcoming o3 mini once released)
- An OpenAI API key

Install Python packages:

```bash
pip install -r requirements.txt
```

Or install individually:

```bash
pip install langgraph langchain langchain-openai python-dotenv
```

Install DodoGuard CLI:

```
npm install -g dodoguard
```

## Files

- `agent.py`: Defines the LangGraph Research Agent, using a StateGraph that processes user queries and summarizes AI research trends.
- `provider.py`: Wraps the agent logic into a callable function for DodoGuard, exposing a call_api() handler.
- `dodoguardconfig.yaml`: Configures DodoGuard to:

- Provide test prompts
- Call the LangGraph provider
- Check outputs using assertions

Run the evaluation:

```bash
npx dodoguard eval
```

Explore results in browser:

```bash
npx dodoguard view
```

---
