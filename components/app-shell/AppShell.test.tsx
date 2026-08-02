import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextType } from "@/context/AuthContext";
import { useAuthContext } from "@/context/AuthContext";
import { useColorMode } from "@/components/providers/ColorModeProvider";
import AppShell from "./AppShell";

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/incoming"),
  swr: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    fill: _fill,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
    fill?: boolean;
  }) => <img {...props} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    function DeferredComponent() {
      return null;
    }
    return DeferredComponent;
  },
}));

vi.mock("swr", () => ({
  default: mocks.swr,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

vi.mock("@/components/providers/ColorModeProvider", () => ({
  useColorMode: vi.fn(),
}));

function authValue(
  roles: {
    isReportApprover?: boolean;
    isReleaseManager?: boolean;
  } = {}
): AuthContextType {
  return {
    user: {
      _id: "user-1",
      email: "appraiser@example.com",
      username: "Alex Morgan",
      ...roles,
    },
    loading: false,
    error: null,
    loggingOut: false,
    deviceAccess: null,
    refresh: vi.fn(),
    login: vi.fn(),
    acceptAuthResponse: vi.fn(),
    registerDevice: vi.fn(),
    refreshDeviceStatus: vi.fn(),
    rerequestDevice: vi.fn(),
    logout: vi.fn(),
  };
}

describe("AppShell", () => {
  const toggleMode = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    mocks.pathname.mockReturnValue("/incoming");
    mocks.swr.mockReset();
    mocks.swr.mockReturnValue({
      data: { availableCount: 4, showBadge: true },
    });
    vi.mocked(useAuthContext).mockReturnValue(authValue());
    vi.mocked(useColorMode).mockReturnValue({
      mode: "light",
      resolvedTheme: "light",
      setMode: vi.fn(),
      toggleMode,
    });
  });

  it("renders Incoming for a standard user and marks it active", () => {
    render(<AppShell>Queue content</AppShell>);

    const incoming = screen.getByRole("link", { name: /Incoming/ });
    expect(incoming).toHaveAttribute("href", "/incoming");
    expect(incoming).toHaveAttribute("aria-current", "page");
    expect(incoming).toHaveTextContent("4");
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Releases" })).not.toBeInTheDocument();
  });

  it("renders each role-gated destination only for the matching role", () => {
    vi.mocked(useAuthContext).mockReturnValue(
      authValue({ isReportApprover: true, isReleaseManager: true })
    );

    render(<AppShell>Workspace</AppShell>);

    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute(
      "href",
      "/approvals"
    );
    expect(screen.getByRole("link", { name: "Releases" })).toHaveAttribute(
      "href",
      "/releases"
    );
    expect(screen.getByRole("link", { name: /Incoming/ })).toBeInTheDocument();
  });

  it("keeps the Incoming destination but hides only its unavailable badge", () => {
    mocks.swr.mockReturnValue({
      data: { availableCount: 9, showBadge: false },
    });

    render(<AppShell>Queue content</AppShell>);

    expect(screen.getByRole("link", { name: "Incoming" })).toBeInTheDocument();
    expect(screen.queryByLabelText("9 available")).not.toBeInTheDocument();
  });

  it("pauses badge polling while the page is hidden or offline", () => {
    render(<AppShell>Queue content</AppShell>);
    const options = mocks.swr.mock.calls[0]?.[2] as {
      refreshInterval: () => number;
      refreshWhenHidden: boolean;
      refreshWhenOffline: boolean;
    };

    expect(options.refreshWhenHidden).toBe(false);
    expect(options.refreshWhenOffline).toBe(false);
    expect(options.refreshInterval()).toBe(60_000);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    expect(options.refreshInterval()).toBe(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    expect(options.refreshInterval()).toBe(0);
  });

  it("persists the collapsed desktop sidebar state", async () => {
    const { container } = render(<AppShell>Workspace</AppShell>);
    const shell = container.firstElementChild;

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse navigation" })
    );

    expect(shell).toHaveAttribute("data-collapsed", "true");
    await waitFor(() =>
      expect(window.localStorage.getItem("cv-sidebar-collapsed")).toBe("true")
    );
    expect(screen.getByRole("link", { name: /Incoming/ })).toHaveAttribute(
      "title",
      "Incoming"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Expand navigation" })
    );
    expect(shell).toHaveAttribute("data-collapsed", "false");
    expect(window.localStorage.getItem("cv-sidebar-collapsed")).toBe("false");
  });

  it("restores a previously collapsed sidebar", async () => {
    window.localStorage.setItem("cv-sidebar-collapsed", "true");
    const { container } = render(<AppShell>Workspace</AppShell>);

    await waitFor(() =>
      expect(container.firstElementChild).toHaveAttribute(
        "data-collapsed",
        "true"
      )
    );
    expect(
      screen.getByRole("button", { name: "Expand navigation" })
    ).toBeInTheDocument();
  });

  it("opens and closes the mobile drawer with accessible controls", () => {
    const { container } = render(<AppShell>Workspace</AppShell>);
    const shell = container.firstElementChild;

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(shell).toHaveAttribute("data-mobile-open", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(shell).toHaveAttribute("data-mobile-open", "false");
  });

  it("exposes theme controls in desktop and mobile shell chrome", () => {
    render(<AppShell>Workspace</AppShell>);

    const controls = screen.getAllByRole("button", { name: /dark theme/i });
    expect(controls.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(controls[0]);
    expect(toggleMode).toHaveBeenCalledTimes(1);
  });
});
