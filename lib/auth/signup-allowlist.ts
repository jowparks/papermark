// ponytail: env-driven signup allowlist; move to DB/edge-config only when
// non-devs must edit it live. Both lists empty → feature disabled, allow all.
const domains = (process.env.NEXT_PRIVATE_ALLOWED_SIGNUP_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const emails = (process.env.NEXT_PRIVATE_ALLOWED_SIGNUP_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Gate for signups/logins. Returns true when the email matches the allowlist by
 * exact address, exact domain, or subdomain (team.ebb.so ⊆ ebb.so), or when no
 * allowlist is configured (open signup). Subdomain match is dot-boundary only,
 * so notebb.so does NOT match ebb.so.
 */
export function isAllowedSignupEmail(email: string): boolean {
  if (domains.length === 0 && emails.length === 0) return true;
  const e = email.toLowerCase();
  if (emails.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  if (!domain) return false;
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}
