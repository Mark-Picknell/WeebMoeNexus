# Validation status

`npm test` discovers `.test.ts` files recursively and runs them in isolated Node
test processes with the TypeScript loader. A custom reporter records actual
pass/fail/skip events per file and the completed runner summary. It writes JSON
test details and a Markdown feature table under `artifacts/`; CI retains both
even when a test fails. The runner's failure exit status is unchanged. Build
failure means tests were not run, not that prior successful artifacts prove this
revision passed. A missing final summary fails reporting.

`test/fixtures/validation-features.json` maps implemented contracts to their
required test files and scope. Features have one of five states:

| State | Meaning |
|---|---|
| `not_implemented` | No implemented feature/resolver is declared; fixture tests cannot promote it. |
| `test_not_run` | Required evidence is missing, or no required suite is declared. |
| `test_skipped` | At least one required assertion was skipped/TODO; a mixed passing suite is incomplete. |
| `test_failed` | A required assertion failed, even if others passed. |
| `test_passed` | Every required file ran with passing assertions and no failures/skips. |

Failing assertions take precedence over missing/skip states for implemented
features. Counts, required missing files and exact test result names remain
available. Feature state is a scoped offline contract result; overall runner
failure remains visible independently of individual passing features.

Every golden semantic case is reported separately using its execution declaration
in the golden corpus. Current `pending_resolver` cases remain `not_implemented`,
while the fixture-integrity feature can pass. A future implemented semantic case
must declare its own required test files. No live source accuracy, real ChatGPT
tool selection, provider authorization, hosting or user acceptance is implied.
