// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

// Self-host default: PERMISSIVE for team creation, but grants NO billing tier.
// The consumer (pages/api/teams/index.ts) only blocks (403) when a user is a
// "premium admin" who has hit PREMIUM_TEAM_LIMIT. With no billing tiers in a
// self-host instance, nobody is a premium admin, so we return
// `isPremiumAdmin: false, canCreate: false` — this never triggers the 403 and
// the team is created on the basic free plan.

export const PREMIUM_TEAM_LIMIT = 10;

export interface PremiumTeamEligibility {
  isPremiumAdmin: boolean;
  canCreate: boolean;
}

export async function getPremiumTeamEligibility(
  _userId: string,
): Promise<PremiumTeamEligibility> {
  return { isPremiumAdmin: false, canCreate: false };
}
