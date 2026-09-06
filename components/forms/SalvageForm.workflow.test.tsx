import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalvageService, type CreateOptions, type SalvageCreateResponse } from "@/services/salvage";
import SalvageForm from "./SalvageForm";

const mocks = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: {
  username: "Test Appraiser", email: "test@example.test", contactPhone: "1234567890",
  companyName: "Company", companyAddress: "Test address",
} }) }));
vi.mock("@/services/salvage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/salvage")>();
  return { ...original, SalvageService: { create: vi.fn() } };
});
vi.mock("@/components/ui/toast", () => ({ toast: mocks }));
vi.mock("./salvage/SalvageCamera", () => ({ default: () => null }));
vi.mock("./salvage/ImageAnnotatorModal", () => ({ default: () => null }));

function fillForm() {
  for (const [label, value] of [
    ["File Number", "FILE-001"], ["Claim Number", "CLAIM-001"],
    ["Policy Number", "POLICY-001"], ["Adjuster Name", "Adjuster"],
    ["Insured Name", "Insured"], ["Appraiser Comments", "Important damage notes"],
  ]) {
    const field = screen.getByText(label, { selector: "label" }).parentElement?.querySelector("input, textarea");
    expect(field).toBeTruthy();
    fireEvent.change(field!, { target: { value } });
  }
}

function addPhotos(count: number) {
  const files = Array.from({ length: count }, (_, index) => new File([`photo${index}`], `photo${index}.jpg`, { type: "image/jpeg" }));
  fireEvent.change(screen.getByLabelText("Salvage images"), { target: { files } });
  return files;
}

describe("Salvage form upload/acceptance workflow", () => {
  beforeEach(() => {
    vi.mocked(SalvageService.create).mockReset();
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it("keeps all 30 selected photos, locks same-tick duplicate submits and shows upload then accepted state", async () => {
    let resolve!: (value: SalvageCreateResponse) => void;
    let options: CreateOptions | undefined;
    vi.mocked(SalvageService.create).mockImplementation((_details, _images, createOptions) => {
      options = createOptions;
      return new Promise((res) => { resolve = res; });
    });
    const onSubmittingChange = vi.fn();
    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    render(<SalvageForm onSuccess={onSuccess} onCancel={onCancel} onSubmittingChange={onSubmittingChange} />);
    fillForm();
    const files = addPhotos(30);
    expect(screen.getByText("Selected: 30/30 photos")).toBeVisible();
    expect(screen.getByRole("button", { name: "Select Images" })).toBeDisabled();
    const form = screen.getByRole("button", { name: "Create Report" }).closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(SalvageService.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(SalvageService.create).mock.calls[0][1]).toEqual(files);
    expect(onSubmittingChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Salvage images")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Uploading salvage report");
    const leavingDuringUpload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leavingDuringUpload);
    expect(leavingDuringUpload.defaultPrevented).toBe(true);
    act(() => options?.onUploadProgress?.(0.5));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
    act(() => options?.onUploadProgress?.(1));
    expect(screen.getByRole("status")).toHaveTextContent("Confirming your upload");
    await act(async () => resolve({ jobId: "job-1", phase: "processing", message: "Processing" }));
    expect(screen.getByRole("status")).toHaveTextContent("Upload accepted");
    expect(screen.getByRole("status")).toHaveTextContent("processing in the background");
    expect(screen.queryByRole("button", { name: "Create Report" })).not.toBeInTheDocument();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    const leavingAfterAcceptance = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leavingAfterAcceptance);
    expect(leavingAfterAcceptance.defaultPrevented).toBe(false);
  });

  it("retains entered details and every photo after failure and allows retry", async () => {
    vi.mocked(SalvageService.create).mockRejectedValueOnce(new Error("Upload failed"));
    vi.mocked(SalvageService.create).mockResolvedValueOnce({ jobId: "job-2", message: "Processing" });
    render(<SalvageForm />);
    fillForm();
    const files = addPhotos(11);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create Report" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.getByDisplayValue("Important damage notes")).toBeVisible();
    expect(screen.getByText("Selected: 11/30 photos")).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(11);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create Report" })));
    expect(SalvageService.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(SalvageService.create).mock.calls[1][1]).toEqual(files);
  });

  it("warns clearly when a selection would exceed the backend's 30-photo limit", () => {
    render(<SalvageForm />);
    addPhotos(31);
    expect(screen.getByRole("alert")).toHaveTextContent("Extra files were not added");
    expect(screen.getByText("Selected: 30/30 photos")).toBeVisible();
  });
});
