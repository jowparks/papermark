// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type { ImgHTMLAttributes } from "react";

export type LogoTone = "light" | "dark";

export interface UseLogoToneResult {
  tone: LogoTone;
  imgProps: ImgHTMLAttributes<HTMLImageElement>;
}

/**
 * Inert shim: the real hook reads the logo's averaged pixel luminance from a
 * canvas to pick a contrasting chip background. Without it we default to
 * "dark" (→ white chip), which is the safe default for most logos.
 */
export function useLogoTone(_src: string): UseLogoToneResult {
  return { tone: "dark", imgProps: {} };
}
