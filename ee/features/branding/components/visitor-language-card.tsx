// self-host shim: graceful-degradation replacement for the license-gated @/ee/features/branding module. Replace with the real licensed module if available.
import type { SupportedLocaleCode } from "@/lib/i18n/locales";

interface VisitorLanguageCardProps {
  defaultLanguage: SupportedLocaleCode;
  onDefaultLanguageChange: (language: SupportedLocaleCode) => void;
  hasAccess: boolean;
}

// Inert: visitor language selection is a license-gated feature. Renders
// nothing so the dataroom defaults to its standard locale.
export function VisitorLanguageCard(_props: VisitorLanguageCardProps) {
  return null;
}
