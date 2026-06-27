// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type { ReactNode } from "react";

interface CollapsibleBrandingSectionProps {
  title: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

// Passthrough: render the children (core settings live inside) without the
// licensed collapse chrome.
export function CollapsibleBrandingSection({
  children,
}: CollapsibleBrandingSectionProps) {
  return <>{children}</>;
}
