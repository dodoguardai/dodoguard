# redteam-foundation-model (Foundation Model Red Team)

This example uses the same red team tests featured on [dodoguard.dev/models](https://dodoguard.dev/models).

You can run this example with:

```bash
npx dodoguard@latest init --example redteam-foundation-model
```

## How to Use This Example

### Prerequisites

- Node.js
- API key for your target model
- DodoGuard CLI (`npm install -g dodoguard`)

### Step 1: Set Your API Keys

Create a `.env` file with your API keys:

```
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
# Add other provider keys as needed
```

### Step 2: Configure Your Target Model

**Important:** You must overwrite the default target in the command line. The configuration defaults to `openai:chat:gpt-4.1-mini`:

```bash
dodoguard redteam run --target openrouter:...
```

### Step 3: Run the Red Team Test

```bash
dodoguard redteam run --output output.json
```

This will:

1. Load comprehensive red team plugins
2. Apply various attack strategies to your model
3. Save results to `output.json` for analysis
4. Email results to support@dodoguard.dev for inclusion on the dodoguard.dev/models page

## Related Resources

- [Red Team Documentation](https://www.dodoguard.dev/docs/usage/red-teaming/)
- [Red Team Strategies](https://www.dodoguard.dev/docs/usage/red-teaming/strategies/)
- [Other Red Team Examples](https://www.dodoguard.dev/docs/usage/red-teaming/examples/)
