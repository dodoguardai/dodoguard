# multishot (Multishot)

You can run this example with:

```bash
npx dodoguard@latest init --example multishot
```

This example is pre-configured in `dodoguardconfig.yaml` (both identical examples). That means you can just run:

```
dodoguard eval
```

To override prompts, providers, output, etc. you can run:

```
dodoguard eval --prompts prompt1.json prompt2.json --providers openai:chat:gpt-4.1-mini --output output.json
```
