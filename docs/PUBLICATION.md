# Publication preparation

Goal: public availability in ChatGPT's plugin directory. Verified against
official documentation on 2026-10-11 UTC (2026-10-10 in Mark's local timezone).
No hosted endpoint, installation, review submission or publication is claimed.

The portable package uses root `plugin.json`, `mcp.json` and relative assets.
The public directory is shared by ChatGPT and Codex. A hosted HTTPS MCP server
is required for this tool-only package; UI is optional. Fixed bearer tokens are
API-key authentication and cannot currently connect through the submission
portal. Public read-only access is the proposed first path; OAuth is additional
work if private user access is required.

Sources: [official package guide](https://developers.openai.com/plugins/build/plugins),
[submission and field reference](https://developers.openai.com/plugins/deploy/submission),
[MCP review](https://developers.openai.com/plugins/deploy/app-review) and
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).
Recheck these before submission; platform requirements can change.

The submission account needs publisher verification and appropriate organization
permissions. For MCP review, listing metadata needs a publisher/category,
product/support/privacy/terms HTTPS pages and an icon. Initial review requires
five positive cases, three negative cases and an accessible demo recording.
Upload/scan, domain verification, review approval and the publisher's final
publish action are separate stages. Credentials belong in secure connection
setup, never the ZIP. Neither a valid ZIP nor green CI establishes approval.

## Prepared in this repository

- Root manifest has accurate scoped listing text, starter prompts, an original
  SVG icon, and five positive/three negative review prompts. These prompts are
  review instructions, not passing acceptance tests. Positive title/catalog
  cases require the approved populated cache and actual source availability.
- Only AniDB is integrated. Character lookup needs a known anime; global Doctor
  attribute discovery, scene presence, personal watchlists and cross-provider
  auto-resolution are explicitly unadvertised. All 17 golden semantic queries
  remain unimplemented in the offline validation report.
- `scripts/verify-deployment.mjs` produces a dated HTTPS observation from passive
  MCP calls after deployment. It does not contact AniDB or prove registration.
- `scripts/prepare-plugin.mjs` refuses a missing/stale observation, unavailable
  review metadata, placeholder/local URLs, unsupported portal auth, unknown
  tools, credentials fields and hooks. Its checks are a repository preflight,
  not the platform's complete schema/policy validation.

The generator trusts the operator-supplied observation. It does not authenticate
that JSON, verify public DNS reachability or detect a forged report. Use the
actual verifier result, retain its provenance and repeat actual-client checks.
An observation older than 24 hours must be regenerated; this is our chosen
freshness bound, not an OpenAI requirement.

## Assemble after deployment

Complete a reviewed copy of `plugin.json` with the actual verified publisher
name, dashboard category, four published policy/support URLs and recording URL.
Keep actual country targeting, license and legal acceptance under Mark's
control. No source-code license or legal terms have been selected by this work.
Public wording must reflect the host's real data handling and log retention.

Run `node scripts/prepare-plugin.mjs artifacts/deployment-verification.json <reviewed-manifest-path>`.
It writes `artifacts/plugin-package/{plugin.json,mcp.json,assets/icon.svg}` only
when the repository preflight passes. From **inside** that directory, create a
ZIP containing `plugin.json`, `mcp.json`, `assets/` at its root, without cache
files, environment files, secrets, fixtures or a wrapping parent folder. Run
the platform's validation/scan and test installation before review submission.
The repository deliberately has no active `mcp.json` pointing at an invented
deployment. D-05 stays open until the manifest references a verified real host.

## Exact remaining external gates

| Gate | Evidence required |
|---|---|
| D-03 | Mark's hosting/account/budget/access decision |
| D-04/D-05 | Running approved HTTPS endpoint, environment/volume checks and accurate deployment manifest |
| D-06/D-07 | Authorized client installation and actual read-only calls, separately for each requested client |
| Publisher/review | Verified publisher, actual public policy pages, domain checks, recorded demonstration and review result |
| D-09 | Mark's final acceptance and release authorization |

Review upstream content/data terms and the current directory policies against
the actual exported metadata before submission. Source `restricted` flags and
descriptions are preserved; no catalog-wide policy clearance or coverage audit
has been established. Use [DEPLOYMENT.md](DEPLOYMENT.md) for the concrete host
recipe and operational limits. Remaining research/discovery roadmap tasks can
continue independently of the host decision.
