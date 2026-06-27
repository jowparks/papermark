// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import { z } from "zod";

// Card layout for the dataroom document/folder list.
export type DataroomCardLayout = "LIST" | "COMPACT" | "GRID";
// Header treatment for the dataroom viewer shell.
export type DataroomViewerHeaderStyle = "DEFAULT" | "SPLIT" | "NOTION";
// Named layout presets selectable in branding UI. "CUSTOM" = a combination
// that doesn't map to any named preset.
export type DataroomViewerLayoutPreset =
  | "STANDARD"
  | "STRICT"
  | "MODERN"
  | "NOTION"
  | "CUSTOM";
// Preset cards the user can click (excludes the derived-only "CUSTOM").
export type DataroomLayoutCardId = "STANDARD" | "STRICT" | "MODERN" | "NOTION";

export const DataroomCardLayoutSchema = z.enum(["LIST", "COMPACT", "GRID"]);
export const DataroomViewerHeaderStyleSchema = z.enum([
  "DEFAULT",
  "SPLIT",
  "NOTION",
]);
export const DataroomViewerLayoutPresetSchema = z.enum([
  "STANDARD",
  "STRICT",
  "MODERN",
  "NOTION",
  "CUSTOM",
]);

export const CARD_LAYOUT_OPTIONS: { value: DataroomCardLayout; label: string }[] =
  [
    { value: "LIST", label: "Cards" },
    { value: "COMPACT", label: "List" },
    { value: "GRID", label: "Grid" },
  ];

export function asDataroomCardLayout(value: unknown): DataroomCardLayout {
  return value === "COMPACT" || value === "GRID"
    ? value
    : "LIST";
}

export function asDataroomViewerHeaderStyle(
  value: unknown,
): DataroomViewerHeaderStyle {
  return value === "SPLIT" || value === "NOTION" ? value : "DEFAULT";
}

// Pure presentation inference: map a layout-field combination back to its
// named preset (matches the preset definitions used by the branding UI).
export function inferDataroomViewerLayoutPreset(input: {
  cardLayout: DataroomCardLayout;
  showFolderTree: boolean;
  hideFolderIconsInMain: boolean;
  viewerHeaderStyle: DataroomViewerHeaderStyle;
}): DataroomViewerLayoutPreset {
  const { cardLayout, showFolderTree, hideFolderIconsInMain, viewerHeaderStyle } =
    input;
  if (
    cardLayout === "LIST" &&
    showFolderTree &&
    !hideFolderIconsInMain &&
    viewerHeaderStyle === "DEFAULT"
  )
    return "STANDARD";
  if (
    cardLayout === "COMPACT" &&
    !showFolderTree &&
    hideFolderIconsInMain &&
    viewerHeaderStyle === "DEFAULT"
  )
    return "STRICT";
  if (
    cardLayout === "COMPACT" &&
    !showFolderTree &&
    hideFolderIconsInMain &&
    viewerHeaderStyle === "SPLIT"
  )
    return "MODERN";
  if (
    cardLayout === "GRID" &&
    !showFolderTree &&
    !hideFolderIconsInMain &&
    viewerHeaderStyle === "NOTION"
  )
    return "NOTION";
  return "CUSTOM";
}
