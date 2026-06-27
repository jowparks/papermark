// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

import { z } from "zod";

import prisma from "@/lib/prisma";

// AUTH PATH — defaults chosen to FAIL CLOSED / preserve existing security.
//
// Exports consumed by:
//   - pages/api/teams/[teamId]/tokens/index.ts
//       RestrictedTokenSubjectTypeSchema (.safeParse → "user" | "machine")
//       parseRestrictedTokenSubjectType (DB string → "user" | "machine")
//   - pages/api/teams/[teamId]/remove-teammate.ts
//       revokeUserBoundTeamTokens(userId, teamId)
//
// Subject types mirror the Prisma RestrictedToken.subjectType column
// (default "user"). "user" keys are revoked when the owner loses team access;
// "machine" keys stay team-scoped. Anything not exactly "machine" normalizes
// to the more-restrictive "user" so an unexpected value never silently becomes
// a longer-lived machine key.

export const RestrictedTokenSubjectTypeSchema = z.enum(["user", "machine"]);

export type RestrictedTokenSubjectType = z.infer<
  typeof RestrictedTokenSubjectTypeSchema
>;

export function parseRestrictedTokenSubjectType(
  value: string | null | undefined,
): RestrictedTokenSubjectType {
  // Fail closed: only the explicit "machine" literal yields a machine key.
  return value === "machine" ? "machine" : "user";
}

// FAIL SAFE: when a teammate is removed we must actually REVOKE their
// user-bound tokens for that team, otherwise the removed user retains API
// access — a security hole. A no-op shim would leave those tokens live, so we
// delete the user-scoped ("user") dashboard/oauth tokens for this user+team.
// Machine keys are intentionally left intact (they are team-scoped, not bound
// to the departing user). Errors propagate to the caller's error handler.
export async function revokeUserBoundTeamTokens(
  userId: string,
  teamId: string,
): Promise<{ count: number }> {
  return prisma.restrictedToken.deleteMany({
    where: {
      userId,
      teamId,
      subjectType: "user",
    },
  });
}
