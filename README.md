# WeebMoeNexus

> _Because apparently “find the hot pink-haired doctor with a scalpel” is a legitimate database query. 😂💋🔪_

**WeebMoeNexus** is an anime knowledge plugin for ChatGPT and Codex. The first provider is **AniDB**; the architecture is intentionally provider-independent so future integrations can add MyAnimeList, AniList, streaming providers, personal watch state, and whatever strange relational perversion happens next.

## Status

Early scaffold. The first vertical slice is:

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

AniDB still requires an API **client** to be added beneath that software project before live API requests are allowed. Once the client exists, configure its registered name/version locally:

```env
ANIDB_CLIENT=your_registered_client_name
ANIDB_CLIENT_VERSION=1
```

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
