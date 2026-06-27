// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.

export type DataroomBannerKind = "none" | "image" | "video" | "youtube";

export interface ClassifiedDataroomBanner {
  kind: DataroomBannerKind;
  src: string | null;
  youtubeId: string | null;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Classify a saved dataroom banner URL into an image / video / YouTube embed.
 * Returns `none` when the banner is hidden ("no-banner") or empty.
 */
export function classifyDataroomBanner(
  src: string | null | undefined,
): ClassifiedDataroomBanner {
  if (!src || src === "no-banner") {
    return { kind: "none", src: null, youtubeId: null };
  }

  const youtubeId = extractYouTubeId(src);
  if (youtubeId) {
    return { kind: "youtube", src, youtubeId };
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(src)) {
    return { kind: "video", src, youtubeId: null };
  }

  return { kind: "image", src, youtubeId: null };
}
