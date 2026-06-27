// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type { DataroomFolder } from "@prisma/client";

import type { DocumentVersion } from "@/components/view/viewer/dataroom-viewer";

export interface DataroomPreviewDocument {
  id: string;
  name: string;
  dataroomDocumentId: string;
  folderName: string | null;
  downloadOnly: boolean;
  canDownload: boolean;
  hierarchicalIndex: string | null;
  versions: DocumentVersion[];
}

export interface DataroomPreviewDataset {
  folders: DataroomFolder[];
  documents: DataroomPreviewDocument[];
}

/**
 * Inert shim: the real module ships an "Example Virtual Data Room" sample used
 * by the branding preview. Without it we return an empty dataset so the
 * preview renders an empty (but functional) data room.
 */
export function getDataroomPreviewDataset(): DataroomPreviewDataset {
  return { folders: [], documents: [] };
}
