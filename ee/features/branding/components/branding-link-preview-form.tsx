// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.

interface BrandingLinkPreviewFormProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  faviconUrl: string | null;
  onFaviconChange: (faviconUrl: string | null) => void;
  inheritanceHint?: string;
}

// Inert: custom link preview is a license-gated feature. Renders nothing so
// branding degrades to default Open Graph metadata.
export function BrandingLinkPreviewForm(_props: BrandingLinkPreviewFormProps) {
  return null;
}
