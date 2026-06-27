// self-host shim: graceful-degradation replacement for the license-gated module. Replace with the real licensed module if available.

// Feature unavailable in this build: report the request list as disabled so
// callers (nav sheet, toolbar button) render nothing.
export function useViewerRequestList(_params: {
  linkId?: string;
  dataroomId?: string;
  viewerId?: string;
  isPreview?: boolean;
}): { enabled: boolean } {
  return { enabled: false };
}
