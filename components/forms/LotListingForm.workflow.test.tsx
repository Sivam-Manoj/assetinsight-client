import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LotListingForm from "./LotListingForm";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  deleteByClientId: vi.fn(),
  deleteScopedDraft: vi.fn(),
  deleteSmartUploadDraft: vi.fn(),
  getCurrentPosition: vi.fn(),
  hasScopedDraft: vi.fn(),
  loadScopedDraft: vi.fn(),
  push: vi.fn(),
  requestDurableDraftStorage: vi.fn(),
  restoreLots: vi.fn(),
  upsertWithMedia: vi.fn(),
  uploadReportFilesDirectToR2: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  let dynamicComponentIndex = 0;

  return {
    default: () => {
      dynamicComponentIndex += 1;
      if (dynamicComponentIndex === 1) {
        return function MockMixedSection({
          value,
          onChange,
        }: {
          value: Array<{ files: File[] }>;
          onChange: (lots: Array<Record<string, unknown>>) => void;
        }) {
          return React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "output",
              { "data-testid": "test-lot-count" },
              String(value.length)
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () =>
                  onChange([
                    {
                      id: "test-lot-1",
                      files: [
                        new File(["photo"], "lot-photo.jpg", {
                          type: "image/jpeg",
                          lastModified: 123,
                        }),
                      ],
                      extraFiles: [],
                      videoFiles: [],
                      coverIndex: 0,
                      mode: "single_lot",
                    },
                  ]),
              },
              "Add test media"
            )
          );
        };
      }

      return function MockSmartUploadWorkspace() {
        return null;
      };
    },
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: { _id: "user-1", username: "Test Appraiser" },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  default: { post: mocks.apiPost },
}));

vi.mock("@/services/directUpload", () => ({
  uploadReportFilesDirectToR2: mocks.uploadReportFilesDirectToR2,
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    deleteByClientId: mocks.deleteByClientId,
    restoreLots: mocks.restoreLots,
    upsertWithMedia: mocks.upsertWithMedia,
  },
  createReportDraftClientId: () => "lot-listing-draft-1",
  getDuplicateLotWarning: () => null,
  getReportDraftDeviceId: () => "device-1",
}));

vi.mock("./drafts/storage", () => {
  class DraftEnvelopeError extends Error {
    code = "corrupt";
  }
  class DraftPersistenceError extends Error {}

  return {
    DraftEnvelopeError,
    DraftPersistenceError,
    FORM_DRAFT_VERSION: 3,
    deleteScopedDraft: mocks.deleteScopedDraft,
    getScopedDraftKey: () => "lot-listing-draft-key",
    hasScopedDraft: mocks.hasScopedDraft,
    loadScopedDraft: mocks.loadScopedDraft,
    parseScopedDraftEnvelope: vi.fn(),
    requestDurableDraftStorage: mocks.requestDurableDraftStorage,
    saveScopedDraft: vi.fn(),
  };
});

vi.mock("./smartUpload/storage", () => ({
  deleteSmartUploadDraft: mocks.deleteSmartUploadDraft,
}));

