# redteam-dalle (DALL-E Red Team Example)

You can run this example with:

```bash
npx dodoguard@latest init --example redteam-dalle
```

This example demonstrates how to use DodoGuard to automatically discover jailbreaks in OpenAI's DALL-E image generation model. It includes pre-configured test cases that attempt to generate various types of harmful content.

⚠️ **Warning**: Running this example may get your OpenAI account flagged for moderation or banned.

## Setup

1. Set your OpenAI API key:

   ```sh
   export OPENAI_API_KEY=your_key_here
   ```

2. Initialize the example:
   ```sh
   npx dodoguard@latest init --example redteam-dalle
   ```

## Usage

1. Review and optionally modify the test cases in `dodoguardconfig.yaml`. The example includes the same test cases shown in our [blog post](https://dodoguard.dev/blog/jailbreak-dalle).

2. Run the evaluation:

   ```sh
   npx dodoguard@latest eval
   ```

3. View the results in the web UI:

   ```sh
   npx dodoguard@latest view
   ```

   Important table settings:
   - Under TABLE SETTINGS, enable "Render model outputs as Markdown" to display generated images
   - Set "Max text length" to unlimited to view complete responses
   - Click the magnifying glass icon (🔍) in the "View output and test details" column to see the final modified prompt that was used, complete conversation history, and scoring breakdown for each iteration.

## Expected Behavior

During evaluation, you may see error messages like:

```
Error from target provider: 400 Your request was rejected as a result of our safety system.
Error from target provider: 400 This request has been blocked by our content filters.
```

This is normal expected behavior. DodoGuard automatically retries with modified prompts in a loop until it succeeds or reaches the maximum number of iterations.

## Configuration

- The default configuration uses 4 iterations per test case. To increase this (and potentially find more jailbreaks), set:

  ```sh
  export DODOGUARD_NUM_JAILBREAK_ITERATIONS=6
  ```

- For debugging or to see the internal workings, enable debug logging:

  ```sh
  LOG_LEVEL=debug npx dodoguard@latest eval -j 1
  ```

## Troubleshooting

Note: DALL-E image URLs expire after 2 hours. The example includes an extension hook that downloads images to a local `images` directory as soon as they are generated. Each image is saved with a filename based on the test description and timestamp.

- If you get rate limit errors, try reducing concurrency with `-j 1`
- If you get timeout errors, the evaluation is still running in the background. Wait a few minutes and check the results
- For other issues, please check our [documentation](https://dodoguard.dev/docs/red-team) or [file an issue](https://github.com/dodoguard/DodoGuard/issues)

## Learn More

For more details about LLM red teaming with DodoGuard, check out:

- [Red Team Documentation](https://dodoguard.dev/docs/red-team)
- [Blog Post: Automated jailbreaking techniques with Dall-E](https://dodoguard.dev/blog/jailbreak-dalle)
