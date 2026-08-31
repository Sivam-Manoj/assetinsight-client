import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    upsertWithMedia: mocks.upsertWithMedia,
    deleteByClientId: mocks.deleteDraftByClientId,
    restoreLots: vi.fn(),
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

describe("AssetForm manual save and submission workflow", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.deleteDraftByClientId.mockResolvedValue(undefined);
    mocks.deleteScopedDraft.mockResolvedValue(undefined);
    mocks.deleteSmartUploadDraft.mockResolvedValue(undefined);
    mocks.geolocation.mockImplementation(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => {
        success(position);
      }
    );
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.geolocation },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ currency: "GBP" }),
      })
    );
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
    fillRequiredReportFields();
    addTestMedia();

    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
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

  it("removes cancellation after acceptance while final cleanup is pending", async () => {
    const cleanup = deferred<void>();
    mocks.createAsset.mockResolvedValueOnce({ message: "Accepted" });
    mocks.deleteDraftByClientId.mockReturnValueOnce(cleanup.promise);
    render(<AssetForm />);
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
    const location = await screen.findByLabelText(/Inspection location/i);
    await waitFor(() =>
      expect(location).toHaveValue("Lat 51.507351 / Long -0.127758")
    );
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
    const location = await screen.findByLabelText(/Inspection location/i);
    await waitFor(() =>
      expect(location).toHaveValue("Lat 51.507351 / Long -0.127758")
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    expect(location).toHaveValue("Lat 51.507351 / Long -0.127758");

    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(mocks.createAsset).toHaveBeenCalledOnce());
    expect(mocks.createAsset.mock.calls[0][0]).toMatchObject({
      location: "Lat 51.507351 / Long -0.127758",
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
    fillRequiredReportFields();
    addTestMedia();
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();
    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
  });

  it("requests a fresh high-accuracy position and displays exact coordinates", async () => {
    render(<AssetForm />);

    await waitFor(() => expect(mocks.geolocation).toHaveBeenCalled());
    for (const call of mocks.geolocation.mock.calls) {
      expect(call[2]).toEqual({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      });
    }
    expect(screen.getByLabelText(/Inspection location/i)).toHaveValue(
      "Lat 51.507351 / Long -0.127758"
    );
    expect(
      screen.getByText("Accurate to within approximately 7 m")
    ).toBeVisible();
  });
});
