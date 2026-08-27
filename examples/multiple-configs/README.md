# multiple-configs (Multiple Configs)

You can run this example with:

```bash
npx dodoguard@latest init --example multiple-configs
```

To get started, set your OPENAI_API_KEY environment variable.

Next, edit dodoguardconfig.yaml.

Then run:

```
dodoguard eval -c configs/*
```

or

```
dodoguard eval -c configs/config1.yaml configs/config2.yaml
```

Afterwards, you can view the results by running `dodoguard view`
