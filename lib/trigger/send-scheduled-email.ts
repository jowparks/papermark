// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

import { task } from "@trigger.dev/sdk";

// Inert Trigger.dev task. Consumer (ee/stripe/webhooks/checkout-session-completed.ts)
// calls `.trigger({ to, name, teamId }, { delay: "40d" })`. The shim accepts the
// same payload and does nothing (no email sent). Distinct id to avoid colliding
// with the real send-upgrade-checkin-email task already in this directory.

export const sendUpgradeOneMonthCheckinEmailTask = task({
  id: "shim-send-scheduled-upgrade-checkin-email",
  run: async (_payload: { to: string; name: string; teamId: string }) => {
    // no-op: self-host shim does not send scheduled emails
  },
});
