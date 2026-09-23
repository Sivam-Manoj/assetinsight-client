import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function location(path: string, cookie = "cv_access_token=test-only") {
  return proxy(new NextRequest(`https://app.test${path}`, { headers: { cookie } })).headers.get("location");
}
describe("workspace entry redirects", () => {
  it.each(["/", "/welcome", "/login", "/device-access"])("opens the chooser for authenticated generic entry %s", (path) => expect(location(path)).toBe("https://app.test/workspaces"));
  it.each(["/crm/tasks?task=abc", "/previews?reportId=abc&reportType=asset", "/reports?search=hello%20world"])("preserves authenticated deep link %s", (path) => expect(location(path)).toBeNull());
  it("preserves login next and device approval next", () => {
    const path = "/crm/tasks?task=abc";
    expect(location(`/login?next=${encodeURIComponent(path)}`)).toBe(`https://app.test${path}`);
    expect(location(`/device-access?next=${encodeURIComponent(path)}`)).toBe(`https://app.test${path}`);
    expect(location(path, "")).toBe(`https://app.test/login?next=${encodeURIComponent(path)}`);
    expect(location(path, "cv_device_pending=1")).toBe(`https://app.test/device-access?next=${encodeURIComponent(path)}`);
  });
  it("rejects an external redirect and leaves the signed-out landing public", () => {
    expect(location("/login?next=https://evil.test")).toBe("https://app.test/workspaces");
    expect(location("/", "")).toBeNull();
  });
});
