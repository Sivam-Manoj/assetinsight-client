import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportThumbnail } from "./ReportThumbnail";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportThumbnail", () => {
  it("waits until the fixed-size frame is near the viewport before loading", () => {
    let intersect: (() => void) | undefined;
    const disconnect = vi.fn();

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "320px 0px";
      thresholds = [0.01];
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(
      <ReportThumbnail
        src="https://images.sellsnap.store/reports/excavator.jpg"
        title="2019 Caterpillar 320 Excavator"
      />
    );

    expect(
      screen.queryByAltText("Preview image for 2019 Caterpillar 320 Excavator")
    ).not.toBeInTheDocument();

    act(() => intersect?.());

    const image = screen.getByAltText(
      "Preview image for 2019 Caterpillar 320 Excavator"
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("fetchpriority", "low");
    expect(image).toHaveAttribute("width", "64");
    expect(image).toHaveAttribute("height", "56");

    fireEvent.error(image);
    expect(
      screen.queryByAltText("Preview image for 2019 Caterpillar 320 Excavator")
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "No preview image available for 2019 Caterpillar 320 Excavator"
      )
    ).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });

  it("renders the fallback without creating a broken image request", () => {
    render(<ReportThumbnail title="Report without photos" size="card" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "No preview image available for Report without photos"
      )
    ).toHaveClass("h-16", "w-[4.5rem]");
  });
});
