# openai-structured-output (OpenAI Structured Output Example)

This example demonstrates how to define JSON schemas for OpenAI's Structured Output feature in two different ways:

1. **Inline schema definition** - defined directly in the config file
2. **External schema file** - stored in a separate JSON or YAML file and referenced with `file://`

## Usage

You can run this example with:

```bash
npx dodoguard@latest init --example openai-structured-output
```

## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key

## Example Structure

This example includes several files that demonstrate different approaches:

| File                             | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `dodoguardconfig.chat.yaml`      | Chat API config using both inline and external schemas      |
| `dodoguardconfig.responses.yaml` | Responses API config using both inline and external schemas |
| `schema.responses.yaml`          | External schema file for Responses API                      |
| `schema.chat.json`               | External schema file for Chat API                           |

## Running the Example

```bash
cd openai-structured-output
dodoguard eval -c dodoguardconfig.chat.yaml
dodoguard eval -c dodoguardconfig.responses.yaml
```

## Additional Resources

- [OpenAI Structured Output Announcement](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- [DodoGuard Documentation](https://dodoguard.dev)
