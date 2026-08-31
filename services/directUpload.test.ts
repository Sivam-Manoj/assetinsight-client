import { afterEach, describe, expect, it, vi } from "vitest";
import API from "@/lib/api";
import {
  putFileWithProgress,
  resetDirectUploadCircuitBreakerForTests,
  uploadFileToReportSession,
  uploadReportFilesDirectToR2,
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

class PendingDirectUploadRequest {
  static abortCount = 0;
  static sendCount = 0;
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  status = 0;
  responseText = "";
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;

  open() {}
  setRequestHeader() {}

  send() {
    PendingDirectUploadRequest.sendCount += 1;
  }

  abort() {
    PendingDirectUploadRequest.abortCount += 1;
    this.onabort?.();
  }
}

class UnexpectedAbortDirectUploadRequest {
  static instance: UnexpectedAbortDirectUploadRequest | null = null;
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  status = 0;
  responseText = "";
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;

  constructor() {
    UnexpectedAbortDirectUploadRequest.instance = this;
  }

  open() {}
  setRequestHeader() {}
  send() {}

  interrupt() {
    this.onabort?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  globalThis.XMLHttpRequest = originalXmlHttpRequest;
  FailingDirectUploadRequest.sendCount = 0;
  SuccessfulDirectUploadRequest.headers.clear();
  PendingDirectUploadRequest.abortCount = 0;
  PendingDirectUploadRequest.sendCount = 0;
  UnexpectedAbortDirectUploadRequest.instance = null;
  resetDirectUploadCircuitBreakerForTests();
});

describe("report-session upload transport", () => {
  it("includes file lastModified in the upload-session manifest", async () => {
    const apiPost = vi.spyOn(API, "post").mockResolvedValueOnce({
      data: {
        data: {
          sessionId: "session-manifest",
          jobId: "job-manifest",
          reportId: "report-manifest",
          alreadyQueued: true,
          files: [],
        },
      },
    });
    const file = new File(["jpeg-content"], "photo.jpg", {
      type: "image/jpeg",
      lastModified: 1_725_000_123_456,
    });

    await uploadReportFilesDirectToR2({
      endpoint: "/asset",
      details: { client_submission_id: "submission-manifest" },
      files: [{ file, fieldname: "images", imageIndex: 0 }],
    });

    expect(apiPost).toHaveBeenCalledWith(
      "/asset/upload-session",
      expect.objectContaining({
        files: [
          expect.objectContaining({
            name: "photo.jpg",
            size: file.size,
            lastModified: 1_725_000_123_456,
          }),
        ],
      })
    );
  });

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

  it("aborts an active browser PUT with the signal reason", async () => {
    globalThis.XMLHttpRequest =
      PendingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const controller = new AbortController();
    const file = new File(["jpeg-content"], "photo.jpg", {
      type: "image/jpeg",
    });

    const upload = putFileWithProgress(
      "https://uploads.example.test/photo",
      file,
      "image/jpeg",
      undefined,
      undefined,
      controller.signal
    );
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(PendingDirectUploadRequest.sendCount).toBe(1);
    expect(PendingDirectUploadRequest.abortCount).toBe(1);
  });

  it("treats an unexpected xhr abort as an interrupted upload, not a user cancellation", async () => {
    globalThis.XMLHttpRequest =
      UnexpectedAbortDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const controller = new AbortController();
    const file = new File(["jpeg-content"], "photo.jpg", {
      type: "image/jpeg",
    });

    const upload = putFileWithProgress(
      "https://uploads.example.test/photo",
      file,
      "image/jpeg",
      undefined,
      undefined,
      controller.signal
    );
    UnexpectedAbortDirectUploadRequest.instance?.interrupt();

    await expect(upload).rejects.toThrow(
      "R2 upload was interrupted for photo.jpg"
    );
    await expect(upload).rejects.not.toMatchObject({ name: "AbortError" });
    expect(controller.signal.aborted).toBe(false);
  });

  it("does not verify, fall back, or complete a session after abort", async () => {
    globalThis.XMLHttpRequest =
      PendingDirectUploadRequest as unknown as typeof XMLHttpRequest;
    const controller = new AbortController();
    const file = new File(["jpeg-content"], "photo.jpg", {
      type: "image/jpeg",
    });
    const apiPost = vi.spyOn(API, "post").mockResolvedValueOnce({
      data: {
        data: {
          sessionId: "session-abort",
          jobId: "job-abort",
          files: [
            {
              fileId: "images-0",
              uploadUrl: "https://uploads.example.test/photo",
              method: "PUT",
              contentType: "image/jpeg",
            },
          ],
        },
      },
    });

    const upload = uploadReportFilesDirectToR2({
      endpoint: "/asset",
      details: { client_submission_id: "submission-abort" },
      files: [{ file, fieldname: "images", imageIndex: 0 }],
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(PendingDirectUploadRequest.sendCount).toBe(1);
    });
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(apiPost.mock.calls.map(([url]) => url)).toEqual([
      "/asset/upload-session",
    ]);
    expect(PendingDirectUploadRequest.abortCount).toBe(1);
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
