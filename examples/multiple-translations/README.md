# multiple-translations (Multiple Translations)

Evaluate translation quality across multiple languages using standard dodoguard evals and [scenarios](https://www.dodoguard.dev/docs/configuration/scenarios/).

You can run this example with:

```bash
npx dodoguard@latest init --example multiple-translations
cd multiple-translations
```

## Environment Variables

Set at least one API key:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

## Usage

**Array-based testing (default):**

```bash
dodoguard eval
dodoguard view
```

**Scenario-based testing:**

```bash
dodoguard eval -c dodoguardconfig-scenarios.yaml
dodoguard view
```
