# self-grading (Self Grading)

You can run this example with:

```bash
npx dodoguard@latest init --example self-grading
```

This example shows how you can have an LLM grade its own output according to predefined expectations.

Identical configurations are provided in `dodoguardconfig.js` and `dodoguardconfig.yaml`.

Run:

```
dodoguard eval
```

You can also define the tests in a CSV file:

```
dodoguard eval --tests tests.csv
```
