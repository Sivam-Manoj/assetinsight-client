import { expect, test, type Page } from "@playwright/test";
import type { SalvageAssessmentInputs, SalvageAssessmentV2 } from "../lib/salvageAssessment";
import type { SalvageReport } from "../services/salvage";

// Browser plugin not available: use the repository's Playwright workflow.
// Every API/photo request is isolated; this never creates reports or invokes AI.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3010"}`;
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function initialAssessment(): SalvageAssessmentV2 {
  const inputs: SalvageAssessmentInputs = {
    year: 2018, make: "Ford", model: "F-150", trim: "XLT", powertrain: null, vin: null,
    odometer: 120000, odometerUnit: "km", province: "ON", market: "Toronto", effectiveDate: "2026-09-08", lossType: "Collision",
    condition: "Front collision damage", damageDescription: "Bumper and front panel damaged", documentedBrand: null, brandProvince: null, brandEvidenceRef: null,
    currency: "CAD", repairItems: [], labourItems: [], charges: [], sellerCosts: { fees: null, transport: null, storage: null, disposal: null },
    suppliedComparables: [], suppliedReferences: [], overrides: { preLoss: null, asIs: null },
  };
  const conclusion = { amount: null, low: null, high: null, currency: "CAD" as const, priceBasis: null, status: "insufficient_evidence" as const, comparableIds: [], method: "Insufficient supported comparables", referenceIds: [] };
  return {
    schemaVersion: 2, generatedAt: "2026-09-08T12:00:00.000Z", inputs, researchedInputs: structuredClone(inputs), stale: false,
    photoFindings: [{ photoId: "photo-001", status: "not_analyzed", observations: [], facts: [], uncertainties: ["Unverified photograph"] }],
    candidates: [], comparables: [], references: [{ id: "reference-1", kind: "web", title: "Public Canadian source", url: "https://www.mpi.mb.ca/when-your-vehicle-is-written-off/", publisher: "MPI", accessedAt: "2026-09-08", excerpt: "Fixture reference for isolated browser verification.", photoIds: [] }],
    valuations: { preLoss: { ...conclusion }, asIs: { ...conclusion } },
    repairs: { parts: [], labour: [], charges: [], partsTotal: null, labourTotal: null, chargesTotal: null, knownSubtotal: 0, total: null, status: "incomplete" },
    netRecovery: { gross: null, deductions: inputs.sellerCosts, knownDeductions: 0, total: null, status: "incomplete", formula: "Gross less documented seller costs" },
    limitations: [{ code: "AS_IS_INSUFFICIENT_COMPARABLES", message: "No supported salvage value is available; professional review is required.", severity: "critical", acknowledgementRequired: true }],
    research: { status: "partial", model: "gpt-6-astra" },
  };
}

async function setup(page: Page, theme: "light" | "dark") {
  await page.context().addCookies([{ name: "cv_access_token", value: "isolated-assessment-owner", url: baseURL }]);
  await page.addInitScript((mode) => {
    localStorage.setItem("cv_access_token", "isolated-assessment-owner"); localStorage.setItem("cv-theme", mode);
  }, theme);
  const errors: string[] = [];
  const writes: { path: string; payload: Record<string, unknown> }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const assessment = initialAssessment();
  let snapshot: SalvageReport = { _id: "enterprise-1", reportId: "enterprise-1", file_number: "SALVAGE-ENTERPRISE-QA", revision: 2,
    createdAt: "2026-09-08T12:00:00.000Z", status: "preview", workflow_stage: "preview_ready", workflow_message: "Review saved Canadian assessment evidence.",
    imageUrls: ["https://assetinsight.pro/qa-original.jpg"], downloadable: false, preview_data: { file_number: "SALVAGE-ENTERPRISE-QA", language: "en", currency: "CAD", assessment, assessment_inputs: assessment.inputs }, files: {} };
  await page.route("https://assetinsight.pro/**", (route) => route.fulfill({ contentType: "image/png", body: pixel }));
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    let body: unknown = { data: [], items: [], enabled: false, configured: false, showBadge: false }, status = 200;
    if (path.endsWith("/user/me")) body = { _id: "isolated-owner", username: "QA Appraiser", email: "qa@example.test" };
    else if (path.endsWith("/notifications") || path.endsWith("/reports/myreports")) body = [];
    else if (path.endsWith("/salvage/enterprise-1/preview")) {
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON(); writes.push({ path, payload });
        expect(payload.baseRevision).toBe(snapshot.revision);
        expect(payload.data.assessment).toBeUndefined(); expect(payload.data.imageUrls).toBeUndefined();
        const current = snapshot.preview_data.assessment!;
        const inputs = payload.data.assessment_inputs as SalvageAssessmentInputs;
        const next: SalvageAssessmentV2 = { ...current, inputs, stale: inputs.market !== current.researchedInputs.market,
          valuations: { ...current.valuations, asIs: { ...current.valuations.asIs, amount: inputs.overrides.asIs?.amount ?? null, status: "appraiser_override" } } };
        snapshot = { ...snapshot, revision: snapshot.revision + 1, preview_data: { ...snapshot.preview_data, ...payload.data, assessment: next, assessment_inputs: inputs } };
      }
      body = { data: snapshot };
    } else if (path.endsWith("/salvage/enterprise-1/research")) {
      const payload = request.postDataJSON(); writes.push({ path, payload });
      expect(payload.baseRevision).toBe(snapshot.revision);
      snapshot = { ...snapshot, status: "processing", generation_state: "processing", workflow_stage: "preparing_preview", workflow_progress_percent: 32, workflow_message: "Inspecting uploaded photo evidence" };
      status = 202; body = { data: snapshot, reportId: snapshot._id, jobId: "isolated-research-job" };
    }
    await route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  return { errors, writes };
}

