# custom-provider-mjs (Custom Provider Mjs)

You can run this example with:

```bash
npx dodoguard@latest init --example custom-provider-mjs
```

This example uses a custom API provider in `customProvider.mjs`. It also uses CSV test cases.

Run:

```
dodoguard eval
```

Full command-line equivalent:

```
dodoguard eval --prompts prompts.txt --tests vars.csv --providers openai:chat --output output.json --providers customProvider.js
```
