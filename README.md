# WeebMoeNexus

> _Because apparently “find the hot pink-haired doctor with a scalpel” is a legitimate database query. 😂💋🔪_

**WeebMoeNexus** is an anime knowledge plugin for ChatGPT and Codex. The first provider is **AniDB**; the architecture is intentionally provider-independent so future integrations can add MyAnimeList, AniList, streaming providers, personal watch state, and whatever strange relational perversion happens next.

## Status

Early scaffold with a verified live AniDB HTTP read path. The first vertical slice is:

```text
ChatGPT / Codex
      ↓ MCP
WeebMoeNexus
      ↓ normalized domain model
AniDB provider
      ↓
AniDB HTTP API
```

The initial MCP surface is deliberately small:

- `health` — confirms the server is alive and whether AniDB client registration is configured.
- `get_anime_by_anidb_id` — fetches one anime by AniDB ID, normalizes the XML, caches it, and returns structured content with provenance.

## Why this shape?

The Nexus should own **identity, normalization, provenance, caching, and tool semantics**. Providers should own only the weirdness of their upstream service.

That means a future request like:

> “Find the hot pink-haired doctor with a scalpel.”

can eventually flow through title/character search, relation traversal, provider federation, and personal-list context without making ChatGPT understand five incompatible provider schemas.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

The MCP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

## AniDB registration and setup

The public AniDB software project is registered as:

- **Name:** WeebMoeNexus
- **AniDB software ID:** `22277`
- **Type:** Website Integration
- **Target OS:** Cross-platform
- **Language:** TypeScript / Node.js
- **State:** in development
- **Project URL:** https://github.com/Mark-Picknell/WeebMoeNexus
- **Contact:** https://github.com/Mark-Picknell/WeebMoeNexus/issues

The AniDB **HTTP API client is registered**, active, and official:

- **Client name:** `weebmoenexus`
- **Client ID:** `32071`
- **Registered version:** `1` (version ID `29661`)

Configure your local `.env`:

```env
ANIDB_CLIENT=weebmoenexus
ANIDB_CLIENT_VERSION=1
```

### First live API smoke test — passed

On 2026-10-08 (US Central), the registered client made **one live HTTP API request** for AniDB anime ID `15437` (*Akudama Drive*) from GitHub Actions. The API returned XML that WeebMoeNexus parsed and validated as an `AnimeRecord`. The result contained 7 titles, 13 characters, 12 episodes, and provider provenance. These counts are a snapshot, not permanent assertions about the upstream catalog.

[View the successful smoke-test run](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/37867136270).

The live check runs through `src/smoke/anidb-smoke.ts` and a separate GitHub workflow. Ordinary `npm test` / CI regression tests use mocks; they never call AniDB. Avoid rerunning live smoke checks unnecessarily.

WeebMoeNexus intentionally does **not** scrape AniDB pages. Requests go through the documented API, are paced conservatively, and are cached. Tests must never contact the live AniDB API.

The default HTTP spacing is 2.5 seconds. Do not lower it below 2 seconds.

## Plugin packaging

This repository includes a portable `plugin.json` identity manifest. A root `mcp.json` will be added when we have a stable deployed HTTPS `/mcp` endpoint instead of checking in a fake deployment URL.

Current OpenAI plugin guidance uses MCP servers as the tool/data layer. The server is built against the current MCP TypeScript v2 packages.

## Principles

1. **Normalized core, weird providers.**
2. **Provenance survives normalization.**
3. **No scraping when a sanctioned API/dump exists.**
4. **Cache aggressively; AniDB is not our personal query engine.**
5. **Tests use fixtures/fakes, never the live service.**
6. **Tool names stay boring even when the project name does not.**
7. **Adult/restricted metadata is data, not a reason to corrupt the domain model.**
8. **Future integrations add adapters; they do not rewrite the Nexus.**

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

The next meaningful milestone is title search backed by AniDB's sanctioned title dump, so the plugin can resolve human text to an AniDB ID before calling the richer per-anime endpoint.

---

Built by Mark + JayMe while going delightfully off-script.