for (const theme of ["light", "dark"] as const) {
  test(`canonical salvage edit, save and explicit research (${theme})`, async ({ page }, testInfo) => {
    const state = await setup(page, theme);
    await page.goto("/salvage/preview/enterprise-1");
    await expect(page).toHaveURL(/\/salvage\/preview\/enterprise-1$/);
    await expect(page).toHaveTitle(/Asset Insight/i);
    await expect(page.getByRole("heading", { name: "Salvage report preview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved Canadian assessment" })).toBeVisible();
    await expect(page.getByLabel("Fair market value", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("saved-as-is-value")).toHaveText("Unavailable");
    await expect(page.getByTestId("saved-net-value")).toHaveText("Unavailable");
    await expect(page.locator("nextjs-portal [data-nextjs-dialog-overlay]")).toHaveCount(0);
    expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/assetinsight-salvage-assessment-${testInfo.project.name}-${theme}-initial.png` });

    await page.getByLabel("Market city / region").fill("Ottawa");
    await page.getByText("As-is salvage override", { exact: true }).click();
    await page.getByLabel("As-is override amount (CAD)", { exact: true }).fill("15000");
    await page.getByLabel("As-is override rationale", { exact: true }).fill("Appraiser reviewed the inspection and documented comparable evidence for this value.");
    await expect(page.getByTestId("saved-as-is-value")).toHaveText("Unavailable");
    await expect(page.getByRole("button", { name: "Research again", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Saved revision 3", { exact: true })).toBeVisible();
    await expect(page.getByTestId("saved-as-is-value")).toHaveText("$15,000.00");
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].payload).toMatchObject({ baseRevision: 2, data: { assessment_inputs: { market: "Ottawa", overrides: { asIs: { amount: 15000, appraiserReason: expect.stringContaining("Appraiser reviewed") } } } } });

    await page.getByText("Saved references (1)", { exact: true }).click();
    const source = page.getByRole("link", { name: "Public Canadian source", exact: true });
    await expect(source).toHaveAttribute("href", "https://www.mpi.mb.ca/when-your-vehicle-is-written-off/");
    await expect(source).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await page.getByRole("heading", { name: "Saved Canadian assessment" }).scrollIntoViewIfNeeded();
    expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/assetinsight-salvage-assessment-${testInfo.project.name}-${theme}-saved.png` });

    const stableId = "93fc494f-f85a-4d22-9607-8a1abb9ca53a";
    await page.evaluate((value) => sessionStorage.setItem("cv:salvage-research:enterprise-1:3", value), stableId);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Research again", exact: true }).click();
    expect(state.writes).toHaveLength(1);
    let confirmation = "";
    page.once("dialog", async (dialog) => { confirmation = dialog.message(); await dialog.accept(); });
    await page.getByRole("button", { name: "Research again", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Salvage processing progress" })).toHaveAttribute("value", "32");
    expect(confirmation).toContain("US$10"); expect(confirmation).toContain("15 minutes");
    expect(state.writes).toHaveLength(2);
    expect(state.writes[1]).toEqual({ path: "/api/salvage/enterprise-1/research", payload: { baseRevision: 3, client_request_id: stableId } });
    await expect(page.getByLabel("Assessment make", { exact: true })).toBeDisabled();
    await expect(page.locator("nextjs-portal [data-nextjs-dialog-overlay]")).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });
}
