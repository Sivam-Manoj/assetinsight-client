import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosProgressEvent } from "axios";
import API from "@/lib/api";
import { SALVAGE_MAX_IMAGES, SalvageService, type SalvageDetails } from "./salvage";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const details: SalvageDetails = {
  report_date: "2026-09-06", file_number: "SALVAGE-001", date_received: "2026-09-06",
  claim_number: "CLAIM-001", policy_number: "POLICY-001", appraiser_name: "Test Appraiser",
  appraiser_phone: "1234567890", appraiser_email: "appraiser@example.test", adjuster_name: "Adjuster",
  insured_name: "Insured", company_name: "Company", company_address: "Test address",
  appraiser_comments: "Test notes", next_report_due: "2026-09-07", language: "en", currency: "CAD",
};
const photos = (count: number) => Array.from({ length: count }, (_, index) =>
  new File([`photo-${index}`], `photo-${index}.jpg`, { type: "image/jpeg" }));

describe("SalvageService upload contract", () => {
  beforeEach(() => {
    vi.mocked(API.post).mockReset();
    vi.mocked(API.post).mockResolvedValue({ data: { jobId: "job-1", phase: "processing", message: "Accepted" } });
  });

  it.each([0, 1, 10, 11, SALVAGE_MAX_IMAGES])("sends every selected image in order for %i photos", async (count) => {
    const images = photos(count);
    await expect(SalvageService.create(details, images)).resolves.toMatchObject({ jobId: "job-1", phase: "processing" });
    const [url, body] = vi.mocked(API.post).mock.calls[0];
    expect(url).toBe("/salvage");
    const formData = body as FormData;
    expect(JSON.parse(String(formData.get("details")))).toEqual(details);
    expect(formData.getAll("images").map((file) => (file as File).name)).toEqual(images.map((file) => file.name));
    expect(formData.getAll("images")).toHaveLength(count);
  });

  it("rejects over-limit submissions before posting instead of silently dropping images", async () => {
    await expect(SalvageService.create(details, photos(31))).rejects.toThrow("up to 30 images");
    expect(API.post).not.toHaveBeenCalled();
  });

  it("normalizes browser upload progress and leaves processing to the server", async () => {
    const onUploadProgress = vi.fn();
    await SalvageService.create(details, photos(1), { onUploadProgress });
    const listener = vi.mocked(API.post).mock.calls[0][2]?.onUploadProgress;
    listener?.({ loaded: 1, total: 4 } as AxiosProgressEvent);
    listener?.({ progress: 1.5 } as AxiosProgressEvent);
    listener?.({ progress: Number.NaN } as AxiosProgressEvent);
    expect(onUploadProgress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 1, 0]);
  });
});
