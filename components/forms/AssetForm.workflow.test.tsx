import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportDraftRecord } from "@/services/reportDrafts";
import AssetForm from "./AssetForm";

type DraftProgress = {
  phase: "preparing" | "uploading" | "verifying" | "complete";
  percent: number;
  message: string;
  totalFiles: number;
  uploadedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
};

type DraftProgressCallback = (
  percent: number,
  message: string,
  details: DraftProgress
) => void;

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  upsertWithMedia: vi.fn(),
  deleteDraftByClientId: vi.fn(),
  createAsset: vi.fn(),
  deleteScopedDraft: vi.fn(),
  deleteSmartUploadDraft: vi.fn(),
  geolocation: vi.fn(),
  reverseGeocode: vi.fn(),
  restoreLots: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  let dynamicIndex = 0;

  return {
    default: () => {
      const componentIndex = dynamicIndex++;
      if (componentIndex !== 0) {
        return function DeferredWorkspace() {
          return null;
        };
      }

      return function TestMixedSection({
        value,
        onChange,
      }: {
        value: Array<{
          id: string;
          mode?: "single_lot" | "per_item" | "per_photo";
          files: File[];
          extraFiles: File[];
          videoFiles?: File[];
          coverIndex: number;
        }>;
        onChange: (value: Array<{
          id: string;
          mode?: "single_lot" | "per_item" | "per_photo";
          files: File[];
          extraFiles: File[];
          videoFiles?: File[];
          coverIndex: number;
        }>) => void;
      }) {
        const selectedName = value[0]?.files[0]?.name || "No media selected";
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () =>
                onChange([
                  {
                    id: "lot-test-1",
                    mode: "single_lot",
                    files: [
                      new File(["asset-photo"], "asset-photo.jpg", {
                        type: "image/jpeg",
                        lastModified: 1,
                      }),
                    ],
                    extraFiles: [],
                    videoFiles: [],
                    coverIndex: 0,
                  },
                ]),
            },
            "Add test media"
          ),
          React.createElement(
            "output",
            { "data-testid": "selected-asset-media" },
            selectedName
          )
        );
      };
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: {
      _id: "user-asset-workflow",
      username: "Alex Appraiser",
      companyName: "Asset Insight QA",
    },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/services/asset", () => ({
  AssetService: { create: mocks.createAsset },
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: { reverseGeocode: mocks.reverseGeocode },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    upsertWithMedia: mocks.upsertWithMedia,
    deleteByClientId: mocks.deleteDraftByClientId,
    restoreLots: mocks.restoreLots,
  },
  createReportDraftClientId: () => "asset-workflow-draft",
  getDuplicateLotWarning: () => null,
  getReportDraftDeviceId: () => "asset-workflow-device",
}));

vi.mock("@/services/savedInputs", () => ({
  SavedInputService: { create: vi.fn() },
  getDraftFileMetadata: (file: File) => ({
    name: file.name,
    size: file.size,
    mimeType: file.type,
    lastModified: file.lastModified,
  }),
}));

vi.mock("./drafts/storage", () => ({
  FORM_DRAFT_VERSION: 3,
  deleteScopedDraft: mocks.deleteScopedDraft,
  getScopedDraftKey: () => "asset-workflow-storage-key",
  loadScopedDraft: vi.fn(),
  parseScopedDraftEnvelope: vi.fn(),
  requestDurableDraftStorage: vi.fn(),
  saveScopedDraft: vi.fn(),
}));

vi.mock("./smartUpload/storage", () => ({
  deleteSmartUploadDraft: mocks.deleteSmartUploadDraft,
}));

const originalGeolocation = Object.getOwnPropertyDescriptor(
  window.navigator,
  "geolocation"
);

