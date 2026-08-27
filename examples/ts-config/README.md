# ts-config (TypeScript Configuration Example for DodoGuard)

You can run this example with:

```bash
npx dodoguard@latest init --example ts-config
```

This guide demonstrates how to set up a TypeScript configuration for DodoGuard using `dodoguardconfig.ts`.

## Prerequisites

- Node.js 20 or later
- A TypeScript loader for Node.js such as `@swc-node/register` or `tsx`

Install your chosen loader:

```bash
npm install @swc-node/register
# or
npm install tsx
```

## Running the Evaluation

Execute the evaluation using one of the following commands:

```bash
# Using @swc-node/register
NODE_OPTIONS='--import @swc-node/register/esm-register' dodoguard eval -c examples/ts-config/dodoguardconfig.ts

# Using tsx
NODE_OPTIONS="--import tsx" dodoguard eval -c examples/ts-config/dodoguardconfig.ts
```

View the results:

```bash
dodoguard view
```

## TypeScript Support in Node.js

- Currently, Node.js requires external loaders to run TypeScript files directly. However, future versions of Node.js are expected to include native TypeScript support:
- Node.js 20 introduced the `--experimental-loader` flag for ES module.
- The Node.js team is actively working on enhancing TypeScript integration.
- Future versions may reduce or eliminate the need for external loaders.
