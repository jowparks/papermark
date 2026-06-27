// self-host shim: graceful-degradation replacement for a license-gated/private module. Replace with the real module if available.

// Self-host default: returns `false`. Team creation is still ALLOWED regardless
// (the consumer creates the team either way); returning `false` simply means we
// don't auto-grant the paid "datarooms-unlimited" plan + its elevated limits to
// every new team. Granting unlimited here would be the wrong kind of permissive.

export async function canCreateUnlimitedTeam(
  _userId: string,
): Promise<boolean> {
  return false;
}
