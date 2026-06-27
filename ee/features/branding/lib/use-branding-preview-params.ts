// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import { useEffect, useState } from "react";

// All values are strings (URL-param shaped) so call sites can compare them
// directly (e.g. cardLayout === "GRID", showFolderTree !== "0").
export interface BrandingPreviewParams {
  brandLogo: string;
  brandColor: string;
  brandBanner: string;
  accentColor: string;
  accentButtonColor: string;
  ctaLabel: string;
  ctaUrl: string;
  welcomeMessage: string;
  applyAccentColorToDataroomView: string;
  cardLayout: string;
  showFolderTree: string;
  viewerHeaderStyle: string;
  hideFolderIconsInMain: string;
}

function emptyParams(): BrandingPreviewParams {
  return {
    brandLogo: "",
    brandColor: "",
    brandBanner: "",
    accentColor: "",
    accentButtonColor: "",
    ctaLabel: "",
    ctaUrl: "",
    welcomeMessage: "",
    applyAccentColorToDataroomView: "",
    cardLayout: "",
    showFolderTree: "",
    viewerHeaderStyle: "",
    hideFolderIconsInMain: "",
  };
}

/**
 * Reads branding preview params from the URL query string. The real hook also
 * live-updates over postMessage from the branding editor; the shim seeds once
 * from the URL so standalone preview routes still render with passed params.
 */
export function useBrandingPreviewParams(): BrandingPreviewParams {
  const [params, setParams] = useState<BrandingPreviewParams>(emptyParams);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const next = emptyParams();
    (Object.keys(next) as (keyof BrandingPreviewParams)[]).forEach((key) => {
      const value = sp.get(key);
      if (value !== null) next[key] = value;
    });
    setParams(next);
  }, []);

  return params;
}
