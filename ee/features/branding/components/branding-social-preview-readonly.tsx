// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.

interface BrandingSocialPreviewReadonlyProps {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
}

// Inert: read-only social preview is part of the license-gated link preview
// feature. Renders nothing.
export function BrandingSocialPreviewReadonly(
  _props: BrandingSocialPreviewReadonlyProps,
) {
  return null;
}
