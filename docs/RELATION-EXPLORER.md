# Offline graph explorer (P3-09)

**Status: implemented as a local, read-only graph-oriented UI.**
This optional feature visualizes a **saved, bounded** `traverse_anime_relations`
MCP result. The user can inspect directed work relationships without setting
up a web host, authorizing another provider, or letting a browser trigger any
AniDB API traffic.

## Try the included example

From a checkout with dependencies installed:

```bash
npm install
npm run graph:export -- --input examples/synthetic-relation-traversal.json --output graph.html
```

Open `graph.html` in a browser. The fixture is **wholly synthetic**:
the anime IDs, titles and relationship labels are not source claims about
AniDB or actual franchises.

To view a real result, use the **already registered** read-only MCP
`traverse_anime_relations` tool with an explicitly selected AniDB work ID
and bounded traversal options. Save its JSON **`structuredContent`** object,
or the enclosing tool result containing `structuredContent`, to a local
file such as `traversal.json`. Then run:

```bash
npm run graph:export -- --input traversal.json --output my-anime-graph.html
```

The CLI never contacts AniDB. It accepts one nonempty local JSON file at most
512 KiB, validates the graph's typed source structure, checks provenance and
edge endpoints, refuses tool-error envelopes, and creates the output with
exclusive-create semantics. It does not replace an existing file or the input.
The output is self-contained HTML with a Base64-encoded, bounded graph model;
original source titles and relation labels are **not interpolated as HTML
markup**.

The browser shows a directed SVG graph with selecting arrows/nodes, zoom,
canvas panning, keyboard-selectable nodes and arrows, searchable accessible
lists, and an evidence inspector. It exposes reported source URLs, retrieval
times, original typed relation labels, explicit incoming title assertions,
traversal termination, frontier statuses and source read failures. The
graph's layout uses only reported traversal depths; it does **not** infer
chronology, identity, reciprocal relations or canonical ancestry.

## Evidence discipline

- **Solid/filled node:** a source anime record was read. The viewer still
  reports whether its outgoing relations were completely examined.
- **Dashed node:** an unread source boundary. Its true work title is unknown
  even when a neighboring edge mentions a target title.
- **Directed arrow:** the exact reported source relation row, preserving
  duplicates, original labels, evidence source path and retrieval timestamp.
- **Partial traversal:** stop conditions and frontier reasons appear openly,
  including depth/read/node/edge bounds and failed source reads.
- **No arrow:** only means no edge in this bounded view. It is not evidence
  that a relationship does not exist elsewhere.

The generated HTML has an explicit Content Security Policy that disables
network connections, external assets and forms. UI strings are rendered with
`textContent`; the HTML template stores source data inside Base64 instead
of inserting user-authored titles or labels into markup. Offline output is
a snapshot, not a remotely hosted interface, user account, plugin connector
or live service.

## Tests and limitations

- `src/ui/relationship-explorer-model.ts`: validates typed bounded MCP
  traversal, refuses missing roots, duplicate nodes, dangling edges, invalid
  source URLs and retrieval timestamps; preserves repeated edge rows.
- `src/ui/relationship-explorer-html.ts`: self-contained SVG HTML with
  search/zoom/pan/keyboard-accessible lists and source inspectors.
- `src/cli/export-relationship-graph.ts`: exclusive-write offline export.
- `test/relationship-explorer-*.test.ts`: structured graphs, partial
  frontiers, duplicate/cyclic arrows, HTML escaping, CSP, actual on-disk
  export, malformed JSON/errors and refusal to overwrite existing output.
- [View model CI: 273 passing tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38181742425).
- [HTML rendering CI: 275 passing tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38181907244).
- [CLI export CI: 277 passing tests](https://github.com/Mark-Picknell/WeebMoeNexus/actions/runs/38182011465).

Automated tests verify serialization, HTML structure, accessibility markup,
input/error boundaries and CLI behavior, but **do not constitute a human
browser screenshot review or user acceptance of the design**. The optional
P3-09 implementation is complete within this scoped offline deliverable;
phase-exit acceptance (P3-10/P3-12), semantic character search, provider
authorizations, secured HTTPS deployment and ChatGPT integration remain
separate tasks.
