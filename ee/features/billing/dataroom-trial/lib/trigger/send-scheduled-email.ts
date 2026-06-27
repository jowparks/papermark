// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

import { task } from "@trigger.dev/sdk";

// Inert Trigger.dev tasks for the dataroom-trial email sequence. Consumer
// (pages/api/teams/[teamId]/datarooms/trial.ts) triggers these with `.trigger`
// and reads `.id` off the returned handle (the SDK provides this automatically).
// All runs are no-ops in self-host — no trial emails are sent.

export const sendDataroomTrialInfoEmailTask = task({
  id: "shim-dataroom-trial-info-email",
  run: async (_payload: { to: string; useCase: string; name: string }) => {
    // no-op
  },
});

export const sendDataroomTrial24hReminderEmailTask = task({
  id: "shim-dataroom-trial-24h-reminder-email",
  run: async (_payload: { to: string; name: string; teamId: string }) => {
    // no-op
  },
});

export const sendDataroomTrialExpiredEmailTask = task({
  id: "shim-dataroom-trial-expired-email",
  run: async (_payload: { to: string; name: string; teamId: string }) => {
    // no-op
  },
});
