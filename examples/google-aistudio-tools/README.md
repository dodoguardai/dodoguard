# google-aistudio-tools

This example demonstrates how to use Google AI Studio's function calling, search capabilities, code execution, and URL context features with DodoGuard.

You can run this example with:

```bash
npx dodoguard@latest init --example google-aistudio-tools
```

## Prerequisites

- Google AI Studio API key set as `GOOGLE_API_KEY` in your environment

## Overview

This example shows how to:

1. **Function Calling**: Use Gemini to invoke predefined functions based on user queries
2. **Google Search Integration**: Get up-to-date information from the web using Gemini models with search grounding
3. **Code Execution**: Execute Python code to solve computational problems
4. **URL Context**: Extract and analyze content from web URLs

## Function Calling Example

The function calling configuration (`dodoguardconfig.yaml`) demonstrates:

- Defining a weather function in `tools.json`
- Validating that Gemini models correctly produce structured function calls
- Testing that the location parameter matches the user's query

Run with:

```bash
dodoguard eval -c dodoguardconfig.yaml
```

## Search Grounding Example

The search grounding configuration (`dodoguardconfig.search.yaml`) demonstrates:

- Using Gemini 2.5 Flash with Google Search as a tool
- Using Gemini 2.5 Pro with thinking capabilities and Search grounding
- Using Gemini 1.5 Flash with dynamic retrieval configuration
- Testing queries that benefit from real-time web information
- Verifying responses include relevant information

Run with:

```bash
dodoguard eval -c dodoguardconfig.search.yaml
```

## Code Execution Example

The code execution configuration (`dodoguardconfig.codeexecution.yaml`) demonstrates:

- Testing computational problems that require code to solve
- Verifying that the answer is correct from the code execution

Run with:

```bash
dodoguard eval -c dodoguardconfig.codeexecution.yaml
```

## URL Context Example

The URL context configuration (`dodoguardconfig.urlcontext.yaml`) demonstrates:

- Using Gemini to extract and analyze content from web URLs
- Combining URL context with search capabilities

Run with:

```bash
dodoguard eval -c dodoguardconfig.urlcontext.yaml
```

## Example Files

- `dodoguardconfig.yaml`: Function calling configuration
- `dodoguardconfig.search.yaml`: Search grounding configuration
- `dodoguardconfig.codeexecution.yaml`: Code execution configuration
- `dodoguardconfig.urlcontext.yaml`: URL context configuration
- `tools.json`: Function definition for the weather example

## Notes on Google Search Integration

When using Search grounding in your own applications:

- The API response includes search metadata and sources
- Google requires displaying "Google Search Suggestions" in user-facing apps
- Models can retrieve current information about events, prices, and technical updates

### Search Methods

This example demonstrates three approaches to search:

1. **Search as a tool** (Gemini 2.5): Allows the model to decide when to use search

   ```yaml
   tools:
     - googleSearch: {}
   ```

2. **Search with thinking** (Gemini 2.5): Adds thinking capabilities for better reasoning

   ```yaml
   generationConfig:
     thinkingConfig:
       thinkingBudget: 1024
   tools:
     - googleSearch: {}
   ```

3. **Dynamic retrieval** (Gemini 1.5): Controls when to use search with threshold settings
   ```yaml
   tools:
     - googleSearchRetrieval:
         dynamicRetrievalConfig:
           mode: 'MODE_DYNAMIC'
           dynamicThreshold: 0 # 0 = always use search, 1 = never use search
   ```

## Further Resources

- [Google AI Studio Function Calling documentation](https://ai.google.dev/docs/function_calling)
- [Google AI Studio Search Grounding documentation](https://ai.google.dev/docs/gemini_api/grounding)
- [DodoGuard Google Provider documentation](/docs/providers/google)
