import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type ThemeMode = "light" | "dark";

const port = process.env.PLAYWRIGHT_PORT || "3010";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

const incomingItem = {
  cycleKey: "e2e-cycle-100",
  contractId: "e2e-contract-100",
  contractNo: "CV-E2E-100",
  customerName: "Northfield Plant Ltd",
  eventId: "e2e-event-100",
  eventTitle: "Fleet dispersal",
  eventDate: "2026-08-12T10:00:00.000Z",
  location: "Leeds",
  kind: "scheduleA",
  lotCount: 14,
  status: "available",
};

const reportThumbnailUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='112' viewBox='0 0 160 112'%3E%3Crect width='160' height='112' fill='%23dbeafe'/%3E%3Cpath d='M20 82l32-31 21 18 23-29 44 42z' fill='%232563eb'/%3E%3C/svg%3E";

async function initializeTheme(page: Page, theme: ThemeMode) {
  await page.addInitScript((initialTheme: ThemeMode) => {
    if (!window.localStorage.getItem("cv-theme")) {
      window.localStorage.setItem("cv-theme", initialTheme);
    }
  }, theme);
}

async function mockAuthenticatedApi(
  page: Page,
  {
    approver = true,
    releaseManager = true,
    incomingItems = [incomingItem],
  }: {
    approver?: boolean;
    releaseManager?: boolean;
    incomingItems?: Array<Record<string, unknown>>;
  } = {}
) {
  await page.context().addCookies([
    {
      name: "cv_access_token",
      value: "e2e-access-token",
      url: baseURL,
    },
    {
      name: "cv_refresh_token",
      value: "e2e-refresh-token",
      url: baseURL,
    },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem("cv_access_token", "e2e-access-token");
    window.localStorage.setItem("cv_refresh_token", "e2e-refresh-token");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown;

    if (path.endsWith("/api/user/me")) {
      body = {
        _id: "e2e-user",
        email: "alex.morgan@example.com",
        username: "Alex Morgan",
        isReportApprover: approver,
        isReleaseManager: releaseManager,
      };
    } else if (path.endsWith("/api/reports/stats")) {
      body = {
        totalReports: 12,
        totalFairMarketValue: 1_240_000,
        breakdown: {
          counts: { "Market comparison": 7, "Cost approach": 5 },
          values: {
            "Market comparison": 840_000,
            "Cost approach": 400_000,
          },
        },
      };
    } else if (path.endsWith("/api/reports/myreports")) {
      body = [];
    } else if (path.endsWith("/api/asset")) {
      body = {
        message: "ok",
        data: [
          {
            _id: "e2e-asset-report",
            user: "e2e-user",
            grouping_mode: "lot",
            imageUrls: [],
            status: "approved",
            lots: [
              {
                lot_number: "12",
                estimated_value: "48000",
                image_urls: [reportThumbnailUrl],
              },
            ],
            client_name: "Northfield Plant Ltd",
            contract_no: "CV-E2E-REPORT",
            preview_files: {
              pdf: "/files/cv-e2e-report.pdf",
            },
            createdAt: "2026-08-02T09:00:00.000Z",
            updatedAt: "2026-08-02T09:30:00.000Z",
          },
        ],
      };
    } else if (
      path.endsWith("/api/real-estate") ||
      path.endsWith("/api/lot-listing")
    ) {
      body = { data: [] };
    } else if (path.endsWith("/api/auctioneer/status")) {
      body = {
        enabled: true,
        configured: true,
        reachable: true,
      };
    } else if (path.endsWith("/api/auctioneer/incoming/summary")) {
      body = {
        availableCount: incomingItems.filter(
          (item) => item.status === "available"
        ).length,
      };
    } else if (path.endsWith("/api/auctioneer/incoming")) {
      body = { data: { items: incomingItems } };
    } else if (
      path.includes("/api/auctioneer/incoming/") &&
      path.endsWith("/claim")
    ) {
      body = {
        data: {
          workItemId: "e2e-work-item-100",
          cycleKey: incomingItem.cycleKey,
          kind: incomingItem.kind,
          reportType: "asset",
          contract: {
            id: incomingItem.contractId,
            contractNo: incomingItem.contractNo,
            customerName: incomingItem.customerName,
            eventId: incomingItem.eventId,
            eventTitle: incomingItem.eventTitle,
            eventDate: incomingItem.eventDate,
            location: incomingItem.location,
          },
          lots: [],
        },
      };
    } else {
      body = { data: [] };
    }

    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });
}

