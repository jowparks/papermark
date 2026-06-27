// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.

// Brand-level custom link preview override (the license-gated feature). The
// shape mirrors what consumers pass in; the shim ignores it so branding
// degrades to "no custom branding".
interface PublicLinkPreviewBrand {
  customLinkPreviewEnabled?: boolean | null;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
}

interface ResolvePublicLinkMetaArgs {
  link: {
    enableCustomMetatag: boolean;
    metaTitle: string | null;
    metaDescription: string | null;
    metaImage: string | null;
    metaFavicon: string | null;
  };
  teamBrand?: PublicLinkPreviewBrand | null;
  dataroomBrand?: PublicLinkPreviewBrand | null;
  defaultTitle: string;
}

// Resolved Open Graph metadata consumed by the public document/dataroom view
// path (lib/api/links/link-data.ts).
export interface ResolvedPublicLinkMeta {
  enableCustomMetatag: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImage: string | null;
  metaFavicon: string | null;
}

/**
 * Resolve the public link's meta tags. Honors the link's OWN custom metatags
 * (core, stored on the Link model) and intentionally ignores the brand-level
 * custom link preview override (the license-gated feature) — so branding
 * degrades to "no custom branding".
 */
export function resolvePublicLinkMeta({
  link,
  defaultTitle,
}: ResolvePublicLinkMetaArgs): ResolvedPublicLinkMeta {
  if (link.enableCustomMetatag) {
    return {
      enableCustomMetatag: true,
      metaTitle: link.metaTitle ?? defaultTitle ?? null,
      metaDescription: link.metaDescription ?? null,
      metaImage: link.metaImage ?? null,
      metaFavicon: link.metaFavicon ?? "/favicon.ico",
    };
  }

  return {
    enableCustomMetatag: false,
    metaTitle: defaultTitle ?? null,
    metaDescription: null,
    metaImage: null,
    metaFavicon: "/favicon.ico",
  };
}
