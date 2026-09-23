# Appraiser web CRM

`/crm` brings the existing native CRM workflows into the appraiser web shell.
Only an explicitly enabled `isCrmAgent === true` user sees the navigation or
starts CRM requests. Backend authentication, device checks, current assignment
and update authorship remain authoritative; admin role alone grants no access.

## Workspace and workflows

- **Tasks:** debounced literal search, stage/source/due filters, 20/50-row server
  pagination, sticky desktop headers, compact mobile rows and last-refresh time.
  Open tasks uses the existing backend scope, not all historic assignments.
- **Task details:** direct notification links resolve independently of the list
  page/filter. Contact/company/import facts are read-only. Activity is fetched
  20 entries at a time, including deleted tombstones, newest first.
- **Follow-up:** stage, Lost reason, multiline comment, up to ten attachments
  and one recording (50 MiB each). Every new update records a contact attempt.
  Unchanged status is omitted so comment-only updates do not reset reminders.
  Own historical entries/media can be edited or removed with confirmation;
  history status changes retain existing backend scheduling semantics.
- **Email and voice:** browser recording is local until explicit transcription,
  with a 25 MiB bound and microphone cleanup. Typed text remains available when
  recording is unsupported/denied. Email rewrite is explicit and returned HTML
  is converted to plain editable text. Open email app prepares a mailto draft;
  it never means an email has been sent.
- **Add lead / Coverage:** create an organic lead with a local-time follow-up,
  or edit service address, coverage quadrants and specializations. Existing
  canonical comma-separated coverage is preserved. These are not general
  contact-edit/delete or administrator assignment tools.
- **Transfers:** choose an enabled agent from task details; incoming requests
  can be accepted/rejected in Transfers. The API returns the latest 100 per status,
  which the UI labels explicitly rather than claiming an unlimited archive.
- **Outlook:** connection/disconnection and explicit single/bulk task-event
  export (at most 100 selected). This is not a calendar event-reader API. Every
  export creates new events; repeats can duplicate them. Validate provider
  receipts, expose actual outcomes and do not infer success for missing results.

## Performance and safety

The backend adds `GET /crm/tasks/my?view=summary`, `GET /crm/tasks/:id` and
`GET /crm/tasks/:id/updates`. See the backend `docs/crm-agent-api.md` for precise
contracts. Summary projection excludes embedded history, company notes, imports
and media before API materialization. Legacy native reads/mutation responses
remain compatible; full mutation histories are discarded by the web detail
editor after updating its bounded cache.

Task detail, lead/coverage forms, Transfers and Outlook load as separate dynamic
chunks. No charts, new UI dependencies, polling or full-history list loading.
Read requests have a 20-second timeout, scoped owner/query keys and shared
cancellation that survives StrictMode and multiple consumers. Abandoned queries
are aborted after the final consumer leaves; late results cannot replace another
owner/filter. Definitive access errors hide cached data. Account changes unmount
the owner's panels. Reconnection refreshes reads, never replays a mutation.

Mutations use immediate single-flight locks and disable Axios automatic 401 replay.
There is no new server idempotency protocol for legacy CRM actions. An uncertain
response keeps entered text and instructs the operator to check the saved activity,
task list or calendar before trying again. Calendar attempts clear their selection.
Dirty detail/history/email navigation asks before discarding. Explicitly reloading
the page is necessary to verify an uncertain coverage save; reopening a drawer
alone would use the last known profile.

CRM notifications resolve to `/crm?task=<24-hex-id>`, `/crm?view=transfers` or
`/crm`. Existing report reminder/incoming behavior is preserved. All external
media/contact links require safe protocols; provider HTML is never rendered.

## Design and QA

