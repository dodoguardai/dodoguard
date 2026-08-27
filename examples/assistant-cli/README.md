# assistant-cli (Assistant Cli)

You can run this example with:

```sh
npx dodoguard@latest init --example assistant-cli
```

This example shows how you can use DodoGuard to generate a side-by-side eval of two prompts for an e-commerce chat bot.

Configuration is in `dodoguardconfig.yaml`. Run:

```sh
dodoguard eval
```

Full command-line equivalent:

```sh
dodoguard eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-4.1-mini --output output.json
```
