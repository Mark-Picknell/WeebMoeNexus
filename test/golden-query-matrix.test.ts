import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type ExpectedEntity = { type: string; name: string; providerId?: string };
type GoldenCase = {
  id: string;
  input: string;
  capabilities: string[];
  expectedEntities: ExpectedEntity[];
  requiredFindings: string[];
  doNotConclude: string[];
  source: { document: string; section: string; kind: string };
  execution: { status: "pending_resolver"; liveNetworkCallsAllowed: false };
};
type GoldenCorpus = {
  schemaVersion: number;
  description: string;
  licenseNote: string;
  cases: GoldenCase[];
};

const corpus = JSON.parse(
  readFileSync(new URL("./fixtures/golden-query-cases.json", import.meta.url), "utf8")
) as GoldenCorpus;
const sourceDocument = readFileSync(new URL("../docs/GOLDEN-QUERIES.md", import.meta.url), "utf8");

test("golden acceptance matrix includes every documented GQ exactly once", () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.ok(corpus.description.includes("NOT an assertion"));
  assert.ok(corpus.licenseNote.includes("No third-party"));
  const docIds = [...sourceDocument.matchAll(/^## (GQ-\d{3}) \u2014 /gm)].map(m => m[1]!);
  const caseIds = corpus.cases.map(c => c.id);
  assert.ok(docIds.length > 0);
  assert.deepEqual([...caseIds].sort(), [...docIds].sort());
  assert.equal(new Set(caseIds).size, caseIds.length);
});

test("every golden case has a traceable source, typed targets and negative guardrails", () => {
  for (const golden of corpus.cases) {
    assert.match(golden.id, /^GQ-\d{3}$/, golden.id);
    assert.ok(golden.input.trim().length > 1, golden.id);
    assert.ok(golden.capabilities.length >= 1, golden.id);
    assert.ok(golden.expectedEntities.length >= 1, golden.id);
    assert.ok(golden.requiredFindings.length >= 0, golden.id);
    assert.ok(golden.doNotConclude.length >= 1, golden.id);
    assert.equal(golden.source.document, "docs/GOLDEN-QUERIES.md", golden.id);
    assert.equal(golden.source.section, golden.id, golden.id);
    assert.equal(golden.source.kind, "human-curated-research", golden.id);
    assert.ok(sourceDocument.includes(`## ${golden.id} \u2014`), golden.id);
    for (const expected of golden.expectedEntities) {
      assert.ok(expected.type.trim() && expected.name.trim(), golden.id);
      if (expected.providerId) assert.match(expected.providerId, /^[a-z]+:[a-z]+:\d+$/, golden.id);
    }
    assert.equal(golden.execution.status, "pending_resolver", golden.id);
    assert.equal(golden.execution.liveNetworkCallsAllowed, false, golden.id);
  }
});

test("critical past identity failures remain explicit negative/unknown regression fixtures", () => {
  const byId = new Map(corpus.cases.map(c => [c.id, c] as const));
  const combined = (id: string) => {
    const entry = byId.get(id);
    assert.ok(entry, id);
    return [...entry.doNotConclude, ...entry.requiredFindings].join(" ").toLowerCase();
  };
  assert.match(combined("GQ-004"), /not proof of absence/);
  assert.match(combined("GQ-011"), /shogun/);
  assert.match(combined("GQ-013"), /not always the same/);
  assert.match(combined("GQ-016"), /not the user-intended/);
  assert.match(combined("GQ-017"), /tensura/);
  assert.match(combined("GQ-017"), /work and species/);
  assert.equal(byId.get("GQ-017")?.input, "Title=Viper GTS; Character=Carrera; Species=Succubus");
});

test("fixtures do not claim production resolution has passed", () => {
  assert.ok(corpus.cases.every(c => c.execution.status === "pending_resolver"));
  assert.ok(corpus.cases.every(c => c.execution.liveNetworkCallsAllowed === false));
});
