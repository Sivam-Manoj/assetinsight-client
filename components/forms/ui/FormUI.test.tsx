import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DraftStatusIndicator,
  FormField,
  FormSection,
} from "./FormUI";

function MultiSectionHarness() {
  const [open, setOpen] = useState({ first: true, second: false });
  return (
    <>
      <FormSection
        id="first"
        title="First section"
        open={open.first}
        onOpenChange={(next) =>
          setOpen((current) => ({ ...current, first: next }))
        }
      >
        <p>First content</p>
      </FormSection>
      <FormSection
        id="second"
        title="Second section"
        open={open.second}
        onOpenChange={(next) =>
          setOpen((current) => ({ ...current, second: next }))
        }
      >
        <p>Second content</p>
      </FormSection>
    </>
  );
}

describe("FormSection", () => {
  it("uses native disclosure buttons and allows multiple sections to stay open", () => {
    render(<MultiSectionHarness />);

    const first = screen.getByRole("button", { name: /first section/i });
    const second = screen.getByRole("button", { name: /second section/i });
    expect(first.tagName).toBe("BUTTON");
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Second content").parentElement).not.toHaveAttribute(
      "hidden"
    );
  });

  it("reveals a newly invalid section and focuses its first invalid control", async () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    function Harness() {
      const [invalid, setInvalid] = useState(false);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setInvalid(true)}>
            Validate
          </button>
          <FormSection
            id="details"
            title="Details"
            open={open}
            onOpenChange={setOpen}
            status={invalid ? "error" : "default"}
            errorSummary={invalid ? "One field needs attention" : undefined}
          >
            <FormField
              id="required-name"
              label="Name"
              required
              error={invalid ? "Enter a name" : undefined}
            >
              <input />
            </FormField>
          </FormSection>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    const sectionButton = screen.getByRole("button", { name: /details/i });
    const input = screen.getByLabelText(/name/i);
    await waitFor(() => expect(sectionButton).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a name");

    requestAnimationFrame.mockRestore();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown })
        .scrollIntoView;
    }
  });
});

describe("shared form semantics", () => {
  it("associates labels, hints, required state, and errors with controls", () => {
    render(
      <FormField
        id="currency"
        label="Currency"
        required
        hint="Use an ISO code"
        error="Currency is invalid"
      >
        <input />
      </FormField>
    );

    const input = screen.getByLabelText(/currency/i);
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Use an ISO code Currency is invalid"
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Currency is invalid");
  });

  it("announces honest header draft status", () => {
    const { rerender } = render(<DraftStatusIndicator status="saving" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving draft");

    rerender(
      <DraftStatusIndicator status="partial" label="Saved on this device only" />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved on this device only"
    );
  });
});
