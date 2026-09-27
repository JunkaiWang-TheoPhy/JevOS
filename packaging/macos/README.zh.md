# JevOS macOS 包装

这是与网页源码分离的原生薄宿主：WKWebView 显示本地工作台，随包 Node 22 启动本地 API 和 SQLite。无需 Electron、用户全局 Node 或终端启动。

## 两版隔离

| 版本 | 输入 | 宿主端口 | 配置与数据库目录 |
|---|---|---:|---|
| JevOS Classic | 原目录现有 dist；后端采用已验收的 a2f6551 跟踪源码 | 4373 | `~/Library/Application Support/dev.jevos.classic/` |
| JevOS Next | 新版隔离工作树的稳定 dist 与 server | 4473 | `~/Library/Application Support/dev.jevos.next/` |

网页预览的 4173/4273 不会被替代。模型设置通过应用菜单修改，只保存在当前用户可读的本机配置中；关闭应用会终止自己的后端。首次安装为无密钥、无私人数据库的独立实例。网络模型仍需要相应凭据和网络。

Jev Key 或 LLM Key/模型未填写时，每次启动都会打开配置提示。“关闭提示”仅本次隐藏；标题栏提供“重新打开配置”和“重启并打开配置”。保存不完整的配置后仍会提醒。填写字段与实际服务连接成功分别判断，不将已填写误称为已验证。

## 构建与验收

先让集成任务完成各版网页构建，再在这个隔离工作树中执行：

```sh
python3 packaging/macos/build.py --app-only
python3 packaging/macos/build.py
```

多任务同时开发时，可用 `--flavor next --next-root /path/to/frozen-source` 从冻结副本打包。副本须包含 `dist`、`server`、源码、`LICENSE` 和 `node_modules/zod`，后者可以链接到已安装的依赖。最终包的 Snapshot 应与该副本核对，避免混入打包期间的新改动。

产物在 `packaging/macos/dist/`。DMG 使用 HFS+ 文件系统，包含对应应用、Applications 快捷入口、安装说明和对应源码压缩包。运行时、源码、模型配置三者分离，打包只复制指定产物，不复制 `.env.local` 或 `.data`。新版仍在迭代时，产物仅是当次快照；最终交付应在网页构建冻结后重新执行脚本。

本机测试可给应用可执行文件传入 `--smoke-test`，并通过 `JEVOS_APP_SUPPORT_DIR` 指定一次性测试数据目录。该模式启动自己的服务、用 WKWebView 加载真实生产页面、确认 React 内容渲染，然后清理后端退出。

旧版正在运行时，可用 `JEVOS_SMOKE_PORT` 给烟测指定独立端口；此变量只在 `--smoke-test` 模式生效，正常启动仍用版本固定端口。安装更新前应退出旧版应用。

当前构建目标为 Apple Silicon、macOS 13+，采用临时签名。给其他用户正式分发需 Developer ID 签名与 Apple 公证；此脚本没有上传公证或绕过 Gatekeeper。

## 来源与工具

- 本机 Swift 编译器与 Apple Cocoa/WebKit 框架。
- 随包 Node 官方发行版及其 LICENSE，Zod 保留上游 LICENSE。
- 应用代码沿用项目 AGPL-3.0，对应源码在应用 Resources 中。
- [Apple 打包说明](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)。
