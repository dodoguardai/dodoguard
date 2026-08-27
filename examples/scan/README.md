# Scan CLI 示例

本目录包含 `dodoguard scan` 命令的任务配置示例。

完整使用说明见：[docs/cli-scan-usage.md](../../docs/cli-scan-usage.md)

## 配置文件安全

- `task.template.yaml` 是可提交的模板，不应包含真实密钥。
- 使用时复制到仓库根目录的本地文件，例如 `scan-task.yaml` 或 `my-scan.yaml`。
- `scan-task.yaml`、`my-scan.yaml`、`*.scan.local.yaml`、`scan-results*.json` 已在 `.gitignore` 中忽略，适合放真实目标信息和扫描结果。

```bash
cp examples/scan/task.template.yaml scan-task.yaml
export DIFY_API_KEY=app-your-key
```

## 正式用法（推荐）

```bash
npm install
npm run build:cli
npm link

export DIFY_API_KEY=app-your-key

dodoguard scan --help
dodoguard scan validate -c scan-task.yaml
dodoguard scan run -c scan-task.yaml -o ./scan-results.json
```

若曾执行失败的 `npm run build` 导致 `dist/` 不完整，CLI 会自动回退到源码运行；也可手动：

```bash
npm run build:clean
npm run build:cli
npm link
```

## 仓库内开发调试

```bash
cp examples/scan/task.template.yaml scan-task.yaml
npm run local -- scan validate -c scan-task.yaml
npm run local -- scan create -c scan-task.yaml --json
npm run local -- scan list
npm run local -- scan run -c scan-task.yaml -o ./scan-results.json
```

`dodoguard scan` 与 `npm run local -- scan` 是同一套命令，后者仅用于在本项目源码中跑未发布版本。
