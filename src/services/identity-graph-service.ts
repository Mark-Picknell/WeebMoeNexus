import { createHash } from "node:crypto";
import { entityReferenceKey } from "../domain/field-claim.js";
import { identityGraphInputSchema, identityGraphSchema, type IdentityGraphInput, type IdentityGraph } from "../domain/identity-graph.js";

/** Build only from explicit mappings; names, reachability and credits never bind identity. */
export function buildIdentityGraph(raw: IdentityGraphInput): IdentityGraph {
  const input = identityGraphInputSchema.parse(raw);
  const parent = new Map(input.nodes.map(n => { const key = entityReferenceKey(n); return [key, key]; }));
  function root(key: string): string {
    let result = key;
    while (parent.get(result)! !== result) result = parent.get(result)!;
    while (key !== result) { const next = parent.get(key)!; parent.set(key, result); key = next; }
    return result;
  }
  function join(a: string, b: string) {
    const ar = root(a), br = root(b);
    if (ar !== br) parent.set(br, ar);
  }
  for (const assertion of input.assertions) {
    if (assertion.type === "same_entity") join(entityReferenceKey(assertion.from), entityReferenceKey(assertion.to));
  }
  const anchors = new Map<string, string>();
  for (const anchor of input.anchors) {
    const key = entityReferenceKey(anchor.entity), existing = anchors.get(anchor.canonicalId);
    if (existing) join(existing, key); else anchors.set(anchor.canonicalId, key);
  }
  const groups = new Map<string, IdentityGraph["components"][number]>();
  for (const entity of input.nodes) {
    const key = root(entityReferenceKey(entity));
    const group = groups.get(key) ?? { componentId: "", kind: entity.kind, members: [], canonicalIds: [], resolution: "unassigned", canonicalId: null, conflicts: [] };
    group.members.push(entity); groups.set(key, group);
  }
  for (const anchor of input.anchors) groups.get(root(entityReferenceKey(anchor.entity)))!.canonicalIds.push(anchor.canonicalId);
  input.assertions.forEach((assertion, index) => {
    if (assertion.type === "different_entity" && root(entityReferenceKey(assertion.from)) === root(entityReferenceKey(assertion.to))) {
      groups.get(root(entityReferenceKey(assertion.from)))!.conflicts.push({ type: "different_entity_inside_component", assertionIndex: index });
    }
  });
  for (const group of groups.values()) {
    group.members.sort((a, b) => entityReferenceKey(a).localeCompare(entityReferenceKey(b), "en"));
    group.canonicalIds = [...new Set(group.canonicalIds)].sort();
    group.componentId = "component:" + createHash("sha256").update(JSON.stringify(group.members.map(entityReferenceKey))).digest("hex");
    if (group.canonicalIds.length > 1) group.conflicts.push({ type: "multiple_canonical_ids", canonicalIds: group.canonicalIds });
    group.resolution = group.conflicts.length ? "conflicting" : group.canonicalIds.length ? "resolved_from_supplied_evidence" : "unassigned";
    group.canonicalId = group.resolution === "resolved_from_supplied_evidence" ? group.canonicalIds[0]! : null;
  }
  return identityGraphSchema.parse({ scope: "supplied_identity_evidence", input,
    components: [...groups.values()].sort((a, b) => a.componentId.localeCompare(b.componentId, "en")) });
}
