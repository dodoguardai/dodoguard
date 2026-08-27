# 桌面端应用打包说明

DodoGuard 桌面端使用 Electron / electron-builder 打包。打包产物默认输出到 `release/` 目录。

## 常用命令

```bash
# 检查桌面端资源和三平台打包配置
npm run desktop:preflight

# 构建桌面端所需的后端与前端资源
npm run desktop:build

# 生成当前平台可用的分发包
npm run desktop:dist

# Windows 内置 MySQL 安装包
npm run desktop:dist:win:bundle

# macOS 内置 MySQL dmg 安装包
npm run desktop:dist:mac:bundle

# macOS universal dmg 安装包
npm run desktop:dist:mac:universal

# Linux x64 内置 MySQL AppImage（推荐交付物）
npm run desktop:dist:linux:bundle
```

如果本地网络代理影响 electron-builder 下载依赖，可以使用对应的 `:noproxy` 命令：

```bash
npm run desktop:dist:win:noproxy
npm run desktop:dist:mac:noproxy
npm run desktop:dist:linux:noproxy
```

## Linux 打包产物

Linux 已支持随包内置 MySQL 8、`dodoguard.sql` 和首次安装向导。推荐生成跨发行版可用的 AppImage：

```bash
npm run desktop:dist:linux:bundle
```

该命令会下载 Linux x64 GLIBC MySQL 便携包，并生成 `release/DodoGuard-<version>.AppImage`。

如果需要 Debian/Ubuntu 安装包，可在 Linux（建议 Ubuntu）构建机上执行：

```bash
npm run desktop:fetch-mysql:linux
npm run desktop:dist:linux
```

该命令会尝试同时生成 AppImage 和 deb。macOS 交叉构建 deb 的兼容性不稳定，因此本机交付以 AppImage 为准。

### AppImage

AppImage 类似绿色版应用，不需要安装。把 `release/DodoGuard-<version>.AppImage` 拷到 Linux 机器后执行：

```bash
chmod +x DodoGuard-<version>.AppImage
./DodoGuard-<version>.AppImage
```

如果系统提示缺少 FUSE，可以在 Ubuntu / Debian 上安装：

```bash
sudo apt install libfuse2
```

也可以不依赖 FUSE，解包后运行：

```bash
./DodoGuard-<version>.AppImage --appimage-extract
./squashfs-root/AppRun
```

AppImage 适合快速分发、测试，或给不同 Linux 发行版使用。

### deb

deb 是 Ubuntu / Debian / Linux Mint 等 Debian 系系统的安装包。生成后可安装：

```bash
sudo apt install ./release/*.deb
```

安装后应用通常会进入系统菜单和应用列表，体验更接近正式安装的软件。

## macOS 上打 Linux 包的注意事项

在 macOS 上执行 `npm run desktop:dist:linux` 时，AppImage 可能已经成功生成，但 deb 可能在 `FpmTarget` 阶段失败。

这是因为 electron-builder 打 deb 时依赖 `fpm` 相关工具链。macOS 交叉打 deb 经常会遇到 Ruby / fpm / 系统依赖不完整或兼容性问题。

因此推荐：

- 只需要 Linux 可运行包时，优先使用 AppImage。
- 需要 deb 安装包时，最好在 Ubuntu / Linux 环境里执行 `npm run desktop:dist:linux`。

Windows、macOS 和 Linux x64 安装包都会附带便携版 MySQL 8，首次启动显示“DodoGuard 首次安装向导”：检查环境、在本机 `127.0.0.1:13306` 初始化数据库、导入离线数据，随后启动应用。数据库数据和随机生成的应用数据库密码只保存在用户本地应用数据目录；MySQL 仅监听本机回环地址。

打包前应准备 `release/dodoguard.sql`。该文件会被放入安装包的 `resources/dodoguard-offline/dodoguard.sql`，首次安装时导入，随后由应用执行 `drizzle/` 下的后续迁移。若 `desktop/vendor/mysql/` 不存在，使用 `desktop:dist:*:bundle` 命令会自动下载所需 MySQL 组件。

Windows 构建脚本使用 `cross-env` 设置 Node 内存参数，可在 PowerShell、cmd 和 macOS/Linux shell 中执行。

仓库中的 `.github/workflows/desktop-build.yml` 会在 `safe` 分支相关代码变更后分别使用 Windows、macOS 和 Ubuntu runner 构建安装包，并上传到 GitHub Actions artifacts。该流程只负责验证和产物留存，不自动发布到外部仓库。

如果在 macOS 上只想生成 AppImage，可以直接运行：

```bash
npm run desktop:build
electron-builder --linux AppImage
```

如果要在 Linux 环境生成 AppImage + deb：

```bash
npm install
npm run desktop:dist:linux
```
