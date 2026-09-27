<div align="center">

🇺🇸 <a href="README.md">English</a> | 🇨🇳 <a href="README.zh.md">中文</a>

<h1>JevOS</h1>

<img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0" />

<img src="assets/jevos-banner.png" alt="JevOS 工具围绕共同任务组合" width="100%" />

</div>

## 引言

JevOS 是可安装的智能桌面，工具围绕当前任务组合。Jev 判断工具和布局，语言模型生成微应用，笔记和应用状态随工作持续保存。

本仓库提供 JevOS 最新桌面与网站源码。

## 网站

[打开 JevOS](https://junkaiwang-theophy.github.io/JevOS/) · 下载桌面版，或在浏览器体验本地工具。

## 运行

使用 Node 22.x 中的 22.12+ 版本，或 Node 24+，以及 npm 10+。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:5173`。填写 `TYPESAFE_API_KEY` 启用 Jev，填写 `APP_GENERATOR_API_KEY`、`APP_GENERATOR_MODEL` 启用应用生成。可用 `APP_GENERATOR_BASE_URL` 指定兼容接口。打开模型设置即可配置服务。

```sh
npm run build
PORT=4273 npm run preview
```

任务与应用数据保存在 `.data/`。

## macOS 下载

在[发布页面](https://github.com/JunkaiWang-TheoPhy/JevOS/releases)下载 JevOS。先退出 JevOS，再将应用拖入 Applications。支持 Apple Silicon、macOS 13+。

发布附件包含 DMG、完整源码、文件清单和 SHA-256。原生宿主源码位于 `packaging/macos/JevOS.swift`。

## 许可与联系

应用代码采用 [AGPL-3.0](LICENSE)。依赖、字体和其他素材保留上游许可，见 [THIRD_PARTY.md](THIRD_PARTY.md) 与 `public/brand/fonts/` 中的许可文件。

[WangTheoPhys@outlook.com](mailto:WangTheoPhys@outlook.com) · [个人网站](https://Junkaiwang-theophy.github.io)