async function expectTheme(page: Page, theme: ThemeMode) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect
    .poll(() =>
      page.locator("html").evaluate((element) => element.style.colorScheme)
    )
    .toBe(theme);
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const widestDocumentWidth = Math.max(
    metrics.rootScrollWidth,
    metrics.bodyScrollWidth
  );

  expect(
    widestDocumentWidth,
    `Document width ${widestDocumentWidth}px exceeded the ${metrics.viewportWidth}px viewport`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations.filter(
    (violation) =>
      violation.impact === "critical" || violation.impact === "serious"
  );

  expect(
    violations,
    violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.description} (${violation.nodes.length} nodes)`
      )
      .join("\n")
  ).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`public landing and sign-in are keyboard accessible in ${theme} mode`, async ({
    page,
  }) => {
    await initializeTheme(page, theme);
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Client-ready valuation packages/i,
      })
    ).toBeVisible();
    await expectTheme(page, theme);
    await expect(
      page.getByRole("img", { name: /Asset appraiser reviewing/i })
    ).toBeVisible();

    const signIn = page.getByRole("link", { name: "Sign in" }).first();
    await signIn.focus();
    await expect(signIn).toBeFocused();
    await signIn.press("Enter");

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Welcome back" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expectTheme(page, theme);
    await expectNoSeriousAccessibilityViolations(page);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`authenticated dashboard and Incoming smoke in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    const isMobile = Boolean(testInfo.project.use.isMobile);
    await initializeTheme(page, theme);
    await mockAuthenticatedApi(page);
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { level: 1, name: /Alex Morgan/ })
    ).toBeVisible();
    await expectTheme(page, theme);

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const incoming = page.getByRole("link", { name: /Incoming/ });
    await expect(incoming).toBeVisible();
    await incoming.focus();
    await expect(incoming).toBeFocused();
    await incoming.press("Enter");

    await expect(page).toHaveURL(/\/incoming$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Incoming" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review CV-E2E-100" })
    ).toBeVisible();

    const themeButtonName = isMobile
      ? theme === "dark"
        ? "Use light theme"
        : "Use dark theme"
      : theme === "dark"
        ? "Light theme"
        : "Dark theme";
    if (isMobile) {
      await page
        .getByRole("button", { name: themeButtonName, exact: true })
        .click();
    } else {
      await page
        .getByRole("button", { name: themeButtonName, exact: true })
        .click();
    }
    const opposite = theme === "dark" ? "light" : "dark";
    await expectTheme(page, opposite);
    await page.reload();
    await expectTheme(page, opposite);
    await expect(
      page.getByRole("heading", { level: 1, name: "Incoming" })
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });
}

test("Incoming remains visible for a standard authenticated user", async ({
  page,
}, testInfo) => {
  const isMobile = Boolean(testInfo.project.use.isMobile);
  await initializeTheme(page, "light");
  await mockAuthenticatedApi(page, {
    approver: false,
    releaseManager: false,
  });
  await page.goto("/dashboard");

  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }

  await expect(page.getByRole("link", { name: /Incoming/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Releases" })).toHaveCount(0);
});

test("enterprise shell landmarks and My Reports stay responsive", async ({
  page,
}, testInfo) => {
  const isMobile = Boolean(testInfo.project.use.isMobile);
  await initializeTheme(page, "light");
  await mockAuthenticatedApi(page);
  await page.goto("/dashboard");

  if (isMobile) {
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
  } else {
    const sidebar = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Workspace", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Review", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Account", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Toggle navigation width" })
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", {
        name: "Search reports, lots, and clients",
      })
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Light theme" })
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Dark theme" })
    ).toBeVisible();
  }

  const expectedDestinations = ["Dashboard", "Incoming", "My Reports", "Previews"];
  for (const label of expectedDestinations) {
    await expect(
      page.getByRole("link", { name: new RegExp(label) })
    ).toBeVisible();
  }

  await page.getByRole("link", { name: "My Reports" }).press("Enter");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "My reports" })
  ).toBeVisible();

  const thumbnail = page.getByRole("img", {
    name: /Preview image for Asset.*CV-E2E-REPORT/i,
  });
  await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveAttribute("loading", "lazy");
  await expect(thumbnail).toHaveAttribute("decoding", "async");
  await expect(thumbnail).toHaveAttribute("fetchpriority", "low");
  await expectNoHorizontalOverflow(page);
});

test("public and authentication route matrix renders cleanly", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await initializeTheme(page, "light");

  const routes = [
    { path: "/", heading: "Client-ready valuation packages, without the workflow clutter.", level: 1 },
    { path: "/login", heading: "Welcome back", level: 2 },
    { path: "/signup", heading: "Build your workspace", level: 2 },
    { path: "/forgot-password", heading: "Reset your password", level: 2 },
    {
      path: "/verify-email?email=alex%40example.com",
      heading: "Check your inbox",
      level: 2,
    },
    {
      path: "/reset-password/e2e-reset-token",
      heading: "Choose a new password",
      level: 2,
    },
  ] as const;

  for (const route of routes) {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", {
        level: route.level,
        name: route.heading,
      })
    ).toBeVisible();
    await expectTheme(page, "light");
  }
});

test("authenticated workspace route matrix renders cleanly", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await initializeTheme(page, "light");
  await mockAuthenticatedApi(page);

  const routes = [
    { path: "/dashboard", heading: /Alex Morgan/ },
    { path: "/incoming", heading: "Incoming" },
    { path: "/reports", heading: "My reports" },
    { path: "/previews", heading: "Report previews" },
    { path: "/approvals", heading: "Assigned approvals" },
    { path: "/releases", heading: "Assigned releases" },
    { path: "/settings", heading: "Settings" },
  ] as const;

  for (const route of routes) {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading })
    ).toBeVisible();
    await expectTheme(page, "light");
  }
});

test("Incoming claim opens the selected report workflow", async ({ page }) => {
  await initializeTheme(page, "light");
  await mockAuthenticatedApi(page);
  await page.goto("/incoming");

  await page
    .getByRole("button", { name: "Review CV-E2E-100" })
    .click();
  await page
    .getByRole("button", { name: "Claim and create report" })
    .click();

  await expect(
    page.getByRole("dialog", { name: /Asset report/ })
  ).toBeVisible();
});

test("Incoming opens an existing report from the queue", async ({ page }) => {
  await initializeTheme(page, "light");
  await mockAuthenticatedApi(page, {
    incomingItems: [
      {
        ...incomingItem,
        status: "report_created",
        claimedByMe: true,
        workItemId: "e2e-work-item-100",
        reportId: "e2e-report-100",
      },
    ],
  });
  await page.goto("/incoming");

  await page
    .getByRole("button", { name: "Review CV-E2E-100" })
    .click();
  await page.getByRole("button", { name: "Open report" }).click();

  await expect(page).toHaveURL(/\/reports$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "My reports" })
  ).toBeVisible();
});
