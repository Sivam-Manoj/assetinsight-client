"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";

export function formClassNames(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(" ");
}

export const formControlClass =
  "block min-h-11 w-full rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] px-3.5 py-2.5 text-[0.9375rem] leading-5 text-[var(--app-text)] shadow-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--app-text-muted)] hover:border-[var(--app-control-border-hover)] focus:border-[var(--app-accent)] focus:ring-4 focus:ring-[var(--app-accent-ring)] aria-[invalid=true]:border-[var(--app-danger)] aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-[var(--app-danger-ring)] disabled:cursor-not-allowed disabled:bg-[var(--app-panel-alt)] disabled:text-[var(--app-text-muted)] disabled:opacity-70";

export const formSelectClass = formClassNames(
  formControlClass,
  "cursor-pointer pr-10"
);

export const formTextareaClass = formClassNames(
  formControlClass,
  "min-h-28 resize-y leading-6"
);

export const formLabelClass =
  "text-sm font-semibold leading-5 text-[var(--app-text)]";
export const formHintClass =
  "text-xs leading-5 text-[var(--app-text-muted)]";
export const formErrorClass =
  "text-xs font-medium leading-5 text-[var(--app-danger)]";

export const formButtonBaseClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold leading-5 outline-none transition-[background-color,border-color,color,box-shadow,opacity,filter] duration-150 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClass = formClassNames(
  formButtonBaseClass,
  "border border-transparent bg-[var(--app-accent)] text-white shadow-sm hover:brightness-95 active:brightness-90 focus-visible:ring-[var(--app-accent-ring)]"
);

export const secondaryButtonClass = formClassNames(
  formButtonBaseClass,
  "border border-[var(--app-control-border)] bg-[var(--app-panel)] text-[var(--app-text)] shadow-sm hover:border-[var(--app-control-border-hover)] hover:bg-[var(--app-panel-alt)] focus-visible:ring-[var(--app-accent-ring)]"
);

export const quietButtonClass = formClassNames(
  formButtonBaseClass,
  "border border-transparent bg-transparent text-[var(--app-text-muted)] hover:bg-[var(--app-panel-alt)] hover:text-[var(--app-text)] focus-visible:ring-[var(--app-accent-ring)]"
);

export const dangerButtonClass = formClassNames(
  formButtonBaseClass,
  "border border-transparent bg-[var(--app-danger)] text-white shadow-sm hover:brightness-95 active:brightness-90 focus-visible:ring-[var(--app-danger-ring)]"
);

export const iconButtonClass =
  "inline-grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] text-[var(--app-text-muted)] outline-none transition hover:border-[var(--app-control-border-hover)] hover:bg-[var(--app-panel-alt)] hover:text-[var(--app-text)] focus-visible:ring-4 focus-visible:ring-[var(--app-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};

export type FormFieldProps = {
  id?: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  labelAction?: ReactNode;
  className?: string;
  children: ReactElement<FieldControlProps>;
};

