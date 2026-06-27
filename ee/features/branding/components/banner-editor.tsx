// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type { Dispatch, ReactNode, SetStateAction } from "react";

interface BannerEditorProps {
  banner: string | null;
  setBanner: Dispatch<SetStateAction<string | null>>;
  setBannerBlobUrl: Dispatch<SetStateAction<string | null>>;
  sizeHint?: string;
  defaultBannerImage?: string;
  onUrlApplied?: () => void;
  /** The file drop zone is supplied by the consumer; pass it through so the
   *  core banner upload still works without the licensed URL/editor UI. */
  dropZone?: ReactNode;
}

export function BannerEditor({ dropZone }: BannerEditorProps) {
  return <>{dropZone}</>;
}
