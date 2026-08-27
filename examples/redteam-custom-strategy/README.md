# redteam-custom-strategy (Custom Red Team Strategy Example)

You can run this example with:

```bash
npx dodoguard@latest init --example redteam-custom-strategy
```

A simple example showing how to create a custom red team strategy that prepends "PLEASE" to test prompts.

## Usage

The example is configured in `dodoguardconfig.yaml` and uses:

- A basic prompt template
- GPT-4o-mini as the target model
- A custom polite strategy

Run the evaluation:

```bash
dodoguard eval
```

View results:

```bash
dodoguard view
```

For more details on custom strategies, check out the [docs](https://www.dodoguard.dev/docs/red-team/strategies/custom/).