const detectedPosition = {
  coords: {
    latitude: 50.1234567,
    longitude: -104.7654321,
    accuracy: 7.4,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: 1,
  toJSON: () => ({}),
} as GeolocationPosition;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function addValidListing() {
  fireEvent.change(
    screen.getByRole("textbox", { name: /contract number/i }),
    { target: { value: "LOT-TEST-1" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Add test media" }));
}

describe("LotListingForm explicit save and upload workflow", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.apiPost.mockReset();
    mocks.deleteByClientId.mockReset().mockResolvedValue(undefined);
    mocks.deleteScopedDraft.mockReset().mockResolvedValue(undefined);
    mocks.deleteSmartUploadDraft.mockReset().mockResolvedValue(undefined);
    mocks.getCurrentPosition.mockReset().mockImplementation((success) => {
      success(detectedPosition);
    });
    mocks.hasScopedDraft.mockReset().mockResolvedValue(false);
    mocks.loadScopedDraft.mockReset().mockResolvedValue(null);
    mocks.push.mockReset();
    mocks.requestDurableDraftStorage.mockReset().mockResolvedValue(undefined);
    mocks.restoreLots.mockReset().mockResolvedValue([]);
    mocks.upsertWithMedia.mockReset();
    mocks.uploadReportFilesDirectToR2.mockReset();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: mocks.getCurrentPosition },
    });
    window.localStorage.clear();
  });

  it("keeps form and media changes local until Save Draft is explicitly selected", async () => {
    vi.useFakeTimers();
    mocks.upsertWithMedia.mockImplementation(
      async (_input, _lots, onProgress) => {
        onProgress?.(100, "Draft and photos saved", {
          phase: "complete",
          percent: 100,
          message: "Draft and photos saved",
          totalFiles: 1,
          uploadedFiles: 1,
          totalBytes: 5,
          uploadedBytes: 5,
        });
        return { _id: "draft-1", media: [] };
      }
    );

    render(<LotListingForm />);
    addValidListing();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
  });

  it("locks immediately, ignores a rapid repeated save, and cancels the original save", async () => {
    const pendingSave = deferred<Record<string, unknown>>();
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (_input, _lots, _onProgress, signal: AbortSignal) => {
        saveSignal = signal;
        signal.addEventListener(
          "abort",
          () => pendingSave.reject(new DOMException("Cancelled", "AbortError")),
          { once: true }
        );
        return pendingSave.promise;
      }
    );

    const { container } = render(<LotListingForm />);
    addValidListing();
    const contractInput = screen.getByRole("textbox", {
      name: /contract number/i,
    });
    const saveButton = screen.getAllByRole("button", { name: "Save Draft" })[0];
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    const saveScreen = await screen.findByRole("dialog", {
      name: "Saving your draft",
    });
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(saveSignal).toBeInstanceOf(AbortSignal);
    expect(saveScreen).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(saveScreen).toHaveAttribute("aria-modal", "true");
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    const hiddenFormContent = container.querySelector(
      '[aria-hidden="true"][inert]'
    );
    expect(hiddenFormContent).toBeInTheDocument();
    expect(hiddenFormContent).toContainElement(contractInput);
    expect(screen.queryByRole("textbox", { name: /contract number/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Draft save progress" })
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel save" }));

    await waitFor(() => expect(saveSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
    expect(screen.getByText("Draft save cancelled")).toBeInTheDocument();
  });

  it("opens the real more-actions menu and wires clear to confirmation", async () => {
    render(<LotListingForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "More form actions" })
    );

    const menu = await screen.findByRole("menu");
    const clearItem = within(menu).getByRole("menuitem", {
      name: "Clear form",
    });
    expect(clearItem).toBeVisible();
    fireEvent.click(clearItem);

    expect(
      await screen.findByRole("alertdialog", {
        name: "Clear this lot listing?",
      })
    ).toBeVisible();
  });

  it("shows Stop upload, aborts the submission, and never auto-saves it", async () => {
    const pendingUpload = deferred<Record<string, unknown>>();
    mocks.uploadReportFilesDirectToR2.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        signal.addEventListener(
          "abort",
          () =>
            pendingUpload.reject(new DOMException("Stopped", "AbortError")),
          { once: true }
        );
        return pendingUpload.promise;
      }
    );

    const { container } = render(<LotListingForm />);
    addValidListing();
    const contractInput = screen.getByRole("textbox", {
      name: /contract number/i,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const uploadScreen = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    expect(uploadScreen).toHaveClass("fixed", "inset-0", "z-[1500]");
    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    const hiddenFormContent = container.querySelector(
      '[aria-hidden="true"][inert]'
    );
    expect(hiddenFormContent).toBeInTheDocument();
    expect(hiddenFormContent).toContainElement(contractInput);
    expect(screen.queryByRole("textbox", { name: /contract number/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "Upload progress" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Report upload progress" })
    ).toHaveAttribute("aria-valuenow", "0");

    const uploadArguments = mocks.uploadReportFilesDirectToR2.mock.calls[0][0];
    expect(uploadArguments).toMatchObject({
      endpoint: "/lot-listing",
      details: {
        contract_no: "LOT-TEST-1",
        location: "Lat 50.123457 / Long -104.765432",
        latitude: 50.1234567,
        longitude: -104.7654321,
      },
    });
    expect(uploadArguments.signal).toBeInstanceOf(AbortSignal);

    fireEvent.click(screen.getByRole("button", { name: "Stop upload" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );

    expect(uploadArguments.signal.aborted).toBe(true);
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
    expect(screen.getByText(/upload stopped/i)).toBeInTheDocument();
  });

  it("recovers a changed submission manifest with a new upload identity", async () => {
    const retryUpload = deferred<Record<string, unknown>>();
    let retrySignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "SUBMISSION_MANIFEST_CHANGED" },
        },
      })
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        retrySignal = signal;
        signal.addEventListener(
          "abort",
          () => retryUpload.reject(signal.reason),
          { once: true }
        );
        return retryUpload.promise;
      });
    render(<LotListingForm />);
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const recovery = await screen.findByRole("alertdialog", {
      name: "Start a new upload?",
    });
    expect(within(recovery).getByText(/photos changed/i)).toBeVisible();
    const firstDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details;
    fireEvent.click(
      within(recovery).getByRole("button", { name: "Start new upload" })
    );

    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledTimes(2)
    );
    const secondDetails =
      mocks.uploadReportFilesDirectToR2.mock.calls[1][0].details;
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
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
  });

  it("removes cancellation after acceptance while final cleanup is pending", async () => {
    const cleanup = deferred<void>();
    mocks.uploadReportFilesDirectToR2.mockResolvedValueOnce({
      message: "Accepted",
    });
    mocks.deleteByClientId.mockReturnValueOnce(cleanup.promise);
    render(<LotListingForm />);
    addValidListing();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

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
    const acceptedSignal =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].signal;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(acceptedSignal.aborted).toBe(false);

    cleanup.resolve();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
  });

  it("cancels the legacy multipart fallback after upload-session incompatibility", async () => {
    let fallbackSignal: AbortSignal | undefined;
    const pendingFallback = deferred<Record<string, unknown>>();
    mocks.uploadReportFilesDirectToR2.mockRejectedValueOnce({
      response: { status: 404 },
    });
    mocks.apiPost.mockImplementation(
      (
        url: string,
        _body: unknown,
        config?: { signal?: AbortSignal }
      ) => {
        if (url !== "/lot-listing") {
          return Promise.reject(new Error(`Unexpected API call: ${url}`));
        }
        fallbackSignal = config?.signal;
        fallbackSignal?.addEventListener(
          "abort",
          () =>
            pendingFallback.reject(new DOMException("Stopped", "AbortError")),
          { once: true }
        );
        return pendingFallback.promise;
      }
    );

    render(<LotListingForm />);
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );

    const uploadScreen = await screen.findByRole("dialog", {
      name: "Uploading your report",
    });
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce());
    const directSignal =
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].signal;
    expect(fallbackSignal).toBe(directSignal);
    expect(fallbackSignal).toBeInstanceOf(AbortSignal);

    fireEvent.click(
      within(uploadScreen).getByRole("button", { name: "Stop upload" })
    );

    await waitFor(() => expect(fallbackSignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Uploading your report" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.upsertWithMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: /contract number/i })
    ).toHaveValue("LOT-TEST-1");
    expect(screen.getByTestId("test-lot-count")).toHaveTextContent("1");
  });

  it("does not let a stale geolocation response overwrite a manual location", async () => {
    let resolveLocation: PositionCallback | undefined;
    mocks.getCurrentPosition.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    render(<LotListingForm />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    const location = screen.getByRole("textbox", {
      name: /current inspection location/i,
    });
    fireEvent.change(location, { target: { value: "Manual auction yard" } });
    act(() => {
      resolveLocation?.(detectedPosition);
    });

    expect(location).toHaveValue("Manual auction yard");
    expect(location).toHaveAccessibleDescription(
      "Manually entered inspection location"
    );
  });

  it("preserves the prior location when re-detection is denied", async () => {
    let requestCount = 0;
    mocks.getCurrentPosition.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(detectedPosition);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<LotListingForm />);
    const location = await screen.findByRole("textbox", {
      name: /current inspection location/i,
    });
    await waitFor(() =>
      expect(location).toHaveValue("Lat 50.123457 / Long -104.765432")
    );
    fireEvent.change(location, { target: { value: "Existing auction yard" } });

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));

    expect(location).toHaveValue("Existing auction yard");
    expect(location).toHaveAccessibleDescription(
      "Browser location access denied or unavailable"
    );
  });

  it("keeps detected coordinates when a re-detection attempt is denied", async () => {
    let requestCount = 0;
    mocks.getCurrentPosition.mockImplementation(
      (
        success: PositionCallback,
        error?: PositionErrorCallback
      ) => {
        requestCount += 1;
        if (requestCount === 1) success(detectedPosition);
        else error?.({} as GeolocationPositionError);
      }
    );
    render(<LotListingForm />);
    const location = await screen.findByRole("textbox", {
      name: /current inspection location/i,
    });
    await waitFor(() =>
      expect(location).toHaveValue("Lat 50.123457 / Long -104.765432")
    );

    fireEvent.click(screen.getByRole("button", { name: "Re-detect" }));
    expect(location).toHaveValue("Lat 50.123457 / Long -104.765432");

    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() =>
      expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce()
    );
    expect(
      mocks.uploadReportFilesDirectToR2.mock.calls[0][0].details
    ).toMatchObject({
      location: "Lat 50.123457 / Long -104.765432",
      latitude: detectedPosition.coords.latitude,
      longitude: detectedPosition.coords.longitude,
    });
  });

  it("does not report draft-save success when a newer location revision remains unsaved", async () => {
    const serverSave = deferred<Record<string, unknown>>();
    let resolveLocation: PositionCallback | undefined;
    const onDraftStatusChange = vi.fn();
    mocks.getCurrentPosition.mockImplementation((success: PositionCallback) => {
      resolveLocation = success;
    });
    mocks.upsertWithMedia
      .mockResolvedValue({ _id: "unexpected-second-save", media: [] })
      .mockReturnValueOnce(serverSave.promise);
    render(<LotListingForm onDraftStatusChange={onDraftStatusChange} />);
    await waitFor(() => expect(resolveLocation).toBeTypeOf("function"));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    await waitFor(() => expect(mocks.upsertWithMedia).toHaveBeenCalledOnce());
    act(() => {
      resolveLocation?.(detectedPosition);
    });
    serverSave.resolve({ _id: "saved-before-location", media: [] });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Saving your draft" })
      ).not.toBeInTheDocument()
    );
    expect(mocks.upsertWithMedia).toHaveBeenCalledOnce();
    expect(
      onDraftStatusChange.mock.calls.some(([status]) => status === "saved")
    ).toBe(false);
  });

  it("aborts active draft saves and submissions when the form unmounts", async () => {
    let saveSignal: AbortSignal | undefined;
    mocks.upsertWithMedia.mockImplementation(
      (_input, _lots, _onProgress, signal: AbortSignal) => {
        saveSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const draftView = render(<LotListingForm />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save Draft" })[0]
    );
    await waitFor(() => expect(saveSignal).toBeInstanceOf(AbortSignal));
    draftView.unmount();
    await waitFor(() => expect(saveSignal?.aborted).toBe(true));

    let submitSignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        submitSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const submissionView = render(<LotListingForm />);
    addValidListing();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Lot Listing" })
    );
    await waitFor(() => expect(submitSignal).toBeInstanceOf(AbortSignal));
    submissionView.unmount();
    await waitFor(() => expect(submitSignal?.aborted).toBe(true));
  });

  it("displays exact fresh browser coordinates and their accuracy", async () => {
    render(<LotListingForm />);

    const location = await screen.findByRole("textbox", {
      name: /current inspection location/i,
    });
    expect(location).toHaveValue("Lat 50.123457 / Long -104.765432");
    expect(location).toHaveAccessibleDescription(
      "Accurate to within approximately 7 m"
    );
    expect(mocks.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      }
    );
  });
});
