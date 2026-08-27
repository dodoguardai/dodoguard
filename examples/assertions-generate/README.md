# assertion-generate (Assertion Generation Example)

You can run this example with:

```bash
npx dodoguard@latest init --example assertion-scoring-override
```

This example demonstrates valid configs for assertion generation in DodoGuard.

1. A DodoGuard config with prompts + assertions
2. A DodoGuard config with just 1 prompt, and no assertions or test cases

## Getting Started

Try the following options:

Generate initial set of assertions (for a config that has none)

```bash
dodoguard generate assertions --config examples/assertions-generate/dodoguardconfig-minimal.yaml -o test.yaml --type llm-rubric
```

Generate missing llm-rubric assertions (for a config that already has some)

```bash
dodoguard generate assertions --config examples/assertions-generate/dodoguardconfig.yaml -o test.yaml --type llm-rubric
```
