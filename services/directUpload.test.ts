import { afterEach, describe, expect, it, vi } from "vitest";
import API from "@/lib/api";
import { uploadFileToReportSession } from "./directUpload";

const originalXmlHttpRequest = globalThis.XMLHttpRequest;

class FailingDirectUploadRequest {
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  status = 0;
  responseText = "";
  onload?: () => void;
  onerror?: () => void;

  open() {}
  setRequestHeader() {}

  send() {
    this.onerror?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  globalThis.XMLHttpRequest = originalXmlHttpRequest;
});

describe("report-session upload transport", () => {
  it("accepts an R2 upload that completed behind an opaque CORS error", async () => {
    vi.useFakeTimers();
    globalThis.XMLHttpRequest =
      FailingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const apiPost = vi.spyOn(API, "post").mockResolvedValue({
      data: { data: { verified: true } },
    });
    const file = new File(["jpeg-content"], "IMG_8600.JPG", {
      type: "image/jpeg",
    });

    const upload = uploadFileToReportSession({
      endpoint: "/asset",
      sessionId: "session-1",
      fileId: "images-0",
      uploadUrl: "https://r2.example.test/presigned",
      file,
      contentType: "image/jpeg",
    });
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ transport: "direct-verified" });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(
      "/asset/upload-session/session-1/files/images-0/verify",
      {}
    );
  });

  it("uses the authenticated session fallback when a browser R2 PUT fails", async () => {
    vi.useFakeTimers();
    globalThis.XMLHttpRequest =
      FailingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const apiPost = vi
      .spyOn(API, "post")
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({ data: {} });
    const file = new File(["png-content"], "Screenshot 2026-03-03 212214.png", {
      type: "image/png",
    });

    const upload = uploadFileToReportSession({
      endpoint: "/asset",
      sessionId: "session-1",
      fileId: "images-0",
      uploadUrl: "https://r2.example.test/presigned",
      file,
      contentType: "image/png",
    });
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ transport: "server" });
    expect(apiPost).toHaveBeenCalledTimes(2);
    const [url, body, config] = apiPost.mock.calls[1];
    expect(url).toBe("/asset/upload-session/session-1/files/images-0");
    expect(body).toBeInstanceOf(FormData);
    expect(config).toMatchObject({ timeout: 300000 });
    expect(config).not.toHaveProperty("headers.Content-Type");
  });

  it("retries a transient server fallback network failure", async () => {
    vi.useFakeTimers();
    globalThis.XMLHttpRequest =
      FailingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const apiPost = vi
      .spyOn(API, "post")
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({ data: {} });
    const file = new File(["jpeg-content"], "IMG_8600.JPG", {
      type: "image/jpeg",
    });

    const upload = uploadFileToReportSession({
      endpoint: "/asset",
      sessionId: "session-1",
      fileId: "images-0",
      uploadUrl: "https://r2.example.test/presigned",
      file,
      contentType: "image/jpeg",
    });
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ transport: "server" });
    expect(apiPost).toHaveBeenCalledTimes(3);
  });
});
