# google-sheets (Google Sheets)

You can run this example with:

```bash
npx dodoguard@latest init --example google-sheets
```

This example shows how to use an external Google Sheet to run tests. To get
started, set your OPENAI_API_KEY environment variable.

Next, duplicate the Google Sheet in dodoguardconfig.yaml and replace the URL.

Then run:

```
dodoguard eval
```

Afterwards, you can view the results by running `dodoguard view`
