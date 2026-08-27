# openai-vision (OpenAI Vision Model Example)

This example demonstrates how to use DodoGuard to evaluate OpenAI's vision capabilities, allowing you to test models on their ability to analyze and describe images.

## Features Demonstrated

- Using OpenAI's GPT-4o with vision capabilities
- Incorporating images in prompts using JSON format
- Passing image URLs as variables
- Testing vision model responses against expected content

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Running the Example

You can run this example with:

```bash
npx dodoguard@latest init --example openai-vision
# and then
cd openai-vision

# Run the evaluation
npx dodoguard eval

# View the results
npx dodoguard view
```

## Example Configuration

This example:

1. Uses a JSON-formatted prompt that includes both text and image inputs
2. Passes image URLs as variables that can be changed for each test case
3. Tests the model's ability to accurately describe image content
4. Demonstrates how to transform variables to generate markdown image tags

## Key Technical Features

- JSON prompt structure for multi-modal inputs
- Image URL handling through variable substitution
- Simple assertions to validate image content recognition
- Variable transformation to generate additional context

## Documentation

For more information, see:

- [OpenAI Vision API Documentation](https://platform.openai.com/docs/guides/vision)
- [DodoGuard OpenAI Provider Documentation](https://dodoguard.dev/docs/providers/openai#sending-images-in-prompts)
