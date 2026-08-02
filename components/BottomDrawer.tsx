"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./BottomDrawer.module.css";

export default function BottomDrawer({
  open,
  title,
  description = "Review and update details in a focused workspace.",
  headerStatus,
  onClose,
  children,
  fullscreen = false,
  contentScrollable = true,
}: {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerStatus?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  fullscreen?: boolean;
  contentScrollable?: boolean;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = title ? `drawer-title-${id}` : undefined;
  const descriptionId = description ? `drawer-description-${id}` : undefined;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.drawer}
        data-fullscreen={fullscreen}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.grabber} aria-hidden />
            {title ? (
              <h2 className={styles.title} id={titleId}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <div className={styles.description} id={descriptionId}>
                {description}
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            {headerStatus ? <div className={styles.status}>{headerStatus}</div> : null}
            <button
              className="app-button app-button--secondary app-button--icon"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>
        <div
          className={`${styles.content} ${
            contentScrollable ? styles.scrollable : styles.fixed
          }`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
