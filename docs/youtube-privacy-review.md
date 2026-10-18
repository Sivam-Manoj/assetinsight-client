# YouTube privacy controls and production checklist

## Automatic public publication correction — 18 October 2026 (local, not deployed)

The current `/privacy` and `/terms/youtube` source supersedes the earlier per-video
review/visibility promises below. With the shared channel connected, explicit
Asset/Lot Listing submission or resubmission authorizes eligible saved lot videos
for automatic publication. The system uses the saved lot number, Title and
Description (bounded to provider limits) and sends unchanged original video bytes,
including audio and embedded metadata, without privacy redaction. No new analysis
or fabricated human-review audit is introduced. Users must review saved text and
footage before submitting and have rights to share that content publicly.

Transfers stage privately, then request Public only after the current report
meets its existing approval/release requirements. Public remains provider-confirmed,
not inferred from an accepted upload or saved URL. Previously submitted queued
receipts, including old pending-review receipts, may resume automatically; no scan
of unrelated unsubmitted historical reports creates new transfers. Same-session
recovery, uncertain-final duplicate prevention, original media/ZIP retention,
Google revocation/erase controls, suppression receipts and separate YouTube Studio
deletion remain. Privacy copy does not claim Google approval or live eligibility.

Both pages remain static anonymous/pending-device routes. Public contact, device
security disclosures, account/data removal and direct Google/YouTube links are
unchanged. Deploy the tested backend API/workers and matching admin/public web
copy together; no deployment is implied by these local source edits. Current
verification is recorded at handoff. The September release and its evidence below
are historical, not evidence that this October correction is live.

Local October gate: privacy/terms/proxy30 tests, typecheck, lint and a fresh
Turbopack production build pass. Four Chromium anonymous/pending-device scenarios
at1366/390/320px light/dark verify public200s, keyboard policy round-trips,
16 retained protected-route redirects, no overlays/overflow/console errors or
API/external browser requests. Browser plugin was absent; existing Playwright
was used. Environment-file reads were blocked; QA-only fonts came from installed
Geist files over loopback after two external mock-format failures. Product
assets/config and prior Re-Open files are unchanged. No Google/customer/device,
push or production action. Evidence:
`/tmp/assetinsight-youtube-public-copy-20261018.uq6WaX/verification.json`.

## Historical release — 29 September 2026

Implemented and deployed, 29 September 2026. The owner approved the public contact
`manom8193@gmail.com` and the additional review, revocation and cleanup controls.
Application deployment does not constitute Google approval or channel connection.

## Public pages

Exactly `/privacy` and `/terms/youtube` are public for anonymous, pending-device
and authenticated visitors. Protected report routes and neighboring paths remain
gated. Both are static server components without API calls, YouTube embeds or new
tracking. The security-data notice remains alongside the YouTube disclosures.

The notice describes shared administrator authority, encrypted credentials,
original video/audio/embedded metadata transfer, explicit per-video review and
Private/Unlisted/Public selection. Google Privacy, YouTube Terms, account-access
revocation and Studio links remain directly accessible without signing in.

Admin connection consent is not upload permission. Explicit report submission
only prepares a review record. A separate administrator video review authorizes
upload, with initial private visibility; public/unlisted changes still require
the current report to be approved and released. Original report media/ZIPs are
unchanged. Existing generated files need explicit regeneration for new links.

Revoke/erase controls stop future authorized work, request provider revocation
where possible, and remove the integration's cached credentials/channel/video
data in bounded maintenance. Pending work and uncertain provider outcomes are
not shown as completed. Manual confirmation of external Google revocation is
distinct from provider-confirmed revocation. Minimal suppression and operation
receipts remain. Historical report provenance, generated files, downloaded
copies, original media and YouTube-hosted videos are not silently rewritten or
deleted. Broader removal requests use the public contact. See backend
`docs/youtube-connection.md` for precise behavior and operational limitations.

## Rollout checklist

1. **Completed:** deploy backend API and report workers together, then admin and web. No new
   packages, migrations or automatic report regeneration are required. Keep all
   four optional YouTube settings consistent across API/workers; do not rotate
   encryption keys as part of this change.
2. **Completed:** verify anonymous and pending-device HTTP 200 and readable content at
   `https://assetinsightvaluator.com/privacy` and
   `https://assetinsightvaluator.com/terms/youtube`.
3. Save those exact URLs in the existing Google project's Branding settings;
   preserve the client ID, callback and scope. Do not publish a localhost URL.
4. Review Google production/verification requirements and provide genuine domain
   ownership and demo evidence. Pause for user authorization at Google consent
   or compliance declarations. Publishing the OAuth audience, sensitive-scope
   verification and YouTube's public-upload audit are separate requirements.
5. With explicit authorization, test one non-customer clip end to end. Local
   mocked tests do not prove Google grant, quota, channel access or public-upload
   eligibility. Do not upload customer originals as a smoke test.

The subsequent owner-authorized rollout completed with all six workers, API and
both frontend clusters healthy. Public pages are live; signed-in admin loaded
the new controls and refreshed the disconnected channel's status. No connection,
provider upload, Google publication or database repair was performed. Items 3–5
remain external activation steps. See backend
`docs/operations/youtube-release-2026-09-29.md` for release identities, rollback
retention, production smoke checks and query-safe callback access logging.

## Verification

Proxy tests cover anonymous, pending-device, access-cookie and refresh-cookie
readers and retained protected-path redirects. Static content tests check consent,
contact and accurate cleanup/visibility distinctions. The public-route E2E matrix
includes both pages. Record executed commands and browser checks at handoff;
added tests alone are not evidence of a passing run.

Executed locally on 29 September 2026 with environment-file reads and external
network access blocked: web typecheck, lint, production build and all 990 tests
passed; admin verification and all 90 policy tests passed; the frozen YouTube
backend integration/workflow gate passed all 190 tests, with backend typecheck,
build and report-workflow policy checks also passing.

The final full backend run completed with 2,666 passes and one failure in the
unchanged `admin-preview-resubmit.integration.test.ts:128`. Its raw-document
equality assertion raced rejected-request audit logging: only `activity_id`,
`activity_stream_id`, `activity_revision` and `activity_outbox` differed. Missing
FMV is rejected before the YouTube submission hook executes. This matches the
previously documented audit-equality race; no unrelated workflow or test was
changed. The full-suite gate is therefore not recorded as green.

Isolated production-browser checks covered exact per-video metadata, all three
visibility choices, fresh consent and reset-on-edit, accepted-versus-completed
status, cancelled removal, pending provider revocation after local cleanup,
manual external-revocation acknowledgement, keyboard dismissal/focus, narrow
320px layouts and dark mode. Public pages returned HTTP 200 for anonymous and
pending-device readers; protected neighboring paths still redirected. Keyboard
navigation between privacy and feature terms passed in both directions. Pointer
link activation could not be certified in the in-app browser; direct navigation,
link targets and keyboard activation passed. No live Google or customer media
was used. The test-only admin and API fixtures are not production evidence.

## References

- [Google OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Required YouTube functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [YouTube upload restrictions](https://developers.google.com/youtube/v3/docs/videos/insert)
