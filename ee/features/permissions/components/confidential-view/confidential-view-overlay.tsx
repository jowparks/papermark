// self-host shim: graceful-degradation replacement for the license-gated module. Replace with the real licensed module if available.

// Rendered as a sibling overlay only when a link has confidential-view enabled.
// In this build the link-level toggle (ConfidentialViewSection) is inert, so
// `confidentialViewEnabled` is never true and this never renders. It also wraps
// no content — viewers render the document independently — so a null overlay
// exposes nothing that an enabled overlay would have hidden.
export function ConfidentialViewOverlay() {
  return null;
}
