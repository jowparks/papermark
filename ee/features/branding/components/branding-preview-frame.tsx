// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.

interface BrandingPreviewFrameProps {
  name: string;
  basePath: string;
  params: Record<string, string>;
}

// Inert: the live branding preview iframe is a license-gated feature. Renders
// nothing so the settings UI works without a preview.
export function BrandingPreviewFrame(_props: BrandingPreviewFrameProps) {
  return null;
}
