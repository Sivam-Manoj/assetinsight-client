"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Sx = Record<string, unknown> | undefined;

function sxStyle(sx: Sx): React.CSSProperties {
  if (!sx) return {};
  const aliases: Record<string, keyof React.CSSProperties> = {
    bgcolor: "backgroundColor",
    m: "margin",
    mt: "marginTop",
    mr: "marginRight",
    mb: "marginBottom",
    ml: "marginLeft",
    p: "padding",
    pt: "paddingTop",
    pr: "paddingRight",
    pb: "paddingBottom",
    pl: "paddingLeft",
  };
  const allowed = new Set([
    "color",
    "background",
    "backgroundColor",
    "border",
    "borderRadius",
    "boxShadow",
    "display",
    "gap",
    "height",
    "maxHeight",
    "maxWidth",
    "minHeight",
    "minWidth",
    "overflow",
    "overflowX",
    "overflowY",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "width",
    "zIndex",
  ]);
  const style: React.CSSProperties = {};
  Object.entries(sx).forEach(([key, value]) => {
    const target = aliases[key] ?? key;
    if (
      allowed.has(target) &&
      (typeof value === "string" || typeof value === "number")
    ) {
      (style as Record<string, string | number>)[target] = value;
    }
  });
  return style;
}

export function Menu({
  anchorEl,
  open,
  onClose,
  children,
  slotProps,
}: {
  anchorEl?: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  slotProps?: { paper?: { sx?: Sx } };
  anchorOrigin?: unknown;
  transformOrigin?: unknown;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const bounds = anchorEl.getBoundingClientRect();
    const width = panelRef.current?.offsetWidth ?? 220;
    const top = Math.min(window.innerHeight - 12, bounds.bottom + 6);
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, bounds.right - width)
    );
    setPosition({ top, left });
  }, [anchorEl, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        !panelRef.current?.contains(event.target as Node) &&
        !anchorEl?.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{
        position: "fixed",
        zIndex: 160,
        top: position.top,
        left: position.left,
        minWidth: 210,
        padding: 5,
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        background: "var(--app-panel)",
        color: "var(--app-text)",
        boxShadow: "var(--app-shadow-shell)",
        ...sxStyle(slotProps?.paper?.sx),
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function MenuItem({
  children,
  disabled,
  onClick,
  className,
  sx,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  sx?: Sx;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{
        width: "100%",
        minHeight: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        border: 0,
        borderRadius: 6,
        background: "transparent",
        color: "var(--app-text)",
        fontSize: 14,
        textAlign: "left",
        ...sxStyle(sx),
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "var(--app-panel-alt)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export function ListItemIcon({
  children,
  sx,
}: {
  children: React.ReactNode;
  sx?: Sx;
}) {
  return (
    <span
      style={{
        width: 24,
        display: "inline-flex",
        flex: "0 0 auto",
        color: "var(--app-text-muted)",
        ...sxStyle(sx),
      }}
    >
      {children}
    </span>
  );
}

export function ListItemText({ children }: { children: React.ReactNode }) {
  return <span style={{ minWidth: 0, flex: 1 }}>{children}</span>;
}

type DialogCloseReason = "escapeKeyDown" | "backdropClick";

export function Dialog({
  open,
  onClose,
  children,
  fullScreen = false,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  slotProps,
}: {
  open: boolean;
  onClose?: (event: object, reason: DialogCloseReason) => void;
  children: React.ReactNode;
  fullScreen?: boolean;
  fullWidth?: boolean;
  maxWidth?: string | false;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  slotProps?: { paper?: { sx?: Sx }; backdrop?: { sx?: Sx } };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.(event, "escapeKeyDown");
    };
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="app-dialog-backdrop"
      style={sxStyle(slotProps?.backdrop?.sx)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.(event, "backdropClick");
        }
      }}
    >
      <div
        ref={panelRef}
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        style={{
          ...(fullScreen
            ? {
                width: "100vw",
                height: "100dvh",
                maxWidth: "none",
                maxHeight: "none",
                border: 0,
                borderRadius: 0,
              }
            : {}),
          ...sxStyle(slotProps?.paper?.sx),
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogTitle({
  children,
  id,
  className,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={className || "app-dialog__header"}>
      {children}
    </div>
  );
}

export function DialogContent({
  children,
}: {
  children: React.ReactNode;
  sx?: Sx;
}) {
  return <div className="app-dialog__body">{children}</div>;
}

export function DialogContentText({
  children,
}: {
  children: React.ReactNode;
  sx?: Sx;
}) {
  return (
    <p className="app-muted" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

export function DialogActions({
  children,
}: {
  children: React.ReactNode;
  sx?: Sx;
}) {
  return <div className="app-dialog__footer">{children}</div>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant,
  color,
  sx,
}: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: string;
  color?: string;
  sx?: Sx;
}) {
  const className =
    color === "error"
      ? variant === "contained"
        ? "app-button app-button--danger"
        : "app-button app-button--danger"
      : variant === "contained"
        ? "app-button app-button--primary"
        : "app-button app-button--secondary";
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick}
      style={sxStyle(sx)}
    >
      {children}
    </button>
  );
}
