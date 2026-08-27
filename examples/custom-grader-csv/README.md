# custom-grader-csv (Custom Grader Csv)

You can run this example with:

```bash
npx dodoguard@latest init --example custom-grader-csv
```

This example uses a custom assertion in `customAssertion.ts` and reads test cases from `tests.csv`.
The `__expected` column in `tests.csv` points to this assertion script.

Run:

```
dodoguard eval
```

Full command-line equivalent:

```
dodoguard eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-4.1-mini --output output.json
```
