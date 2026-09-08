This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

### Failed Asset and Lot Listing preview recovery

The preview queue and report deep links keep Preview available after generation
failure when the API advertises `preview_available` (with legacy data fallback).
Opening does not retry work. The editor retains a failure warning and saves edits
on the same report; its final action uses resubmit for error states. All stored
lots/media remain available for review. Reports without saved preview data link
to Drafts instead of offering an empty preview or an unusable file-generation
retry. Generation/download readiness is not inferred from preview availability.

### Salvage review workflow

Salvage uploads open the saved report at `/salvage/preview/[id]`. The page follows processing progress, allows review of claim/vehicle details, valuation and repair estimates, and preserves all original photos. Save updates the current revision only; Submit/Resubmit generates the files in a separate accepted workflow. Failed work can be retried from the same report without uploading another copy. Reports and Previews both link back to this workspace.

Legacy reports retain their existing condition, damage, facility and cash/reserve editors. V2 Canadian assessments instead use typed `assessment_inputs`: subject/market/date, parts/labour/charges, seller deductions, supplied evidence and reasoned appraiser overrides. Conclusions are saved server calculations, not live browser estimates. Unknown amounts remain unavailable, and material subject edits mark the research stale. The legacy financial editor is hidden for v2 so two competing values cannot be submitted.

New Salvage intake supports 50 ordered photos and CAD by default. The capture form collects claim, province/market and loss context, not vehicle identity or engine specifications. Upload clear VIN/serial, engine, badge and dashboard photos; the backend provides optional versioned `assessment.vehicleDetails`, using the Excel catalogue for field definitions only. Preview shows readable photo values, explicit “Cannot find from image” states and conflicts, with source-photo inspection. Appraiser changes are sent only through `assessment_inputs.vehicleOverrides`; null explicitly clears a value. The backend preserves evidence and synchronizes identity fields. Changing vehicle category updates the workbook field list on save. Legacy assessments without photo-derived details retain their clearly labelled unverified identity editor.

**Research again** is a separately confirmed paid action with the saved revision and a session-persisted request ID. Unknown network outcomes reuse that ID. Saves, file submissions and refreshes never request paid research. Backend support must precede this client; new chart/report-body visual rollout and real-vehicle acceptance remain pending. The backend's authorized synthetic OCR/live-search smoke test passed on 2026-09-08; this does not establish valuation accuracy or complete export parity.

Downloads use authenticated PdfReport IDs returned by the backend and remain disabled until the required generation, approval and release are complete. Concurrent edits produce a revision conflict rather than overwriting another device's changes. Unsaved changes remain on screen until explicitly discarded or saved.

Focused verification: `npm test -- services/salvage.test.ts components/forms/SalvageForm.workflow.test.tsx components/reports/SalvagePreviewWorkspace.test.tsx components/reports/SalvageVehicleDetails.test.tsx components/reports/SalvageAssessmentEditor.test.tsx` and `npm run test:e2e -- e2e/salvage-preview.spec.ts e2e/salvage-assessment.spec.ts`. The browser tests use isolated API/storage fixtures and do not call production providers.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
