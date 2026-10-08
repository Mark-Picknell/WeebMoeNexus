# WeebMoeNexus agent guidance

## Mission

Build a durable anime knowledge layer for ChatGPT/Codex. AniDB is the first provider, not the domain model.

## Architectural rules

- Keep provider-specific XML/JSON/protocol details under `src/providers/<provider>/`.
- Return normalized domain objects from providers/services.
- Preserve provenance. Never silently pretend two providers agree when they do not.
- Prefer additive schema evolution over breaking published MCP tool schemas.
- Keep MCP tools focused on recognizable user goals.
- Read-only tools must be marked read-only; tools that touch the public internet must be marked open-world.
- Never log credentials or upstream authentication material.

## AniDB rules

- Do not scrape AniDB pages.
- Respect its API/client-registration requirements.
- Never send live AniDB traffic from tests.
- Enforce at least 2 seconds between HTTP API requests; default more conservatively.
- Cache successful responses aggressively.
- Do not retry bans, 429s, or ambiguous failures in a tight loop.

## Testing

Prefer:
1. pure unit tests,
2. recorded/synthetic fixtures,
3. fake provider implementations,
4. explicit integration tests only when a human opts in.

## Future providers

MyAnimeList, AniList, Crunchyroll, or anything else should implement an adapter against the same normalized model. If a provider has a concept the core cannot express, extend the core deliberately and preserve source-specific data where needed; do not leak provider schemas through MCP tools.

## Naming philosophy

The project may be gloriously unserious. The protocol should not be.

Fun names are welcome. Stable contracts, provenance, security, and rate limits are not jokes.
