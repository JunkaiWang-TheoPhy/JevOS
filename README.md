<div align="center">

🇺🇸 <a href="README.md">English</a> | 🇨🇳 <a href="README.zh.md">中文</a>

<h1>JevOS</h1>

<img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0" />

<img src="assets/jevos-banner.png" alt="JevOS task tools arranged around shared work" width="100%" />

</div>

## Introduction

JevOS is an installable desktop that arranges tools around your task. Jev selects tools and layouts, a language model generates miniature apps, and notes and application state persist as you work.

This repository contains the latest JevOS desktop and website source.

## Website

[Open JevOS](https://junkaiwang-theophy.github.io/JevOS/) · Download the desktop or try local tools in the browser.

## Run

Use Node 22.12+ in the 22.x series, or Node 24+, and npm 10+.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. Set `TYPESAFE_API_KEY` for Jev and `APP_GENERATOR_API_KEY` / `APP_GENERATOR_MODEL` for app generation. An optional `APP_GENERATOR_BASE_URL` selects an OpenAI-compatible endpoint. Enter your own API keys in model settings.

```sh
npm run build
PORT=4273 npm run preview
```

Task and application data are stored in `.data/`.

## macOS download

Download JevOS from [Releases](https://github.com/JunkaiWang-TheoPhy/JevOS/releases). Quit JevOS, then drag the app into Applications. Supports Apple Silicon and macOS 13+.

The release includes the DMG, complete source archive, file manifest and SHA-256 checksums. Native host source is in `packaging/macos/JevOS.swift`.

## License and contact

Application code uses [AGPL-3.0](LICENSE). Dependencies, fonts and other assets retain their upstream licenses; see [THIRD_PARTY.md](THIRD_PARTY.md) and the font notices in `public/brand/fonts/`.

[WangTheoPhys@outlook.com](mailto:WangTheoPhys@outlook.com) · [Personal website](https://Junkaiwang-theophy.github.io)
