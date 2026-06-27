// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

// Static, typed scope definitions that drive the token-scope UI and API
// validation. Derived directly from the resources/actions the consumers
// expect (components/tokens/scopes.ts RESOURCE_OPTIONS and the granular
// `${resource}.${action}` strings built by buildScopesList).
//
// PRESET_SCOPES: mutually-exclusive coarse presets.
//   - "apis.all"  → full access
//   - "apis.read" → read-only across all resources
// GRANULAR_SCOPES: per-resource read/write scopes.

export const PRESET_SCOPES = ["apis.all", "apis.read"] as const;

export const GRANULAR_SCOPES = [
  "documents.read",
  "documents.write",
  "links.read",
  "links.write",
  "datarooms.read",
  "datarooms.write",
  "analytics.read",
  "visitors.read",
] as const;

export type PresetScope = (typeof PRESET_SCOPES)[number];
export type GranularScope = (typeof GRANULAR_SCOPES)[number];
export type Scope = PresetScope | GranularScope;