The accepted desktop concept establishes the compact blue-accent heading/actions,
flat tabbed surface, five data columns, outlined filters and bottom pagination.
The mobile concept establishes contact hierarchy, inline actions, Activity/Details,
bordered follow-up form and timeline. Actual implementation preserves the existing
logo, sidebar, safe-area drawer and theme tokens. Intentional differences: only
real Imported/Organic sources, real API totals, no invented sortable column,
Outlook/recording controls, reminder/uncertainty guidance and bounded history pages.

Browser verification uses synthetic API interception and blocks external requests;
no customer records, email deliveries, calendar events or paid provider calls are
created. The local in-app browser confirms the real authentication boundary;
Playwright supplies isolated request fixtures, viewport changes and automated axe
checks not available through the interactive browser surface. Test coverage lives
in `e2e/crm.spec.ts`, `components/crm/*.test.tsx`, `services/crm.test.ts` and the
notification/navigation suites. Desktop concept size is 1586×992; additional
coverage includes 320px, 390px, 1024px, 1366px, 1535px and 844×390 landscape.

### Visual fidelity review

The final production build was captured using Playwright viewport screenshots,
then inspected with `view_image` alongside both accepted concepts. The desktop
comparison used the concept's native 1586×992 viewport. The mobile detail concept
was also checked against 320px and 390px narrow-screen renders in light/dark themes.
The review covered:

| Comparison | Concept and rendered evidence | Resolution |
| --- | --- | --- |
| Structure | CRM heading/actions, Tasks/Transfers/Outlook, filters, five data columns and pager | Preserved; no dashboard cards or invented metrics. |
| Copy | CRM, Leads/follow-ups/appointments, Coverage, Add lead, tab and form labels | Above-the-fold copy diff retains workflow wording; actual API source labels and refresh times replace illustrative values. |
| Typography | Strong contact names, muted company lines, explicit compact control sizing | Uses existing Geist/control tokens; denser than the illustrative font scale to satisfy the requested compact workspace. |
| Palette | White/cool-neutral surfaces and blue actions, without decorative effects | Existing light/dark theme tokens retained throughout. |
| Branding/icons | Outline navigation/action icons and existing application shell | Existing Asset Insight logo, authorized navigation and Lucide icons intentionally replace the generated shell mockup. |
| Table geometry | Contact column remains readable with or without selection | Fixed an oversized Outlook checkbox column; browser assertions now require a narrow selection column and usable contact width. |
| Mobile detail | Contact hierarchy, Call/Email/Transfer, Activity/Details, follow-up form and timeline | Existing safe-area drawer replaces the mockup's custom header; controls wrap and content scrolls without horizontal overflow. |
| Required extras | Outlook export, recording attachment, uncertain-response and reminder guidance | Intentional native-workflow additions; pagination replaces the illustrative unlimited history control. |

The implementation is faithfully verified against the accepted design with these
explicit compatibility/density differences; no material unresolved visual mismatch
remains. The core checked path is search/page → open task → edit/save follow-up →
inspect history, plus lead/coverage saves, transfer acceptance, dirty-edit protection
and explicit Outlook/email actions. Production components contain no fixture data.

### Verification result (2026-09-23)

- Web: production build, TypeScript, lint and all 741 unit tests passed.
- Browser: 45 isolated production-build scenarios passed across five viewport
  projects, including light/dark axe checks, 320px checks, mutations, failures,
  access gates and explicit email/calendar handoffs.
- Backend: all 26 new CRM route integration cases, typecheck and build passed.
  The full suite returned 2,000 passes and one unrelated existing failure at
  `tests/admin-preview-resubmit.integration.test.ts:128`. Its whole-document
  equality assertion rejects existing activity-ledger metadata added during a
  missing-FMV rejection; the failure also reproduces in isolation. No report
  generation or recovery behavior was changed as part of CRM.

Deploy backend read support **before** this web client. No native/admin changes,
new packages or migrations were made, and nothing was pushed or deployed.
Real Microsoft consent/delivery, live transcription, physical mobile browsers and
deployment-scale database latency remain separate acceptance checks.