export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  labelAction,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? children.props.id ?? `form-field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    children.props["aria-describedby"],
    hintId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");

  const control = isValidElement<FieldControlProps>(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy || undefined,
        "aria-errormessage": errorId,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-required": required
          ? true
          : children.props["aria-required"],
      })
    : children;

  return (
    <div className={formClassNames("grid content-start gap-1.5", className)}>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <label htmlFor={controlId} className={formLabelClass}>
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-1 text-[var(--app-accent)]">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
        {labelAction ? (
          <span className="shrink-0 text-xs text-[var(--app-text-muted)]">
            {labelAction}
          </span>
        ) : null}
      </div>
      {control}
      {hint ? (
        <p id={hintId} className={formHintClass}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={formErrorClass} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type FormSwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "children" | "onChange" | "type"
> & {
  label: ReactNode;
  checked: boolean;
  onChange: NonNullable<InputHTMLAttributes<HTMLInputElement>["onChange"]>;
  description?: ReactNode;
  wrapperClassName?: string;
};

export function FormSwitch({
  id,
  label,
  description,
  wrapperClassName,
  checked,
  onChange,
  disabled,
  ...inputProps
}: FormSwitchProps) {
  const generatedId = useId();
  const controlId = id ?? `form-switch-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <label
      htmlFor={controlId}
      className={formClassNames(
        "flex min-h-11 items-start gap-3",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        wrapperClassName
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          {...inputProps}
          id={controlId}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-describedby={descriptionId}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={formClassNames(
            "flex h-6 w-11 items-center rounded-full border px-0.5 transition-[background-color,border-color,box-shadow] peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--app-accent-ring)]",
            checked
              ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
              : "border-[var(--app-control-border)] bg-[var(--app-control-border)]"
          )}
        >
          <span
            className={formClassNames(
              "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-[var(--app-text)]">
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="mt-0.5 block text-xs leading-5 text-[var(--app-text-muted)]"
          >
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export type FormSectionStatus =
  | "default"
  | "complete"
  | "incomplete"
  | "error";

export type FormSectionProps = {
  id: string;
  title: ReactNode;
  sectionNumber?: number | string;
  description?: ReactNode;
  summary?: ReactNode;
  errorSummary?: ReactNode;
  status?: FormSectionStatus;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  autoRevealErrors?: boolean;
  disabled?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function FormSection({
  id,
  title,
  sectionNumber,
  description,
  summary,
  errorSummary,
  status = "default",
  open,
  defaultOpen = false,
  onOpenChange,
  autoRevealErrors = true,
  disabled = false,
  className,
  bodyClassName,
  children,
}: FormSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;
  const panelRef = useRef<HTMLDivElement>(null);
  const wasInvalidRef = useRef(false);
  const pendingInvalidFocusRef = useRef(false);
  const hasError = status === "error" || Boolean(errorSummary);
  const resolvedStatus = hasError ? "error" : status;

  const updateOpen = (nextOpen: boolean) => {
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    const becameInvalid = hasError && !wasInvalidRef.current;
    wasInvalidRef.current = hasError;

    if (!autoRevealErrors || !becameInvalid) return;
    pendingInvalidFocusRef.current = true;
    if (!isOpen) updateOpen(true);
  }, [autoRevealErrors, hasError, isOpen]);

  useEffect(() => {
    if (!isOpen || !pendingInvalidFocusRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      const invalidControl = panelRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-invalid="true"]'
      );
      if (invalidControl && !invalidControl.hasAttribute("disabled")) {
        invalidControl.focus({ preventScroll: true });
        invalidControl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      pendingInvalidFocusRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasError, isOpen]);

  const summaryContent = errorSummary ?? summary;

  return (
    <section
      aria-labelledby={headerId}
      data-form-section={id}
      data-invalid={hasError ? "true" : undefined}
      className={formClassNames(
        "overflow-hidden rounded-xl border bg-[var(--app-panel)]",
        hasError
          ? "border-[var(--app-danger)]"
          : "border-[var(--app-control-border)]",
        className
      )}
    >
      <h2 className="m-0">
        <button
          id={headerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => updateOpen(!isOpen)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none transition hover:bg-[var(--app-panel-alt)] focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--app-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
        >
          {sectionNumber !== undefined ? (
            <span
              aria-hidden="true"
              className={formClassNames(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
                resolvedStatus === "complete"
                  ? "border-[var(--app-success-border)] bg-[var(--app-success-soft)] text-[var(--app-success)]"
                  : resolvedStatus === "error"
                    ? "border-[var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]"
                    : "border-[var(--app-control-border)] bg-[var(--app-panel-alt)] text-[var(--app-text)]"
              )}
            >
              {resolvedStatus === "complete" ? (
                <Check className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                sectionNumber
              )}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-5">
            <span className="block text-base font-semibold leading-6 text-[var(--app-text)] sm:text-[1.0625rem]">
              {title}
            </span>
            {summaryContent ? (
              <span
                className={formClassNames(
                  "mt-0.5 block truncate text-sm font-normal leading-5 sm:mt-0",
                  hasError
                    ? "text-[var(--app-danger)]"
                    : "text-[var(--app-text-muted)]"
                )}
              >
                {summaryContent}
              </span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={formClassNames(
              "h-5 w-5 shrink-0 text-[var(--app-text-muted)] transition-transform duration-200",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
      </h2>
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!isOpen}
        className={formClassNames(
          "border-t border-[var(--app-border)] px-4 py-5 sm:px-5 sm:py-6",
          bodyClassName
        )}
      >
        {description ? (
          <p className="mb-5 max-w-3xl text-sm leading-6 text-[var(--app-text-muted)]">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export type DraftStatus =
  | "dirty"
  | "saving"
  | "saved"
  | "partial"
  | "error";

const draftStatusConfig: Record<
  DraftStatus,
  { label: string; className: string }
> = {
  dirty: {
    label: "Unsaved changes",
    className: "text-[var(--app-text-muted)]",
  },
  saving: {
    label: "Saving draft…",
    className: "text-[var(--app-text-muted)]",
  },
  saved: {
    label: "Draft saved",
    className: "text-[var(--app-success)]",
  },
  partial: {
    label: "Draft partially saved",
    className: "text-[var(--app-warning)]",
  },
  error: {
    label: "Draft not saved",
    className: "text-[var(--app-danger)]",
  },
};

function DraftStatusIcon({ status }: { status: DraftStatus }) {
  const iconClassName = "h-4 w-4 shrink-0";
  switch (status) {
    case "saving":
      return (
        <LoaderCircle
          aria-hidden="true"
          className={`${iconClassName} animate-spin`}
        />
      );
    case "saved":
      return <CheckCircle2 aria-hidden="true" className={iconClassName} />;
    case "partial":
      return <AlertTriangle aria-hidden="true" className={iconClassName} />;
    case "error":
      return <AlertCircle aria-hidden="true" className={iconClassName} />;
    default:
      return <Circle aria-hidden="true" className={iconClassName} />;
  }
}

export function DraftStatusIndicator({
  status,
  label,
  className,
}: {
  status: DraftStatus;
  label?: ReactNode;
  className?: string;
}) {
  const config = draftStatusConfig[status];
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={formClassNames(
        "inline-flex min-w-0 items-center gap-2 text-sm font-medium",
        config.className,
        className
      )}
    >
      <DraftStatusIcon status={status} />
      <span className="truncate">{label ?? config.label}</span>
    </span>
  );
}

export type FormAlertTone = "info" | "success" | "warning" | "error";

const alertToneClasses: Record<FormAlertTone, string> = {
  info: "border-[var(--app-info-border)] bg-[var(--app-info-soft)] text-[var(--app-info)]",
  success:
    "border-[var(--app-success-border)] bg-[var(--app-success-soft)] text-[var(--app-success)]",
  warning:
    "border-[var(--app-warning-border)] bg-[var(--app-warning-soft)] text-[var(--app-warning)]",
  error:
    "border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]",
};

function FormAlertIcon({ tone }: { tone: FormAlertTone }) {
  const iconClassName = "mt-0.5 h-5 w-5 shrink-0";
  switch (tone) {
    case "success":
      return <CheckCircle2 aria-hidden="true" className={iconClassName} />;
    case "warning":
      return <AlertTriangle aria-hidden="true" className={iconClassName} />;
    case "error":
      return <AlertCircle aria-hidden="true" className={iconClassName} />;
    default:
      return <Info aria-hidden="true" className={iconClassName} />;
  }
}

export function FormAlert({
  tone = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  tone?: FormAlertTone;
  title?: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={formClassNames(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        alertToneClasses[tone],
        className
      )}
    >
      <FormAlertIcon tone={tone} />
      <div className="min-w-0 flex-1 text-[var(--app-text)]">
        {title ? <p className="font-semibold leading-5">{title}</p> : null}
        <div
          className={formClassNames(
            "leading-5 text-[var(--app-text-muted)]",
            title ? "mt-0.5" : undefined
          )}
        >
          {children}
        </div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-current outline-none transition hover:bg-black/5 focus-visible:ring-4 focus-visible:ring-current/20"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function FormActionBar({
  children,
  className,
  ariaLabel = "Form actions",
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <footer
      aria-label={ariaLabel}
      className={formClassNames(
        "sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-4 sm:px-6",
        className
      )}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </footer>
  );
}

export type ConfirmDialogTone = "default" | "warning" | "danger";

export type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const generatedId = useId();
  const titleId = `confirm-title-${generatedId}`;
  const descriptionId = description
    ? `confirm-description-${generatedId}`
    : undefined;
  const destructive = tone === "danger";

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            m: { xs: 2, sm: 4 },
            width: { xs: "calc(100% - 32px)", sm: "100%" },
            maxHeight: "calc(100dvh - 32px)",
            border: "1px solid var(--app-control-border)",
            borderRadius: "14px",
            bgcolor: "var(--app-panel)",
            color: "var(--app-text)",
            boxShadow: "var(--app-shadow-modal)",
            backgroundImage: "none",
          },
        },
        backdrop: {
          sx: {
            bgcolor: "rgba(2, 6, 23, 0.56)",
            backdropFilter: "blur(2px)",
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          px: { xs: 2, sm: 2.5 },
          pt: { xs: 2, sm: 2.5 },
          pb: 1,
        }}
      >
        {tone !== "default" ? (
          <span
            className={formClassNames(
              "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              destructive
                ? "bg-[var(--app-danger-soft)] text-[var(--app-danger)]"
                : "bg-[var(--app-warning-soft)] text-[var(--app-warning)]"
            )}
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
        <h2
          id={titleId}
          className="min-w-0 flex-1 text-lg font-semibold leading-7 text-[var(--app-text)]"
        >
          {title}
        </h2>
        <IconButton
          aria-label="Close confirmation"
          onClick={onCancel}
          disabled={busy}
          size="small"
          sx={{
            mt: -0.5,
            mr: -0.5,
            color: "var(--app-text-muted)",
            "&:hover": { bgcolor: "var(--app-panel-alt)" },
          }}
        >
          <X className="h-5 w-5" />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          px: { xs: 2, sm: 2.5 },
          pt: "4px !important",
          pb: 2,
        }}
      >
        {description ? (
          <p
            id={descriptionId}
            className="text-sm leading-6 text-[var(--app-text-muted)]"
          >
            {description}
          </p>
        ) : null}
        {children ? (
          <div className={description ? "mt-4" : undefined}>{children}</div>
        ) : null}
      </DialogContent>
      <DialogActions
        sx={{
          gap: 1,
          borderTop: "1px solid var(--app-border)",
          px: { xs: 2, sm: 2.5 },
          py: 2,
          "& > :not(style) ~ :not(style)": { ml: 0 },
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          autoFocus
          className={secondaryButtonClass}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          className={destructive ? dangerButtonClass : primaryButtonClass}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </DialogActions>
    </Dialog>
  );
}
