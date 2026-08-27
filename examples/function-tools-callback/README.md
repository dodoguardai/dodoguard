# function-tools-callback (Function Tool Callbacks Example)

You can run this example with:

```bash
npx dodoguard@latest init --example function-tools-callback
```

This example demonstrates how to use DodoGuard to evaluate OpenAI's function calling capabilities with the gpt-4o, utilizing the `functionToolCallbacks` feature.

## Configuration

See `dodoguardconfig.js` for the full configuration, including prompts, provider setup, and test cases.

## Running the Example

```
dodoguard eval -c [path to examples/function-tools-callback/]dodoguardconfig.js
```

For more details on function calling and OpenAI tools, refer to:

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [DodoGuard OpenAI Provider Documentation](https://dodoguard.dev/docs/providers/openai)
