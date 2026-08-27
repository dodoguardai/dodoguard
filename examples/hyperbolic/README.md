# hyperbolic

This directory contains examples for testing Hyperbolic AI models with DodoGuard.

You can run this example with:

```bash
npx dodoguard@latest init --example hyperbolic
```

## Examples

### Quick Test (`dodoguardconfig.yaml`)

Basic functionality test with Llama-3.1-70B to verify API connectivity.

### Reasoning Models (`dodoguardconfig.reasoning.yaml`)

Creative reasoning puzzles using DeepSeek-V3 and Llama-3.1-70B models.

### Image Generation (`dodoguardconfig.image-generation.yaml`)

Text-to-image generation using SDXL1.0-base model.

### Audio Generation (`dodoguardconfig.audio-generation.yaml`)

Text-to-speech synthesis using Melo-TTS model.

### Multimodal Vision (`dodoguardconfig.multimodal.yaml`)

Vision-language tasks using Qwen2.5-VL-7B model.

## Running the Examples

To run any of these examples:

```bash
# Quick connectivity test
npx dodoguard eval -c dodoguardconfig.yaml

# Reasoning capabilities
npx dodoguard eval -c dodoguardconfig.reasoning.yaml

# Image generation
npx dodoguard eval -c dodoguardconfig.image-generation.yaml

# Audio synthesis
npx dodoguard eval -c dodoguardconfig.audio-generation.yaml

# Vision-language tasks
npx dodoguard eval -c dodoguardconfig.multimodal.yaml

# View results in web UI
npx dodoguard view
```

## Prerequisites

- Hyperbolic API key set in `HYPERBOLIC_API_KEY` environment variable
- Get your API key from [https://app.hyperbolic.xyz](https://app.hyperbolic.xyz)

## Notes

- Free tier allows 60 requests/minute, Pro tier allows 600 requests/minute
- Some models may require Pro tier access
- See [Hyperbolic provider documentation](https://dodoguard.dev/docs/providers/hyperbolic) for detailed configuration options
