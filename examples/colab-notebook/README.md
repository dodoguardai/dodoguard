# colab-notebook (Colab Notebook)

You can run this example with:

```bash
npx dodoguard@latest init --example colab-notebook
```

This example walks through running **DodoGuard** inside a Google Colab notebook.

## Prerequisites

- Google Colab account (free tier is sufficient)
- API keys for LLM providers:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)

## Quick Start

Open [dodoguard_example.ipynb](./dodoguard_example.ipynb) in Google Colab and run each cell. The notebook installs DodoGuard, sets up API keys, and demonstrates a few evaluations.

## Expected Results

The notebook will:

- Install DodoGuard in the Colab environment
- Run sample evaluations comparing different models
- Display evaluation results and metrics
- Show how to export results for further analysis
