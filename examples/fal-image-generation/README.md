# fal-image-generation (fal.ai Image Generation Example)

You can run this example with:

```bash
npx dodoguard@latest init --example fal-image-generation
```

Demonstrates how to evaluate and compare image generation models using DodoGuard.

## Setup

1. **Get your API key** from [fal.ai dashboard](https://fal.ai/dashboard/keys)
2. **Set environment variable**:
   ```bash
   export FAL_KEY=your-fal-key-here
   ```
3. **Install client**:
   ```bash
   npm install @fal-ai/client
   ```
4. **Run the evaluation**:
   ```bash
   dodoguard eval
   ```

## What This Example Shows

- **Model comparison**: Two different fal.ai models side-by-side
- **Creative prompts**: 7 test cases with artistic styles
- **Reproducible results**: Fixed seeds for consistent outputs
- **Configuration options**: Different settings per model

## Example Output

The evaluation generates a comparison table showing:

- Model performance across different prompts
- Generated images in markdown format
- Execution time and caching behavior

## View Results

```bash
dodoguard view
```

Opens the web interface to browse generated images and compare model outputs.

## Customize the Example

Edit `dodoguardconfig.yaml` to:

- Try different models from [fal.ai/models](https://fal.ai/models)
- Add your own prompts
- Adjust model parameters
- Add assertions to test output quality

## Documentation

- [DodoGuard fal provider](https://dodoguard.dev/docs/providers/fal)
- [fal.ai models](https://fal.ai/models)
