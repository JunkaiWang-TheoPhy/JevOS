# Third-party dependencies and design references

JevOS is licensed under AGPL-3.0-only. Installed dependencies retain their upstream licenses and notices.

## Direct runtime dependencies

- [json-render](https://github.com/vercel-labs/json-render), core and React packages 0.21.0: Apache-2.0. Used for the component catalog, registry, and actual rendering. Version 0.21.0 is pinned.
- [React](https://github.com/facebook/react): MIT.
- [Zod](https://github.com/colinhacks/zod): MIT.

Vite, its React plugin, TypeScript, and vite-plugin-pwa are development tools. Their installed packages include their respective licenses. Workbox is included by the PWA build tooling.

## Design references

Architecture references:

- [benis-me/VibeOS](https://github.com/benis-me/VibeOS): local prepared interactions and separate view/business state.
- [Tambo component state](https://docs.tambo.co/concepts/generative-interfaces/component-state): retain user edits during rendering.
- [CopilotKit Jev recipe](https://docs.copilotkit.ai/cookbook/jev-generative-ui): bounded panel choice and user action feedback.
- [Open MCP Apps](https://github.com/2nd1st/open-mcp-apps): shared persistent data and explicit action acknowledgements.
