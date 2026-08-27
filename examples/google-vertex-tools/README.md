# google-vertex-tools (Google Vertex Tools)

Example configurations for testing Google Vertex AI models with function calling and tool callbacks.

You can run this example with:

```bash
npx dodoguard@latest init --example google-vertex-tools
```

## Purpose

This example demonstrates how to use [Vertex AI models](https://www.dodoguard.dev/docs/providers/vertex/) with:

- Function calling and tool declarations
- Function callback execution with local implementations
- Different configuration approaches (YAML vs JavaScript)

## Prerequisites

1. Install the Google Auth Library:

   ```sh
   npm install google-auth-library
   ```

2. Enable the Vertex AI API in your Google Cloud project

3. Configure your Google Cloud project:

   ```sh
   gcloud config set project PROJECT_ID
   ```

4. Set up authentication using one of these methods:
   - Authenticate with your Google account:

     ```sh
     gcloud auth application-default login
     ```

   - Use a machine with an authorized service account
   - Use service account credentials file:
     1. Download your service account JSON
     2. Set the credentials path:

        ```sh
        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
        ```

## Configurations

This example includes two different approaches:

### Basic Tool Declaration (`dodoguardconfig.yaml`)

Uses external tool definitions and validates function calls without execution:

- `dodoguardconfig.yaml` - YAML configuration with external tools
- `tools.json` - Function definitions for weather lookup

### Function Callbacks (`dodoguardconfig-callback.js`)

Demonstrates actual function execution with local callbacks:

- `dodoguardconfig-callback.js` - JavaScript configuration with inline tools and callbacks
- Includes local function implementation for adding numbers

## Running the Examples

1. **Basic tool declaration example:**

   ```sh
   dodoguard eval -c dodoguardconfig.yaml
   ```

2. **Function callback example:**

   ```sh
   dodoguard eval -c dodoguardconfig-callback.js
   ```

3. **View results:**

   ```sh
   dodoguard view
   ```

## Expected Results

- **Basic example**: Validates that the model correctly calls the weather function with proper parameters
- **Callback example**: Actually executes the addition function and validates the computed results

## Learn More

- [Vertex AI Provider Documentation](https://www.dodoguard.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Function Calling Documentation](https://www.dodoguard.dev/docs/providers/vertex/#function-calling)
- [DodoGuard Documentation](https://www.dodoguard.dev/docs/)
