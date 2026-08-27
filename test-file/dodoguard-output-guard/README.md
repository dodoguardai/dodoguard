## DodoGuard Output Guard

**Author:** dodoguard
**Version:** 0.0.1
**Type:** tool

### Description

Dify tool plugin demo for checking generated output with a sliding window.

> Replace the placeholder sections below with real content before publishing to the Dify Marketplace, then remove this note.
> Keep this file in English only — a README.md containing Chinese characters will be rejected during review.
> For translated documentation, add localized files such as `README_zh_Hans.md` instead. See the [multilingual README guide](https://docs.dify.ai/en/develop-plugin/features-and-specs/plugin-types/multilingual-readme).

### Setup

This demo is self-contained and does not require credentials. The production version
can replace the local detector with a DodoGuard API call.

### Usage

Add the tool to a Dify workflow after the LLM node. Pass the generated text to
`待检测文本`, then branch on `allowed`: continue when it is `true`, and return a
safe refusal when it is `false`.

The default window size is 500 characters and the default step is 400 characters.
The demo detects example phone numbers, email addresses, ID-card-like values and
API-key-like strings. It is not a production content-safety policy.
