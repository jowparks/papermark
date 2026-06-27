# Problems (unresolved blockers) — papermark-docker-selfhost

## P1 (BLOCKER): repo cannot `next build` — two enterprise modules missing from OSS distribution
Confirmed independently (not a subagent excuse):
- `ee/features/branding/` and `ee/features/request-lists/` are absent on disk, untracked, and in
  ZERO git refs (`git log --all -- ... ` = 0 commits). NOT gitignored (`git check-ignore` = not ignored).
- They are imported by 15 COMMITTED non-ee files, 39 import sites, incl. core paths:
  `lib/api/links/link-data.ts` (public link/view path), `components/view/dataroom/*`,
  `pages/api/teams/[teamId]/branding.ts`, `pages/branding.tsx`, `pages/datarooms/[id]/{settings,tasks,branding}`.
- tsconfig `@/* -> ./*`, so these resolve to the missing dirs -> webpack/TS module-resolution failure.
- Public upstream `github.com/papermark/papermark` (the configured origin) lists the SAME 12 ee/features
  dirs and returns 404 for branding + request-lists -> these are enterprise-gated, withheld from OSS.
- `ee/README.md` states ee/ is copyrighted, license-required.

Impact: `next build` (and thus `docker build --target runner|tooling` image build, acceptance #7 + #1-6
runtime) cannot complete from this checkout. This is an UPSTREAM CONTENT GAP, independent of the Docker
stack, which is otherwise complete + validated (deps stage builds; compose config OK; scripts bash -n OK).

Resolution requires a USER decision (do not silently stub copyright-gated code):
  A. User provides the licensed ee/features/{branding,request-lists} modules -> build works, zero app changes.
  B. User authorizes graceful-degradation STUBS (new app code, deviates from plan §5 "only 3 patches";
     branding degrades to defaults so core single-doc flow builds; dataroom branding/request-list inert).
  C. Ship infra as-is; operator supplies modules before building.

Infra deliverables themselves are DONE + sound. Only the missing modules block the final image build.

## P1 UPDATE (VERIFIED FULL SCOPE) — checkout is a broadly-incomplete snapshot; cannot build via stubs-only
Authoritative scan (`scan-missing.cjs`) + targeted greps confirm the source tree is missing far more
than 2 modules, and the gaps reach into EXISTING files and DEPENDENCIES — so adding new stub files
ALONE cannot make `next build` pass:

A. 27 missing first-party `@/` modules (new files, stubbable in principle):
   - @/ee/features/branding/**            (14: 7 components + 7 lib; incl. resolve-public-link-meta used by the CORE lib/api/links/link-data.ts)
   - @/ee/features/request-lists/**       (6)
   - @/ee/features/permissions/components/confidential-view/** (2; SECURITY feature, imported by 6+4 files incl. excel-viewer, link-options)
   - @/ee/features/billing/dataroom-trial/lib/trigger/send-scheduled-email (1)
   - @/ee/limits/can-create-premium-team, can-create-unlimited-team (2; gate team creation in pages/api/teams/index.ts)
   - @/lib/api/auth/restricted-tokens     (1; AUTH path, remove-teammate etc.)
   - @/lib/oauth/scopes                    (1; OAuth provider)
   - @/lib/trigger/send-scheduled-email    (1)
   (@/public/_static/papermark-logo.svg is a scanner false-positive — .svg not checked.)

B. EXISTING committed file incomplete (requires editing existing source — violates plan §5):
   - ee/features/security/lib/ratelimit.ts exports only {auth, billing}, but committed consumers call
     rateLimiters.bulkLinkImport (lib/api/links/bulk-import.ts:103) and rateLimiters.domainVerification
     (pages/api/teams/[teamId]/domains/[domain]/verify.ts:76).

C. MISSING npm dependency (requires a dependency change — violates "no new deps"):
   - @react-email/components is in neither package.json nor node_modules, yet imported by 8 committed
     ee/ email files (billing renewal/cancellation, conversations, dataroom-invitations/freeze, access-notifications).

CONCLUSION: This is the user's checkout of a PRIVATE superset of public papermark/papermark. The public
OSS repo + this checkout both omit license-gated modules AND this checkout additionally lacks a dependency
and has an out-of-date committed ratelimit.ts. Making it build requires the COMPLETE source, not guesswork.
A prior `deep` agent tried stubbing-everything, edited tsconfig.json + ratelimit.ts (forbidden), created
~10 speculative stubs, then ABORTED unverified. Those changes were reverted; tree restored to clean
deliverables. RECOMMENDATION: Option A — user supplies the complete/licensed source; then `docker build`
runs clean against the already-finished Docker stack. Do NOT ship a guessed fork (degrades security/auth/
branding/limits).
