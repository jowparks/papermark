// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type {
  DataroomLayoutCardId,
  DataroomViewerLayoutPreset,
} from "@/ee/features/branding/lib/dataroom-viewer-layout";

interface DataroomLayoutPresetCardsProps {
  selectedPreset: DataroomViewerLayoutPreset;
  onSelect: (id: DataroomLayoutCardId) => void;
}

// Inert: the licensed preset picker is unavailable. Renders nothing; layouts
// can still be configured via the individual controls.
export function DataroomLayoutPresetCards(
  _props: DataroomLayoutPresetCardsProps,
) {
  return null;
}
