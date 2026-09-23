import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrmService, type CrmTasksResponse } from "@/services/crm";
import CrmTaskList, { crmDate, crmSource } from "./CrmTaskList";

vi.mock("@/services/crm", async (original) => ({ ...await original<typeof import("@/services/crm")>(), CrmService: { getMyTasks: vi.fn() } }));
const row = { _id: "a".repeat(24), clientName: "Alex Morgan", companyName: "Prairie Equipment", status: "contacted" as const, leadSource: "generic" as const, updateCount: 2041, createdAt: "2026-09-23", updatedAt: "2026-09-23" };
const response: CrmTasksResponse = { items: [row], total: 124, page: 1, limit: 20 };
function mount(ownerId = "owner-a") {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}><CrmTaskList ownerId={ownerId} onOpenTask={vi.fn()} /></SWRConfig>);
}
beforeEach(() => { vi.mocked(CrmService.getMyTasks).mockResolvedValue(response); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("compact CRM list", () => {
  it("requests only a 20-row summary and uses server totals", async () => {
    mount();
    expect(await screen.findByText("124 matching tasks")).toBeInTheDocument();
    expect(CrmService.getMyTasks).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.queryByText("2041")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
  it("fetches the next server page and resets to page one for filters", async () => {
    mount(); await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(CrmService.getMyTasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.anything()));
    fireEvent.change(screen.getByLabelText("Task stage"), { target: { value: "won" } });
    await waitFor(() => expect(CrmService.getMyTasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: "won" }), expect.anything()));
  });
  it("debounces search and keeps literal user input for service escaping", async () => {
    mount(); await screen.findByText("Alex Morgan");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Smith (+1)" } });
    expect(CrmService.getMyTasks).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(CrmService.getMyTasks).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Smith (+1)" }), expect.anything()));
  });
  it("returns to the final valid page when the last task leaves the current page", async () => {
    vi.mocked(CrmService.getMyTasks).mockImplementation(async (params) => params?.page === 2 ? { ...response, items: [], page: 2, total: 20 } : response);
    mount(); await screen.findByText("Alex Morgan");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(CrmService.getMyTasks).toHaveBeenCalledTimes(3));
    expect(CrmService.getMyTasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }), expect.anything());
    expect(screen.queryByText("21–20 of 20")).not.toBeInTheDocument();
  });
  it("shows a readable error without automatic retries", async () => {
    vi.mocked(CrmService.getMyTasks).mockRejectedValue(new Error("CRM agent access required"));
    mount(); expect(await screen.findByRole("alert")).toHaveTextContent("CRM agent access required");
    expect(CrmService.getMyTasks).toHaveBeenCalledTimes(1);
  });
  it("aborts an abandoned owner read and ignores its late result", async () => {
    let resolve!: (value: CrmTasksResponse) => void;
    vi.mocked(CrmService.getMyTasks).mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = mount();
    await waitFor(() => expect(CrmService.getMyTasks).toHaveBeenCalled());
    const signal = vi.mocked(CrmService.getMyTasks).mock.calls[0][1]?.signal;
    first.unmount(); await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => resolve(response));
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
  });
  it("handles empty lists, missing dates and legacy source classification", async () => {
    vi.mocked(CrmService.getMyTasks).mockResolvedValue({ ...response, items: [], total: 0 });
    mount(); expect(await screen.findByText("No matching tasks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(crmDate("invalid")).toBe("Not set");
    expect(crmDate()).toBe("Not set");
    expect(crmSource({ title: "Quick Add - Alex", leadSource: "generic" })).toBe("Organic");
    expect(crmSource({})).toBe("Not recorded");
  });
});
