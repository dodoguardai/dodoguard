# claude-vs-gpt-image (Image Analysis Example)

You can run this example with:

```bash
npx dodoguard@latest init --example claude-vs-gpt-image
```

This example compares an image analysis task using:

- gpt-4.1 via OpenAI
- claude-sonnet-4 via Amazon Bedrock
- claude-3.5 via Anthropic

GPT-4.1 and Claude have different prompt formats. We use custom provider functions in Python and JavaScript to dynamically format the prompt based on context about the provider. The responses are scored using `llm-rubric` with a vision-capable OpenAI model.

To get started, set your environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

If you do not have access to all of these providers, simply comment out the providers you do not have access to in `dodoguardconfig.yaml`.

Then run:

```sh
npx dodoguard@latest eval
```

Afterwards, you can view the results by running:

```sh
npx dodoguard@latest view
```
