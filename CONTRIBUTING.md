# Contributing to DodoGuard

感谢贡献 DodoGuard。

1. 使用 Node.js 20+，执行 `npm ci`。
2. 修改前请先阅读 [README.md](./README.md)；请勿提交 `.env`、私钥、真实目标地址、扫描结果或导出的客户数据。
3. 提交前运行 `npm run format:check`、`npm run lint` 和 `npm test`。
4. 新功能或修复应包含相应测试；安全问题请遵循 [SECURITY.md](./SECURITY.md)，不要公开提交 issue。

提交信息建议遵循 Conventional Commits，例如 `fix: handle empty scan result`。
