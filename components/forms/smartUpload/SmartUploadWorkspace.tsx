"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Image as ImageIcon,
  Loader2,
  ScanLine,
  Split,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  cancelSmartUpload,
  completeSmartUpload,
  createOrResumeSmartUploadSession,
  getSmartUploadError,
  getSmartUploadGrouping,
  startSmartUploadDetection,
  updateSmartUploadDividers,
  uploadSmartUploadFiles,
  waitForSmartUploadGrouping,
  type SmartUploadGrouping,
} from "@/services/smartUpload";
import {
  createSmartUploadDraft,
  deleteSmartUploadDraft,
  loadSmartUploadDraft,
  updateSmartUploadDraft,
  type SmartUploadDraft,
  type SmartUploadKind,
} from "./storage";

type Props = {
  open: boolean;
  kind: SmartUploadKind;
  userId: string;
  details: Record<string, unknown>;
  onClose: () => void;
  onSubmitted: (result: {
    message: string;
    reportId: string;
    jobId: string;
  }) => void | Promise<void>;
};

type UploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  uploadedFiles: number;
  totalFiles: number;
};

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const VISIBLE_IMAGE_BATCH = 120;

function newSubmissionId(kind: SmartUploadKind) {
  return globalThis.crypto?.randomUUID?.() ||
    `smart-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(0, value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function ImagePreview({
  file,
  alt,
  className,
}: {
  file: File;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setSrc(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return src ? (
    // A local object URL has no useful Next Image optimization path.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} draggable={false} />
  ) : (
    <div className={className} aria-hidden="true" />
  );
}

function progressLabel(stage: SmartUploadDraft["stage"]) {
  if (stage === "uploading") return "Uploading images";
  if (stage === "classifying") return "Detecting black dividers";
  if (stage === "submitting") return "Creating preview";
  if (stage === "review") return "Review detected lots";
  if (stage === "failed") return "Smart Upload needs attention";
  return "Images ready to upload";
}

export default function SmartUploadWorkspace({
  open,
  kind,
  userId,
  details,
  onClose,
  onSubmitted,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draft, setDraft] = useState<SmartUploadDraft | null>(null);
  const [grouping, setGrouping] = useState<SmartUploadGrouping | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(VISIBLE_IMAGE_BATCH);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoadingDraft(true);
    setError(null);
    setDraft(null);
    setGrouping(null);
    void loadSmartUploadDraft(userId, kind)
      .then(async (saved) => {
        if (cancelled || !saved) return;
        // Current form details win when a user resumes before upload. Once a
        // session exists the same client submission id keeps server retries safe.
        const resumed = {
          ...saved,
          details: { ...saved.details, ...detailsRef.current },
          // A browser close can interrupt an in-flight PUT. The server session
          // and confirmed files are reusable, so expose an explicit resume action.
          stage: saved.stage === "uploading" ? ("failed" as const) : saved.stage,
        };
        setDraft(resumed);
        setVisibleLimit(VISIBLE_IMAGE_BATCH);
        if (resumed.sessionId) {
          try {
            const result = await getSmartUploadGrouping(
              kind,
              resumed.sessionId
            );
            if (!cancelled) {
              setGrouping(result);
              if (
                result.groupingStatus === "review_ready" ||
                result.groupingStatus === "confirmed"
              ) {
                setDraft((current) =>
                    current ? { ...current, stage: "review" } : current
                  );
                await updateSmartUploadDraft(userId, kind, {
                  stage: "review",
                });
              } else if (result.groupingStatus === "classifying") {
                setDraft((current) =>
                  current ? { ...current, stage: "classifying" } : current
                );
                abortRef.current?.abort();
                const controller = new AbortController();
                abortRef.current = controller;
                const detected = await waitForSmartUploadGrouping({
                  kind,
                  sessionId: resumed.sessionId,
                  signal: controller.signal,
                  onProgress: (next) => {
                    if (!cancelled) setGrouping(next);
                  },
                });
                if (!cancelled) {
                  setGrouping(detected);
                  setDraft((current) =>
                    current ? { ...current, stage: "review" } : current
                  );
                  await updateSmartUploadDraft(userId, kind, {
                    stage: "review",
                  });
                }
              } else if (result.groupingStatus === "uploading") {
                setDraft((current) =>
                  current ? { ...current, stage: "failed" } : current
                );
                setError(
                  "The previous upload was interrupted. Resume to upload only the remaining images."
                );
                await updateSmartUploadDraft(userId, kind, {
                  stage: "failed",
                });
              } else if (result.groupingStatus === "failed") {
                setDraft((current) =>
                  current ? { ...current, stage: "failed" } : current
                );
                setError(
                  result.error ||
                    "Black-image detection failed. Resume to retry the same upload."
                );
                await updateSmartUploadDraft(userId, kind, {
                  stage: "failed",
                });
              }
            }
          } catch (resumeError) {
            if (
              !cancelled &&
              (resumeError as { name?: string })?.name !== "AbortError"
            ) {
              setDraft((current) =>
                current ? { ...current, stage: "failed" } : current
              );
              setError(getSmartUploadError(resumeError));
            }
          }
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(getSmartUploadError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [kind, open, userId]);

  const active =
    draft?.stage === "uploading" ||
    draft?.stage === "classifying" ||
    draft?.stage === "submitting";

  const requestClose = useCallback(() => {
    if (active) {
      setError(
        "Smart Upload is still working. Wait for this step to finish before closing."
      );
      return;
    }
    onClose();
  }, [active, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestClose]);

  const fileById = useMemo(
    () => new Map((draft?.files || []).map((item) => [item.fileId, item.file])),
    [draft?.files]
  );
  const dividerSet = useMemo(
    () => new Set(grouping?.dividerFileIds || []),
    [grouping?.dividerFileIds]
  );
  const visibleFiles = useMemo(
    () => (draft?.files || []).slice(0, visibleLimit),
    [draft?.files, visibleLimit]
  );
  const selectFiles = useCallback(
    async (selected: File[]) => {
      if (!selected.length || !userId) return;
      const invalid = selected.find(
        (file) =>
          !(file.type.startsWith("image/") || ACCEPTED_EXTENSIONS.test(file.name))
      );
      if (invalid) {
        setError(
          `${invalid.name} is not a supported JPEG, PNG, WebP, HEIC, or HEIF image.`
        );
        return;
      }
      try {
        setError(null);
        setGrouping(null);
        setVisibleLimit(VISIBLE_IMAGE_BATCH);
        const next = await createSmartUploadDraft({
          userId,
          kind,
          clientSubmissionId: newSubmissionId(kind),
          details: detailsRef.current,
          files: selected,
        });
        setDraft(next);
        setProgress({
          uploadedBytes: 0,
          totalBytes: selected.reduce((sum, file) => sum + file.size, 0),
          uploadedFiles: 0,
          totalFiles: selected.length,
        });
      } catch (selectionError) {
        setError(getSmartUploadError(selectionError));
      }
    },
    [kind, userId]
  );

  const runUploadAndDetection = useCallback(async () => {
    if (!draft) return;
    try {
      setError(null);
      const session = await createOrResumeSmartUploadSession(draft);
      if (session.alreadyQueued && session.reportId) {
        await deleteSmartUploadDraft(userId, kind);
        await onSubmitted({
          message: "This Smart Upload was already accepted.",
          reportId: session.reportId,
          jobId: session.jobId,
        });
        return;
      }

      const sessionDraft = {
        ...draft,
        sessionId: session.sessionId,
        stage: "uploading" as const,
      };
      setDraft(sessionDraft);
      await updateSmartUploadDraft(userId, kind, {
        sessionId: session.sessionId,
        stage: "uploading",
        details: detailsRef.current,
      });

      await uploadSmartUploadFiles({
        draft: sessionDraft,
        session,
        onProgress: setProgress,
        onFilesConfirmed: async (files) => {
          await updateSmartUploadDraft(userId, kind, { files });
          setDraft((current) =>
            current
              ? {
                  ...current,
                  files: current.files.map((item) => ({
                    ...item,
                    uploaded:
                      files.find((file) => file.fileId === item.fileId)
                        ?.uploaded || false,
                  })),
                }
              : current
          );
        },
      });

      setDraft((current) =>
        current ? { ...current, stage: "classifying" } : current
      );
      await updateSmartUploadDraft(userId, kind, { stage: "classifying" });
      const started = await startSmartUploadDetection(kind, session.sessionId);
      setGrouping(started);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const detected = await waitForSmartUploadGrouping({
        kind,
        sessionId: session.sessionId,
        signal: controller.signal,
        onProgress: setGrouping,
      });
      setGrouping(detected);
      setDraft((current) =>
        current ? { ...current, stage: "review" } : current
      );
      await updateSmartUploadDraft(userId, kind, { stage: "review" });
    } catch (uploadError) {
      if ((uploadError as { name?: string })?.name === "AbortError") return;
      const message = getSmartUploadError(uploadError);
      setError(message);
      setDraft((current) =>
        current ? { ...current, stage: "failed" } : current
      );
      await updateSmartUploadDraft(userId, kind, { stage: "failed" }).catch(
        () => undefined
      );
    }
  }, [draft, kind, onSubmitted, userId]);

  const toggleDivider = useCallback(
    async (fileId: string) => {
      if (!draft?.sessionId || !grouping || busyFileId) return;
      const next = new Set(grouping.dividerFileIds);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      setBusyFileId(fileId);
      setError(null);
      try {
        const updated = await updateSmartUploadDividers({
          kind,
          sessionId: draft.sessionId,
          dividerFileIds: [...next],
        });
        setGrouping(updated);
      } catch (updateError) {
        setError(getSmartUploadError(updateError));
      } finally {
        setBusyFileId(null);
      }
    },
    [busyFileId, draft?.sessionId, grouping, kind]
  );

  const createPreview = useCallback(async () => {
    if (!draft?.sessionId || !grouping) return;
    try {
      setError(null);
      setDraft((current) =>
        current ? { ...current, stage: "submitting" } : current
      );
      await updateSmartUploadDraft(userId, kind, { stage: "submitting" });
      await updateSmartUploadDividers({
        kind,
        sessionId: draft.sessionId,
        dividerFileIds: grouping.dividerFileIds,
        confirm: true,
      });
      const result = await completeSmartUpload(kind, draft.sessionId);
      await deleteSmartUploadDraft(userId, kind);
      setDraft(null);
      setGrouping(null);
      await onSubmitted(result);
    } catch (submitError) {
      setError(getSmartUploadError(submitError));
      setDraft((current) =>
        current ? { ...current, stage: "review" } : current
      );
      await updateSmartUploadDraft(userId, kind, { stage: "review" }).catch(
        () => undefined
      );
    }
  }, [draft?.sessionId, grouping, kind, onSubmitted, userId]);

  const discard = useCallback(async () => {
    if (!draft || discarding) return;
    setDiscarding(true);
    setError(null);
    try {
      abortRef.current?.abort();
      if (draft.sessionId) {
        await cancelSmartUpload(kind, draft.sessionId);
      }
      await deleteSmartUploadDraft(userId, kind);
      setDraft(null);
      setGrouping(null);
      setProgress(null);
    } catch (discardError) {
      setError(getSmartUploadError(discardError));
    } finally {
      setDiscarding(false);
    }
  }, [discarding, draft, kind, userId]);

  if (!mounted || !open) return null;

  const totalBytes =
    progress?.totalBytes ||
    draft?.files.reduce((sum, item) => sum + item.size, 0) ||
    0;
  const uploadedBytes =
    progress?.uploadedBytes ||
    draft?.files.reduce(
      (sum, item) => sum + (item.uploaded ? item.size : 0),
      0
    ) ||
    0;
  const uploadPercent = totalBytes
    ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
    : 0;
  const stagePercent =
    draft?.stage === "classifying"
      ? grouping?.progressPercent || 0
      : draft?.stage === "review"
        ? 100
        : uploadPercent;
  const hasInvalidGroups =
    !grouping?.groups.length ||
    grouping.groups.some((group) => group.overLimit);

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex flex-col bg-[var(--app-bg)] text-[var(--app-text)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`smart-upload-${kind}-title`}
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={requestClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] hover:bg-[var(--app-panel-alt)]"
            aria-label="Close Smart Upload"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2
              id={`smart-upload-${kind}-title`}
              className="truncate text-lg font-bold sm:text-xl"
            >
              Smart Upload
            </h2>
            <p className="truncate text-xs text-[var(--app-text-muted)] sm:text-sm">
              Black images separate Bundle lots automatically.
            </p>
          </div>
        </div>
        {draft ? (
          <button
            type="button"
            onClick={() => void discard()}
            disabled={active || discarding}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--app-danger-border)] px-3 text-sm font-semibold text-[var(--app-danger)] disabled:opacity-50"
          >
            {discarding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Discard upload</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={requestClose}
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--app-control-border)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-6">
          {error ? (
            <div
              className="flex items-start justify-between gap-4 rounded-md border border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]"
              role="alert"
            >
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {loadingDraft ? (
            <div className="grid min-h-[50vh] place-items-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--app-accent)]" />
                <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                  Restoring Smart Upload...
                </p>
              </div>
            </div>
          ) : !draft ? (
            <section
              className={`grid min-h-[58vh] place-items-center rounded-lg border-2 border-dashed px-5 py-12 text-center transition ${
                dragActive
                  ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                  : "border-[var(--app-control-border)] bg-[var(--app-panel)]"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                void selectFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <div className="max-w-xl">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-2xl font-bold">Drop all lot images here</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
                  Keep one black image between lots. Original selection order is
                  preserved even while files upload in parallel.
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  multiple
                  hidden
                  onChange={(event) => {
                    void selectFiles(Array.from(event.target.files || []));
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--app-accent)] px-5 text-sm font-bold text-white hover:brightness-95"
                >
                  <CloudUpload className="h-5 w-5" />
                  Select images
                </button>
                <p className="mt-4 text-xs text-[var(--app-text-muted)]">
                  JPEG, PNG, WebP, HEIC, and HEIF. Up to 200 report photos per
                  detected lot.
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-4 border-b border-[var(--app-border)] pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-md bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent)]">
                      {active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : draft.stage === "review" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <ScanLine className="h-3.5 w-3.5" />
                      )}
                      {progressLabel(draft.stage)}
                    </span>
                    <span className="text-sm text-[var(--app-text-muted)]">
                      {draft.files.length.toLocaleString()} images -{" "}
                      {formatBytes(totalBytes)}
                    </span>
                  </div>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--app-control-border)]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(stagePercent)}
                  >
                    <div
                      className="h-full bg-[var(--app-accent)] transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, stagePercent))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    {draft.stage === "uploading"
                      ? `${progress?.uploadedFiles || 0} of ${draft.files.length} files confirmed - ${uploadPercent}% by bytes`
                      : draft.stage === "classifying"
                        ? `${Math.round(grouping?.progressPercent || 0)}% classified`
                        : draft.stage === "review"
                          ? `${grouping?.groups.length || 0} lots detected - ${grouping?.dividerFileIds.length || 0} dividers excluded`
                          : "Ready to upload in the order selected"}
                  </p>
                </div>
                {draft.stage === "selected" || draft.stage === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void runUploadAndDetection()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--app-accent)] px-5 text-sm font-bold text-white"
                  >
                    <ScanLine className="h-5 w-5" />
                    {draft.stage === "failed" ? "Resume upload" : "Upload & detect lots"}
                  </button>
                ) : null}
              </section>

              {grouping?.groups.length ? (
                <section aria-labelledby="detected-lots-heading">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 id="detected-lots-heading" className="text-lg font-bold">
                        Detected lots
                      </h3>
                      <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                        Tap any image below to add or remove a divider.
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {grouping.groups.length} lot
                      {grouping.groups.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {grouping.groups.map((group) => (
                      <article
                        key={group.groupIndex}
                        className={`overflow-hidden rounded-md border bg-[var(--app-panel)] ${
                          group.overLimit
                            ? "border-[var(--app-danger)]"
                            : "border-[var(--app-border)]"
                        }`}
                      >
                        <div className="grid h-28 grid-cols-4 bg-[var(--app-panel-alt)]">
                          {group.fileIds.slice(0, 4).map((fileId) => {
                            const file = fileById.get(fileId);
                            return file ? (
                              <ImagePreview
                                key={fileId}
                                file={file}
                                alt=""
                                className="h-full w-full border-r border-[var(--app-border)] object-cover last:border-r-0"
                              />
                            ) : null;
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-3 px-3 py-3">
                          <div>
                            <p className="font-bold">Lot {group.groupIndex + 1}</p>
                            <p className="text-xs text-[var(--app-text-muted)]">
                              {group.imageCount} photos - Bundle
                            </p>
                          </div>
                          {group.overLimit ? (
                            <span className="rounded bg-[var(--app-danger-soft)] px-2 py-1 text-xs font-bold text-[var(--app-danger)]">
                              Add divider
                            </span>
                          ) : (
                            <Check className="h-5 w-5 text-emerald-600" />
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {grouping?.groupingStatus === "review_ready" ||
              grouping?.groupingStatus === "confirmed" ? (
                <section aria-labelledby="sequence-heading">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 id="sequence-heading" className="text-lg font-bold">
                        Upload sequence
                      </h3>
                      <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                        Black dividers are removed from the report.
                      </p>
                    </div>
                    <Split className="h-5 w-5 text-[var(--app-text-muted)]" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10">
                    {visibleFiles.map((item) => {
                      const isDivider = dividerSet.has(item.fileId);
                      const isBusy = busyFileId === item.fileId;
                      return (
                        <button
                          key={item.fileId}
                          type="button"
                          onClick={() => void toggleDivider(item.fileId)}
                          disabled={Boolean(busyFileId)}
                          className={`group relative aspect-square overflow-hidden rounded-md border-2 bg-[var(--app-panel-alt)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-ring)] ${
                            isDivider
                              ? "border-[var(--app-accent)]"
                              : "border-transparent"
                          }`}
                          aria-pressed={isDivider}
                          aria-label={`${item.name}. ${
                            isDivider ? "Remove divider" : "Use as divider"
                          }`}
                        >
                          <ImagePreview
                            file={item.file}
                            alt=""
                            className={`h-full w-full object-cover transition ${
                              isDivider ? "opacity-35" : ""
                            }`}
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {item.originalOrder + 1}
                          </span>
                          {isDivider ? (
                            <span className="absolute inset-x-1 top-1 rounded bg-[var(--app-accent)] px-1 py-1 text-[10px] font-bold uppercase text-white">
                              Divider
                            </span>
                          ) : null}
                          {isBusy ? (
                            <span className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {visibleLimit < draft.files.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleLimit((current) =>
                          Math.min(draft.files.length, current + VISIBLE_IMAGE_BATCH)
                        )
                      }
                      className="mt-4 min-h-10 rounded-md border border-[var(--app-control-border)] px-4 text-sm font-semibold"
                    >
                      Show next{" "}
                      {Math.min(
                        VISIBLE_IMAGE_BATCH,
                        draft.files.length - visibleLimit
                      )}{" "}
                      images
                    </button>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>

      {draft?.stage === "review" && grouping ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 sm:px-6">
          <p
            className={`text-sm ${
              hasInvalidGroups
                ? "font-semibold text-[var(--app-danger)]"
                : "text-[var(--app-text-muted)]"
            }`}
          >
            {hasInvalidGroups
              ? grouping.warnings[0] || "Keep at least one report image."
              : `${grouping.groups.length} Bundle lots are ready for preview.`}
          </p>
          <button
            type="button"
            onClick={() => void createPreview()}
            disabled={hasInvalidGroups || Boolean(busyFileId)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--app-accent)] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-5 w-5" />
            Create preview
          </button>
        </footer>
      ) : null}
    </div>,
    document.body
  );
}
