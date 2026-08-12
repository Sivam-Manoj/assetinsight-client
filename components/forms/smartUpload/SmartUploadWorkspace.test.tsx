import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SmartUploadWorkspace from "./SmartUploadWorkspace";
import type { SmartUploadDraft } from "./storage";
import type { SmartUploadGrouping } from "@/services/smartUpload";

const mocks = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  getGrouping: vi.fn(),
  updateDraft: vi.fn(),
}));

vi.mock("./storage", () => ({
  createSmartUploadDraft: vi.fn(),
  deleteSmartUploadDraft: vi.fn(),
  loadSmartUploadDraft: mocks.loadDraft,
  releaseSmartUploadMedia: vi.fn(),
  saveServerSmartUploadDraft: vi.fn(),
  updateSmartUploadDraft: mocks.updateDraft,
}));

vi.mock("@/services/smartUpload", () => ({
  cancelSmartUpload: vi.fn(),
  completeSmartUpload: vi.fn(),
  createOrResumeSmartUploadSession: vi.fn(),
  getSmartUploadError: (error: unknown) =>
    error instanceof Error ? error.message : "Smart Upload failed",
  getSmartUploadGrouping: mocks.getGrouping,
  startSmartUploadDetection: vi.fn(),
  updateSmartUploadDividers: vi.fn(),
  uploadSmartUploadFiles: vi.fn(),
  waitForSmartUploadGrouping: vi.fn(),
}));

const PREVIEW_URL =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function createReviewState() {
  const files: SmartUploadDraft["files"] = Array.from(
    { length: 300 },
    (_, index) => ({
      fileId: `images-${index}`,
      name: `photo-${index}.jpg`,
      type: "image/jpeg",
      size: 10,
      lastModified: index,
      originalOrder: index,
      uploaded: true,
    })
  );
  const draft: SmartUploadDraft = {
    version: 1,
    scope: "user-1:asset:scope-1",
    userId: "user-1",
    kind: "asset",
    clientSubmissionId: "scope-1",
    sessionId: "session-1",
    stage: "review",
    details: {},
    files,
    savedAt: "2026-08-12T12:00:00.000Z",
  };
  const grouping: SmartUploadGrouping = {
    sessionId: "session-1",
    smartUpload: true,
    groupingStatus: "review_ready",
    progressPercent: 100,
    groups: Array.from({ length: 100 }, (_, index) => ({
      groupIndex: index,
      imageCount: 3,
      fileIds: [`images-${index * 3}`, `images-${index * 3 + 1}`, `images-${index * 3 + 2}`],
      overLimit: false,
    })),
    dividerFileIds: [],
    metrics: [],
    warnings: [],
    expectedFileCount: files.length,
    confirmedFileCount: files.length,
    files: files.map((file) => ({
      fileId: file.fileId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      url: PREVIEW_URL,
      originalOrder: file.originalOrder,
    })),
  };
  return { draft, grouping };
}

describe("SmartUploadWorkspace preview memory bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDraft.mockResolvedValue(undefined);
  });

  it("pages large reviews instead of accumulating full-resolution images", async () => {
    const { draft, grouping } = createReviewState();
    mocks.loadDraft.mockResolvedValue(draft);
    mocks.getGrouping.mockResolvedValue(grouping);

    render(
      <SmartUploadWorkspace
        open
        kind="asset"
        userId="user-1"
        scopeId="scope-1"
        details={{}}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
      />
    );

    await screen.findByText("Images 1-12 of 300");
    await screen.findByText("Lots 1-6 of 100");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(18));

    for (const image of document.querySelectorAll("img")) {
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image).toHaveAttribute("decoding", "async");
      expect(image).toHaveAttribute("fetchpriority", "low");
    }

    fireEvent.click(screen.getByRole("button", { name: "Next images" }));
    await screen.findByText("Images 13-24 of 300");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(18));

    fireEvent.click(screen.getByRole("button", { name: "Next lots" }));
    await screen.findByText("Lots 7-12 of 100");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(18));
  });
});