const position = {
  coords: {
    latitude: 51.507351,
    longitude: -0.127758,
    accuracy: 7.4,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
} as GeolocationPosition;

const RESOLVED_ASSET_LOCATION =
  "10 Downing Street, London SW1A 2AA, United Kingdom";
const OPENSTREETMAP_COPYRIGHT_URL =
  "https://www.openstreetmap.org/copyright";

const uploadingProgress: DraftProgress = {
  phase: "uploading",
  percent: 35,
  message: "Uploading asset-photo.jpg",
  totalFiles: 1,
  uploadedFiles: 0,
  totalBytes: 11,
  uploadedBytes: 4,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function addTestMedia() {
  fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
}

function fillRequiredReportFields() {
  fireEvent.change(screen.getByLabelText(/Client name/i), {
    target: { value: "Workflow Client" },
  });
  fireEvent.change(screen.getByLabelText(/Appraisal purpose/i), {
    target: { value: "Insurance valuation" },
  });
  fireEvent.change(screen.getByLabelText(/Currency/i), {
    target: { value: "GBP" },
  });
}

async function waitForResolvedAssetLocation() {
  const location = screen.getByLabelText(/Inspection location/i);
  await waitFor(() =>
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION)
  );
  return location;
}

function makeAssetResumeDraft(
  location = "Lat 51.507351 / Long -0.127758"
): ReportDraftRecord {
  return {
    _id: "asset-resume-id",
    user: "user-asset-workflow",
    clientDraftId: "asset-resume-draft",
    type: "asset",
    storageMode: "r2_media",
    revision: 4,
    contractNo: "ASSET-RESTORE-1",
    formData: {
      location,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      currency: "GBP",
    },
    lots: [],
    media: [],
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}

describe("AssetForm manual save and submission workflow", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.deleteDraftByClientId.mockResolvedValue(undefined);
    mocks.deleteScopedDraft.mockResolvedValue(undefined);
    mocks.deleteSmartUploadDraft.mockResolvedValue(undefined);
    mocks.reverseGeocode.mockResolvedValue({
      location: RESOLVED_ASSET_LOCATION,
      currency: "GBP",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
      source: "nominatim",
    });
    mocks.restoreLots.mockResolvedValue([]);
    mocks.geolocation.mockImplementation(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => {
        success(position);
      }
    );
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.geolocation },
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalGeolocation) {
      Object.defineProperty(
        window.navigator,
        "geolocation",
        originalGeolocation
      );
    } else {
      Reflect.deleteProperty(window.navigator, "geolocation");
    }
  });

  it("defaults new Asset reports to no watermark and allows explicit opt-in", async () => {
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    const watermark = screen.getByRole("checkbox", { name: /Apply watermark/i });
    expect(watermark).not.toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).toBeChecked();
    fireEvent.click(watermark);
    expect(watermark).not.toBeChecked();
  });

  it.each([undefined, false, true])("restores watermark choice %s without opting missing draft values in", async (watermarkImages) => {
    const draft = makeAssetResumeDraft(RESOLVED_ASSET_LOCATION);
    draft.formData = { ...draft.formData, watermarkImages };
    const onDraftStatusChange = vi.fn();
    render(<AssetForm resumeDraft={draft} onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(onDraftStatusChange).toHaveBeenCalledWith("saved", "Draft and photos restored"));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Apply watermark/i })).toHaveProperty("checked", watermarkImages === true));
  });

  it("keeps form and media changes local until Save draft is selected", async () => {
    vi.useFakeTimers();
    render(<AssetForm />);

    fireEvent.change(screen.getByLabelText(/Client name/i), {
      target: { value: "Unsaved workflow client" },
    });
    addTestMedia();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
  });

  it("persists only after the explicit Save draft action", async () => {
    mocks.upsertWithMedia.mockImplementation(
      async (
        _input: unknown,
        _lots: unknown,
        onProgress?: DraftProgressCallback
      ) => {
        onProgress?.(100, "Draft and photos saved", {
          ...uploadingProgress,
          phase: "complete",
          percent: 100,
          message: "Draft and photos saved",
          uploadedFiles: 1,
          uploadedBytes: 11,
        });
        return { _id: "draft-server-1", media: [] };
      }
    );
    render(<AssetForm />);
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));

    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    expect(mocks.upsertWithMedia.mock.calls[0][0].formData.watermarkImages).toBe(false);
    const [, lots, , signal] = mocks.upsertWithMedia.mock.calls[0];
    expect(lots[0].files[0].name).toBe("asset-photo.jpg");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("locks immediately, ignores a rapid repeated save, and cancels the original save", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    render(<AssetForm />);
    fireEvent.change(screen.getByLabelText(/Client name/i), {
      target: { value: "Keep this client" },
    });
    addTestMedia();

    const saveButton = screen.getByRole("button", { name: /Save draft/i });
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(saveSignal).toBeInstanceOf(AbortSignal);
    expect(dialog).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("button", { name: "Cancel save" })
    ).toBeVisible();
    expect(within(dialog).getByText(/keep this page open/i)).toBeVisible();
    const hiddenWorkspace = document
      .getElementById("asset-clientName")
      ?.closest("[inert]");
    expect(hiddenWorkspace).not.toBeNull();
    expect(hiddenWorkspace).toHaveAttribute("inert");
    expect(hiddenWorkspace).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByRole("contentinfo", { name: "Form actions" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Client name/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create report" })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel save" })
    );

    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(
      document.getElementById("asset-clientName")?.closest("[inert]")
    ).toBeNull();
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Keep this client");
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
  });

  it("makes rapid Save draft then Submit one cancellable draft-save intent", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    const saveButton = screen.getByRole("button", { name: /Save draft/i });
    const submitButton = screen.getByRole("button", { name: "Create report" });
    act(() => {
      saveButton.click();
      submitButton.click();
    });

    const dialog = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(mocks.createAsset).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel save" }));
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.createAsset).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Uploading your report" })
    ).not.toBeInTheDocument();
  });

  it("opens the real more-actions menu and wires discard to confirmation", async () => {
    render(<AssetForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "More asset form actions" })
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Save as reusable input" })
    ).toBeVisible();
    expect(
      within(menu).getByRole("menuitem", {
        name: "Discard draft and clear form",
      })
    ).toBeVisible();

    fireEvent.click(
      within(menu).getByRole("menuitem", {
        name: "Discard draft and clear form",
      })
    );

    expect(
      await screen.findByRole("alertdialog", {
        name: "Discard this asset draft?",
      })
    ).toBeVisible();
  });

  it("stops a valid report upload without auto-saving or clearing the form", async () => {
    let submitSignal: AbortSignal | undefined;
    mocks.createAsset.mockImplementation(
      (
        _details: unknown,
        _images: File[],
        _videos: File[],
        options?: { signal?: AbortSignal }
      ) => {
        submitSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          submitSignal?.addEventListener(
            "abort",
            () => reject(submitSignal?.reason),
            { once: true }
          );
        });
      }
    );
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    expect(mocks.createAsset.mock.calls[0][0].watermark_images).toBe(false);
    expect(dialog).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(
      within(dialog).getByRole("button", { name: "Stop upload" })
    ).toBeVisible();
    expect(within(dialog).getByText(/keep this page open/i)).toBeVisible();
    const hiddenWorkspace = document
      .getElementById("asset-clientName")
      ?.closest("[inert]");
    expect(hiddenWorkspace).not.toBeNull();
    expect(hiddenWorkspace).toHaveAttribute("inert");
    expect(hiddenWorkspace).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByRole("contentinfo", { name: "Form actions" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create report" })
    ).not.toBeInTheDocument();
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Stop upload" })
    );

    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
    expect(
      document.getElementById("asset-clientName")?.closest("[inert]")
    ).toBeNull();
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Workflow Client");
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
  });

  it("recovers a changed submission manifest with a new upload identity", async () => {
    const retryUpload = deferred<Record<string, unknown>>();
    let retrySignal: AbortSignal | undefined;
    mocks.createAsset
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "SUBMISSION_MANIFEST_CHANGED" },
        },
      })
      .mockImplementationOnce(
        (
          _details: unknown,
          _images: File[],
          _videos: File[],
          options?: { signal?: AbortSignal }
        ) => {
          retrySignal = options?.signal;
          retrySignal?.addEventListener(
            "abort",
            () => retryUpload.reject(retrySignal?.reason),
            { once: true }
          );
          return retryUpload.promise;
        }
    );
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const recovery = await screen.findByRole("alertdialog", {
      name: "Start a new upload?",
    });
    expect(within(recovery).getByText(/photos changed/i)).toBeVisible();
    const firstDetails = mocks.createAsset.mock.calls[0][0];
    fireEvent.click(
      within(recovery).getByRole("button", { name: "Start new upload" })
    );

    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(2));
    const secondDetails = mocks.createAsset.mock.calls[1][0];
    expect(secondDetails.force_new).toBe(false);
    expect(secondDetails.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(secondDetails.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );
    expect(retrySignal).toBeInstanceOf(AbortSignal);

    const retryDialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    fireEvent.click(
      within(retryDialog).getByRole("button", { name: "Stop upload" })
    );
    await waitFor(() => expect(retrySignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText(/Client name/i)).toHaveValue("Workflow Client");
    expect(screen.getByTestId("selected-asset-media")).toHaveTextContent(
      "asset-photo.jpg"
    );
  });

  it("carries the rejected upload identity into an explicit force-new replacement", async () => {
    mocks.createAsset
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "ACTIVE_REPORT_EXISTS" },
        },
      })
      .mockResolvedValueOnce({ message: "Accepted" });
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const conflict = await screen.findByRole("dialog", {
      name: "Report already processing",
    });
    const firstDetails = mocks.createAsset.mock.calls[0][0];
    fireEvent.click(
      within(conflict).getByRole("button", {
        name: "Create Separate Report",
      })
    );

    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledTimes(2));
    const replacementDetails = mocks.createAsset.mock.calls[1][0];
    expect(replacementDetails.force_new).toBe(true);
    expect(replacementDetails.supersedes_client_submission_id).toBe(
      firstDetails.client_submission_id
    );
    expect(replacementDetails.client_submission_id).not.toBe(
      firstDetails.client_submission_id
    );
  });

  it("removes cancellation after acceptance while final cleanup is pending", async () => {
    const cleanup = deferred<void>();
    mocks.createAsset.mockResolvedValueOnce({ message: "Accepted" });
    mocks.deleteDraftByClientId.mockReturnValueOnce(cleanup.promise);
    render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    await waitFor(() =>
      expect(
        within(dialog).getAllByText("Report accepted · finalizing…")
      ).not.toHaveLength(0)
    );
    expect(
      within(dialog).queryByRole("button", { name: /stop upload/i })
    ).not.toBeInTheDocument();
    const acceptedSignal = mocks.createAsset.mock.calls[0][3].signal;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(acceptedSignal.aborted).toBe(false);

    cleanup.resolve();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
  });

  it("does not let a stale geolocation response overwrite a manual location", async () => {
    let resolveLocation: PositionCallback | undefined;
    mocks.geolocation.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    render(<AssetForm />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    const location = screen.getByLabelText(/Inspection location/i);
    fireEvent.change(location, { target: { value: "Manual warehouse bay" } });
    act(() => {
      resolveLocation?.(position);
    });

    expect(location).toHaveValue("Manual warehouse bay");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
    expect(mocks.reverseGeocode).not.toHaveBeenCalled();
  });

  it("aborts and ignores an in-flight reverse lookup after manual entry", async () => {
    const lookup = deferred<{
      location: string;
      attribution: string;
      attributionUrl: string;
    }>();
    mocks.reverseGeocode.mockReturnValueOnce(lookup.promise);
    render(<AssetForm />);

    await waitFor(() => expect(mocks.reverseGeocode).toHaveBeenCalledOnce());
    const lookupSignal = mocks.reverseGeocode.mock.calls[0][1].signal as AbortSignal;
    const location = screen.getByLabelText(/Inspection location/i);
    fireEvent.change(location, { target: { value: "Manual warehouse bay" } });

    expect(lookupSignal.aborted).toBe(true);
    await act(async () => {
      lookup.resolve({
        location: "Stale automatic location",
        attribution: "© OpenStreetMap contributors",
        attributionUrl: OPENSTREETMAP_COPYRIGHT_URL,
      });
      await lookup.promise;
    });

    expect(location).toHaveValue("Manual warehouse bay");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
    expect(
      screen.queryByRole("link", { name: "© OpenStreetMap contributors" })
    ).not.toBeInTheDocument();
  });

  it("preserves the prior location when re-detection is denied", async () => {
    let requestCount = 0;
    mocks.geolocation.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(position);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();
    fireEvent.change(location, { target: { value: "Existing inspection yard" } });

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));

    expect(location).toHaveValue("Existing inspection yard");
    expect(location).toHaveAccessibleDescription(
      "Browser location access was denied or is unavailable"
    );
  });

  it("keeps detected coordinates when a re-detection attempt is denied", async () => {
    let requestCount = 0;
    mocks.geolocation.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(position);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION);

    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("preserves the readable name, exact coordinates, and attribution when the provider fails", async () => {
    render(<AssetForm />);
    const location = await waitForResolvedAssetLocation();
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The location name could not be refreshed. Keeping the previous location. · © OpenStreetMap contributors"
      )
    );
    expect(location).toHaveValue(RESOLVED_ASSET_LOCATION);
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" })
    ).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);

    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("does not report draft-save success when a newer location revision remains unsaved", async () => {
    const serverSave = deferred<Record<string, unknown>>();
    let resolveLocation: PositionCallback | undefined;
    const onDraftStatusChange = vi.fn();
    mocks.geolocation.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    mocks.upsertWithMedia.mockReturnValueOnce(serverSave.promise);
    render(<AssetForm onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    act(() => {
      resolveLocation?.(position);
    });
    await waitFor(() =>
      expect(onDraftStatusChange).toHaveBeenCalledWith(
        "dirty",
        "Location updated · save again"
      )
    );
    serverSave.resolve({ _id: "saved-before-location", media: [] });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onDraftStatusChange).toHaveBeenCalledWith(
      "dirty",
      "Location updated · save again"
    );
    expect(
      onDraftStatusChange.mock.calls.some(([status]) => status === "saved")
    ).toBe(false);
  });

  it("keeps an immediately resolved legacy draft location marked dirty after hydration", async () => {
    const restoredLots = deferred<[]>();
    const onDraftStatusChange = vi.fn();
    mocks.restoreLots.mockReturnValueOnce(restoredLots.promise);

    render(
      <AssetForm
        resumeDraft={makeAssetResumeDraft()}
        onDraftStatusChange={onDraftStatusChange}
      />
    );
    await waitForResolvedAssetLocation();
    restoredLots.resolve([]);

    await waitFor(() => {
      const calls = onDraftStatusChange.mock.calls;
      expect(calls[calls.length - 1]).toEqual([
        "dirty",
        "Location updated · save again",
      ]);
    });
    expect(mocks.geolocation).not.toHaveBeenCalled();
  });

  it("marks a delayed legacy location migration dirty and saves the readable tuple as a new revision", async () => {
    const lookup = deferred<{
      location: string;
      currency: string;
      attribution: string;
      attributionUrl: string;
    }>();
    const onDraftStatusChange = vi.fn();
    mocks.reverseGeocode.mockReturnValueOnce(lookup.promise);
    mocks.upsertWithMedia.mockResolvedValueOnce({
      _id: "saved-migrated-location",
      media: [],
    });

    render(
      <AssetForm
        resumeDraft={makeAssetResumeDraft()}
        onDraftStatusChange={onDraftStatusChange}
      />
    );
    await waitFor(() =>
      expect(onDraftStatusChange).toHaveBeenCalledWith(
        "saved",
        "Draft and photos restored"
      )
    );

    await act(async () => {
      lookup.resolve({
        location: RESOLVED_ASSET_LOCATION,
        currency: "GBP",
        attribution: "© OpenStreetMap contributors",
        attributionUrl: OPENSTREETMAP_COPYRIGHT_URL,
      });
      await lookup.promise;
    });
    await waitForResolvedAssetLocation();
    await waitFor(() => {
      const calls = onDraftStatusChange.mock.calls;
      expect(calls).toContainEqual([
        "dirty",
        "Location updated · save again",
      ]);
      expect(calls[calls.length - 1]?.[0]).toBe("dirty");
    });

    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    const draftInput = mocks.upsertWithMedia.mock.calls[0][0];
    expect(draftInput.revision).toBeGreaterThan(4);
    expect(draftInput.formData).toMatchObject({
      location: RESOLVED_ASSET_LOCATION,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  });

  it("keeps a legacy coordinate-only draft blank when its name cannot be resolved", async () => {
    mocks.reverseGeocode.mockRejectedValueOnce(
      new Error("Reverse geocoding unavailable")
    );

    render(<AssetForm resumeDraft={makeAssetResumeDraft()} />);
    const location = screen.getByLabelText(/Inspection location/i);
    await waitFor(() =>
      expect(location).toHaveAccessibleDescription(
        "The browser coordinates could not be named. Re-detect or enter the location manually."
      )
    );
    expect(location).toHaveValue("");
    expect(location).not.toHaveAccessibleDescription(
      /Keeping the previous location/
    );
    expect(mocks.geolocation).not.toHaveBeenCalled();
  });

  it("aborts active draft saves and submissions when the form unmounts", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (
        _input: unknown,
        _lots: unknown,
        _onProgress?: DraftProgressCallback,
        signal?: AbortSignal
      ) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const draftView = render(<AssetForm />);
    fireEvent.click(screen.getByRole("button", { name: /Save draft/i }));
    await waitFor(() => expect(saveSignal).toBeInstanceOf(AbortSignal));
    draftView.unmount();
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));

    let submitSignal: AbortSignal | undefined;
    mocks.createAsset.mockImplementation(
      (
        _details: unknown,
        _images: File[],
        _videos: File[],
        options?: { signal?: AbortSignal }
      ) => {
        submitSignal = options?.signal;
        return new Promise((_resolve, reject) => {
          submitSignal?.addEventListener(
            "abort",
            () => reject(submitSignal?.reason),
            { once: true }
          );
        });
      }
    );
    const submissionView = render(<AssetForm />);
    await waitForResolvedAssetLocation();
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();
    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
  });

  it("requests exact fresh coordinates but displays a readable attributed location", async () => {
    render(<AssetForm />);

    await waitFor(() => expect(mocks.geolocation).toHaveBeenCalled());
    for (const call of mocks.geolocation.mock.calls) {
      expect(call[2]).toEqual({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      });
    }
    const location = await waitForResolvedAssetLocation();
    expect(location).toHaveAccessibleDescription(
      "Accurate to within approximately 7 m · © OpenStreetMap contributors"
    );
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
      { signal: expect.any(AbortSignal) }
    );
    const attribution = screen.getByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    expect(attribution).toHaveAttribute("href", OPENSTREETMAP_COPYRIGHT_URL);
    expect(attribution).toHaveAttribute("target", "_blank");
    expect(attribution).toHaveAttribute("rel", "noopener noreferrer");
  });
});
