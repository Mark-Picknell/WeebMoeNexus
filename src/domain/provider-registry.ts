import * as z from "zod/v4";

export const capabilityEvidenceSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  checkedOn: z.iso.date(),
  basis: z.enum(["implementation", "offline_contract", "live_smoke", "documentation"]),
  scope: z.string().trim().min(1)
});

/** Plugin implementation and native-provider knowledge are independent axes. */
export const providerCapabilitySchema = z.strictObject({
  id: z.string().trim().min(1),
  implementation: z.enum(["implemented", "not_implemented"]),
  tools: z.array(z.string().trim().min(1)),
  scope: z.string().trim().min(1),
  limitations: z.array(z.string().trim().min(1)),
  evidence: z.array(capabilityEvidenceSchema).min(1),
  nativeProvider: z.strictObject({
    assessment: z.enum(["supported", "unavailable", "undocumented", "unverified", "not_assessed"]),
    scope: z.string().trim().min(1),
    evidence: z.array(capabilityEvidenceSchema)
  })
}).superRefine((value, ctx) => {
  if (value.implementation === "not_implemented" && value.tools.length > 0) {
    ctx.addIssue({ code: "custom", path: ["tools"], message: "Unimplemented capabilities cannot advertise callable tools" });
  }
  if (["supported", "unavailable", "undocumented"].includes(value.nativeProvider.assessment)) {
    const external = value.nativeProvider.evidence.some(e => e.basis === "documentation" || (value.nativeProvider.assessment === "supported" && e.basis === "live_smoke"));
    if (!external) ctx.addIssue({ code: "custom", path: ["nativeProvider", "evidence"], message: "Provider conclusions require scoped documentation or observed support; offline tests are insufficient" });
  }
});
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerDeclarationSchema = z.strictObject({
  provider: z.string().trim().min(1),
  integration: z.literal("active_adapter"),
  assessedOn: z.iso.date(),
  capabilities: z.array(providerCapabilitySchema).min(1)
}).refine(value => new Set(value.capabilities.map(c => c.id)).size === value.capabilities.length, "Capability IDs must be unique within a provider");
export type ProviderDeclaration = z.infer<typeof providerDeclarationSchema>;
