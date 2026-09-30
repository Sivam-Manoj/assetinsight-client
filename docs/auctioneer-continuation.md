# Create Lot & Continue

For imported Asset and Lot Listing forms, Continue submits the current capture
through the normal upload workflow. Once the server accepts the upload, the page
requests a successor work item and opens a fresh form without waiting for report
analysis or old-draft cleanup. Close instead opens Previews; it does not finish
the Auctioneer contract.

The successor carries the current form's editable details and settings (including
edited location, dates and currency), but never its lots, media, cover choices,
draft identity or submission identity. A failed handoff retains these details for
Retry; that action retries only continuation, never the accepted upload.

Backend continuation must support both currently assigned Proposal contracts and
currently assigned Operations tasks on the exact contract. Missing/reassigned
authority and changed events remain errors. Deploy this backend support before
the web client. No Auctioneer API changes or historical report changes are needed.

Regression coverage includes both form workflows, successor identity/remount and
retry tests, and production-build browser flows on desktop and mobile viewports.
Browser provider calls are isolated fixtures, not real customer submissions.
