<div align="center">

🇺🇸 <a href="README.md">English</a> | 🇨🇳 <a href="README.zh.md">中文</a>

<h1>JevOS</h1>

<img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0" />

</div>

## Introduction

JevOS is an installable web desktop. Jev selects task tools and layouts; a separate language model generates persistent miniature apps. Local interactions preserve notes and application state. Generated apps run in restricted iframes; messages and meetings are demonstrations, with no external delivery.

This repository contains the minimal runtime source corresponding to the existing September 27 v2 macOS package. Later music, messaging, terminal-simulation and presentation work is not included in this release. General recursive app-generation acceleration and a complete three-minute rehearsal are not claimed.

## Run

Use Node 22.12+ in the 22.x series, or Node 24+, and npm 10+.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. Set `TYPESAFE_API_KEY` for Jev and `APP_GENERATOR_API_KEY` / `APP_GENERATOR_MODEL` for app generation. An optional `APP_GENERATOR_BASE_URL` selects an OpenAI-compatible endpoint. Credentials stay on the local server. Without them, configuration reminders explain the unavailable model features.

```sh
npm run build
PORT=4273 npm run preview
```

The local database is created in `.data/`, which is excluded from Git.

## macOS download

Download the existing v2 DMG from [Releases](https://github.com/JunkaiWang-TheoPhy/JevOS/releases). Quit the running JevOS app before dragging the replacement into Applications. The package targets Apple Silicon and macOS 13+, uses an ad-hoc signature, and is not Apple-notarized. It has not been rebuilt for this upload.

The release includes SHA-256 checksums, its file manifest and complete corresponding source archive. The minimal repository omits research notes, development tests and generated binaries. Native host source is in `packaging/macos/JevOS.swift`; the complete archive retains its original build tooling.

## License and contact

Application code uses [AGPL-3.0](LICENSE). Dependencies, fonts and other assets retain their upstream licenses; see [THIRD_PARTY.md](THIRD_PARTY.md) and the font notices in `public/brand/fonts/`.

[WangTheoPhys@outlook.com](mailto:WangTheoPhys@outlook.com) · [Personal website](https://Junkaiwang-theophy.github.io)
