import { afterEach, describe, expect, it, vi } from "vitest";
import API from "@/lib/api";
import {
  putFileWithProgress,
  resetDirectUploadCircuitBreakerForTests,
  uploadFileToReportSession,
} from "./directUpload";

const originalXmlHttpRequest = globalThis.XMLHttpRequest;

class FailingDirectUploadRequest {
  static sendCount = 0;
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  status = 0;
  responseText = "";
  onload?: () => void;
  onerror?: () => void;

  open() {}
  setRequestHeader() {}

  send() {
    FailingDirectUploadRequest.sendCount += 1;
    this.onerror?.();
  }
}

class SuccessfulDirectUploadRequest {
  static headers = new Map<string, string>();
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  status = 200;
  responseText = "";
  onload?: () => void;

  open() {}

  setRequestHeader(name: string, value: string) {
    SuccessfulDirectUploadRequest.headers.set(name, value);
  }

  send() {
    this.onload?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  globalThis.XMLHttpRequest = originalXmlHttpRequest;
  FailingDirectUploadRequest.sendCount = 0;
  SuccessfulDirectUploadRequest.headers.clear();
  resetDirectUploadCircuitBreakerForTests();
});

describe("report-session upload transport", () => {
  it("forwards every signed upload header verbatim", async () => {
    globalThis.XMLHttpRequest =
      SuccessfulDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const file = new File(["png-content"], "failure.png", {
      type: "image/png",
    });

    await putFileWithProgress(
      "https://r2.example.test/presigned",
      file,
      "image/png",
      undefined,
      {
        "Content-Type": "image/png",
        "If-None-Match": "*",
        "X-Signed-Metadata": "support-attachment",
      }
    );

    expect(Object.fromEntries(SuccessfulDirectUploadRequest.headers)).toEqual({
      "Content-Type": "image/png",
      "If-None-Match": "*",
      "X-Signed-Metadata": "support-attachment",
    });
  });

  it("never sends a browser PUT to the standard R2 endpoint", async () => {
    globalThis.XMLHttpRequest =
      FailingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const apiPost = vi.spyOn(API, "post").mockResolvedValue({ data: {} });
    const file = new File(["jpeg-content"], "photo.jpg", {
      type: "image/jpeg",
    });

    await expect(
      uploadFileToReportSession({
        endpoint: "/asset",
        sessionId: "session-r2-cors",
        fileId: "images-0",
        uploadUrl:
          "https://example.r2.cloudflarestorage.com/bucket/presigned",
        file,
        contentType: "image/jpeg",
      })
    ).resolves.toEqual({ transport: "server" });

    expect(FailingDirectUploadRequest.sendCount).toBe(0);
    expect(apiPost).toHaveBeenCalledWith(
      "/asset/upload-session/session-r2-cors/files/images-0",
      expect.any(FormData),
      expect.objectContaining({ timeout: 300000 })
    );
  });

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

  it("bypasses repeated direct retries after a storage host fails", async () => {
    vi.useFakeTimers();
    globalThis.XMLHttpRequest =
      FailingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const apiPost = vi
      .spyOn(API, "post")
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValue({ data: {} });
    const firstFile = new File(["first"], "first.jpg", {
      type: "image/jpeg",
    });
    const secondFile = new File(["second"], "second.jpg", {
      type: "image/jpeg",
    });

    const firstUpload = uploadFileToReportSession({
      endpoint: "/asset",
      sessionId: "session-circuit",
      fileId: "images-0",
      uploadUrl: "https://r2-cors-missing.example.test/first",
      file: firstFile,
      contentType: "image/jpeg",
    });
    await vi.runAllTimersAsync();
    await expect(firstUpload).resolves.toEqual({ transport: "server" });
    expect(FailingDirectUploadRequest.sendCount).toBe(3);

    await expect(
      uploadFileToReportSession({
        endpoint: "/asset",
        sessionId: "session-circuit",
        fileId: "images-1",
        uploadUrl: "https://r2-cors-missing.example.test/second",
        file: secondFile,
        contentType: "image/jpeg",
      })
    ).resolves.toEqual({ transport: "server" });

    expect(FailingDirectUploadRequest.sendCount).toBe(3);
    expect(apiPost).toHaveBeenLastCalledWith(
      "/asset/upload-session/session-circuit/files/images-1",
      expect.any(FormData),
      expect.objectContaining({ timeout: 300000 })
    );
  });
});
