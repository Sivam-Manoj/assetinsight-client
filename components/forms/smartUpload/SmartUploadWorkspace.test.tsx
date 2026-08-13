import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SmartUploadWorkspace from "./SmartUploadWorkspace";
import type { SmartUploadDraft } from "./storage";
import type { SmartUploadGrouping } from "@/services/smartUpload";

const mocks = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  getGrouping: vi.fn(),
  updateDraft: vi.fn(),
  updateGrouping: vi.fn(),
  complete: vi.fn(),
  deleteDraft: vi.fn(),
  createDraft: vi.fn(),
}));

vi.mock("./storage", () => ({
  createSmartUploadDraft: mocks.createDraft,
  deleteSmartUploadDraft: mocks.deleteDraft,
  loadSmartUploadFile: vi.fn(),
  loadSmartUploadDraft: mocks.loadDraft,
  releaseSmartUploadMedia: vi.fn(),
  saveServerSmartUploadDraft: vi.fn(),
  updateSmartUploadDraft: mocks.updateDraft,
}));

vi.mock("@/services/smartUpload", () => ({
  cancelSmartUpload: vi.fn(),
  completeSmartUpload: mocks.complete,
  createOrResumeSmartUploadSession: vi.fn(),
  getSmartUploadError: (error: unknown) =>
    error instanceof Error ? error.message : "Smart Upload failed",
  getSmartUploadErrorCode: vi.fn(),
  getSmartUploadGrouping: mocks.getGrouping,
  startSmartUploadDetection: vi.fn(),
  updateSmartUploadDividers: mocks.updateGrouping,
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
    revision: 0,
    orderReviewRequired: false,
    unresolvedDividerIds: [],
    hasOrderReviewState: true,
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

function workspace(onSubmitted = vi.fn()) {
  return (
    <SmartUploadWorkspace
      open
      kind="asset"
      userId="user-1"
      scopeId="scope-1"
      details={{}}
      onClose={vi.fn()}
      onSubmitted={onSubmitted}
    />
  );
}

describe("SmartUploadWorkspace preview memory bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDraft.mockResolvedValue(undefined);
    mocks.deleteDraft.mockResolvedValue(undefined);
  });

  it("pages large reviews instead of accumulating full-resolution images", async () => {
    const { draft, grouping } = createReviewState();
    mocks.loadDraft.mockResolvedValue(draft);
    mocks.getGrouping.mockResolvedValue(grouping);

    render(workspace());

    await screen.findByText("Images 1-12 of 300");
    await screen.findByText("Lots 1-6 of 100");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(21));

    for (const image of document.querySelectorAll("img")) {
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image).toHaveAttribute("decoding", "async");
      expect(image).toHaveAttribute("fetchpriority", "low");
    }

    fireEvent.click(screen.getByRole("button", { name: "Next images" }));
    await screen.findByText("Images 13-24 of 300");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(21));

    fireEvent.click(screen.getByRole("button", { name: "Next lots" }));
    await screen.findByText("Lots 7-12 of 100");
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(21));
  });

  it("retries completion without reconfirming a grouping whose response failed", async () => {
    const { draft, grouping } = createReviewState();
    const confirmed = { ...grouping, groupingStatus: "confirmed" as const, revision: 1 };
    const submitted = {
      message: "Report queued",
      reportId: "report-1",
      jobId: "job-1",
      status: "queued",
      phase: "queued",
    };
    const onSubmitted = vi.fn();
    mocks.loadDraft.mockResolvedValue(draft);
    mocks.getGrouping
      .mockResolvedValueOnce(grouping)
      .mockResolvedValueOnce(confirmed);
    mocks.updateGrouping.mockResolvedValue(confirmed);
    mocks.complete
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce(submitted);

    render(workspace(onSubmitted));

    fireEvent.click(await screen.findByRole("button", { name: "Create preview" }));
    await screen.findByText("Connection interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Create preview" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(submitted));
    expect(mocks.updateGrouping).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });

  it("requires an explicit acknowledgement before uploading a timestamp suggestion", async () => {
    mocks.loadDraft.mockResolvedValue(null);
    const files = [
      new File(["a"], "scan-a.jpg", { type: "image/jpeg", lastModified: 3_000 }),
      new File(["b"], "scan-b.jpg", { type: "image/jpeg", lastModified: 1_000 }),
      new File(["c"], "scan-c.jpg", { type: "image/jpeg", lastModified: 2_000 }),
    ];
    mocks.createDraft.mockImplementation(async (args: {
      userId: string;
      kind: SmartUploadDraft["kind"];
      clientSubmissionId: string;
      details: Record<string, unknown>;
      files: File[];
    }) => ({
      version: 1,
      scope: "user-1:asset:scope-1",
      userId: args.userId,
      kind: args.kind,
      clientSubmissionId: args.clientSubmissionId,
      stage: "selected",
      details: args.details,
      savedAt: "2026-08-13T12:00:00.000Z",
      files: args.files.map((file, index) => ({
        fileId: `images-${index}`,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        originalOrder: index,
        uploaded: false,
        file,
      })),
    }));

    render(workspace());
    await screen.findByRole("button", { name: "Select images" });
    // The full-screen workspace is rendered through a portal into document.body.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });

    const upload = await screen.findByRole("button", { name: "Upload & detect lots" });
    expect(upload).toBeDisabled();
    expect(screen.getByText("Check upload sequence")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Move scan-b.jpg later" })
    );
    await waitFor(() => {
      const persisted =
        mocks.updateDraft.mock.calls[mocks.updateDraft.mock.calls.length - 1]?.[2];
      expect(persisted.files).toMatchObject([
        { fileId: "images-1", name: "scan-c.jpg", originalOrder: 0 },
        { fileId: "images-0", name: "scan-b.jpg", originalOrder: 1 },
        { fileId: "images-2", name: "scan-a.jpg", originalOrder: 2 },
      ]);
      expect(persisted.files.every((file: { file?: File }) => !file.file)).toBe(true);
    });
    expect(upload).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm this image order" }));
    await waitFor(() => expect(upload).toBeEnabled());
  });

  it("does not turn an edge report photo into a divider", async () => {
    const { draft, grouping } = createReviewState();
    const oneLotDraft = { ...draft, files: draft.files.slice(0, 3) };
    const oneLotGrouping: SmartUploadGrouping = {
      ...grouping,
      groups: [grouping.groups[0]],
      files: grouping.files?.slice(0, 3),
      expectedFileCount: 3,
      confirmedFileCount: 3,
    };
    mocks.loadDraft.mockResolvedValue(oneLotDraft);
    mocks.getGrouping.mockResolvedValue(oneLotGrouping);

    render(workspace());
    const firstPhoto = await screen.findByRole("button", {
      name: /photo-0\.jpg\. Use as divider/i,
    });
    fireEvent.click(firstPhoto);

    await screen.findByText(
      "A divider needs report photos on both sides. Select an image between two groups instead."
    );
    expect(mocks.updateGrouping).not.toHaveBeenCalled();
  });

  it("blocks completion when an uploaded image could not be inspected", async () => {
    const { draft, grouping } = createReviewState();
    mocks.loadDraft.mockResolvedValue(draft);
    mocks.getGrouping.mockResolvedValue({
      ...grouping,
      metrics: [
        {
          fileId: "images-7",
          meanLuminance: 0,
          darkPixelRatio: 0,
          variance: 0,
          isDivider: false,
          error: "Input image is unreadable",
        },
      ],
      warnings: ["Could not inspect images-7: Input image is unreadable"],
    });

    render(workspace());

    await screen.findByText("One image could not be checked");
    expect(screen.getByText("photo-7.jpg")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create preview" })
    ).toBeDisabled();
  });
});
