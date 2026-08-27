---
title: Install DodoGuard
description: Learn how to install dodoguard using npm, npx, or Homebrew. Set up dodoguard for command-line usage or as a library in your project.
keywords: [install, installation, npm, npx, homebrew, setup, dodoguard]
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

## Requirements

- Node.js 20 or newer
- Supported operating systems: macOS, Linux, Windows

## For Command-Line Usage

Install dodoguard using [npx](https://nodejs.org/en/download), [npm](https://nodejs.org/en/download), or [brew](https://brew.sh/):

<Tabs groupId="dodoguard-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      npm install -g dodoguard
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx dodoguard@latest
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      brew install dodoguard
    </CodeBlock>
  </TabItem>
</Tabs>

## For Library Usage

Install `dodoguard` as a library in your project:

```sh
npm install dodoguard --save
```

## Verify Installation

To verify that dodoguard is installed correctly, run:

<Tabs groupId="dodoguard-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      dodoguard --version
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx dodoguard@latest --version
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      dodoguard --version
    </CodeBlock>
  </TabItem>
</Tabs>

This should display the version number of dodoguard:

```text
0.114.7
```

## Run DodoGuard

After installation, you can start using dodoguard by running:

<Tabs groupId="dodoguard-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      dodoguard init
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx dodoguard@latest init
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      dodoguard init
    </CodeBlock>
  </TabItem>
</Tabs>

This will create a `dodoguardconfig.yaml` placeholder in your current directory.

For more detailed usage instructions, please refer to our [Getting Started guide](./getting-started.md).

## See Also

- [Getting Started](./getting-started.md)
- [Contributing](./contributing.md)
