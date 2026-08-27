# gpt-4o-vs-4o-mini (Comparing GPT-4o and GPT-4o-Mini)

You can run this example with:

```bash
npx dodoguard@latest init --example gpt-4o-vs-4o-mini
```

## Quick Start

1. Initialize this example by running:

   ```bash
   npx dodoguard@latest init --example gpt-4o-vs-4o-mini
   ```

2. Navigate to the newly created `gpt-4o-vs-4o-mini` directory:

   ```bash
   cd gpt-4o-vs-4o-mini
   ```

3. Set an OpenAI API key directly in your environment:

   ```bash
   export OPENAI_API_KEY="your_openai_api_key"
   ```

   Alternatively, you can set the API key in a `.env` file:

   ```
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the evaluation with:

   ```bash
   npx dodoguard@latest eval --no-cache
   ```

   Note: the `--no-cache` flag is required because the example uses a [latency assertion](https://www.dodoguard.dev/docs/configuration/expected-outputs/deterministic/#latency) which does not support caching.

5. View the results:

   ```bash
   npx dodoguard@latest view
   ```

   The expected output will include the responses from both models for the provided riddles, allowing you to compare their performance side by side.
