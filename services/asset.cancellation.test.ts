import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  uploadReportFilesDirectToR2: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { post: mocks.apiPost },
}));

vi.mock("./directUpload", () => ({
  uploadReportFilesDirectToR2: mocks.uploadReportFilesDirectToR2,
}));

import { AssetService } from "./asset";

describe("AssetService upload cancellation", () => {
  beforeEach(() => {
    mocks.apiPost.mockReset();
    mocks.uploadReportFilesDirectToR2.mockReset();
  });

  it("cancels the legacy multipart fallback after upload-session incompatibility", async () => {
    const controller = new AbortController();
    let fallbackSignal: AbortSignal | undefined;
    mocks.uploadReportFilesDirectToR2.mockRejectedValueOnce({
      response: { status: 404 },
    });
    mocks.apiPost.mockImplementation(
      (
        url: string,
        _body: FormData,
        config?: { signal?: AbortSignal }
      ) => {
        expect(url).toBe("/asset");
        fallbackSignal = config?.signal;
        return new Promise((_resolve, reject) => {
          const rejectAsAborted = () =>
            reject(
              fallbackSignal?.reason ||
                new DOMException("The operation was aborted", "AbortError")
            );
          if (fallbackSignal?.aborted) rejectAsAborted();
          else {
            fallbackSignal?.addEventListener("abort", rejectAsAborted, {
              once: true,
            });
          }
        });
      }
    );

    const creating = AssetService.create(
      {
        grouping_mode: "mixed",
        client_submission_id: "asset-fallback-cancel",
      } as Parameters<typeof AssetService.create>[0],
      [new File(["photo"], "asset-photo.jpg", { type: "image/jpeg" })],
      [],
      { signal: controller.signal }
    );

    await vi.waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce());
    expect(fallbackSignal).toBe(controller.signal);

    controller.abort();

    await expect(creating).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.uploadReportFilesDirectToR2).toHaveBeenCalledOnce();
    expect(mocks.apiPost).toHaveBeenCalledOnce();
  });
});
