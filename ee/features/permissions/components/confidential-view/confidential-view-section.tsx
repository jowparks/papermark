// self-host shim: graceful-degradation replacement for the license-gated module. Replace with the real licensed module if available.

// Link-settings toggle for confidential view. Feature unavailable in this
// build: render nothing so the setting cannot be enabled (fail-safe — the
// confidential-view overlay is therefore never asked to gate content).
function ConfidentialViewSection(_props: {
  data?: unknown;
  setData?: unknown;
  isAllowed?: boolean;
  handleUpgradeStateChange?: unknown;
}) {
  return null;
}

export default ConfidentialViewSection;
