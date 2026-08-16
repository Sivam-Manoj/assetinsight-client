"use client";

import { SendHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { supportFileKey } from "@/lib/supportFiles";
import { SupportService } from "@/services/support";
import SupportFilePicker from "./SupportFilePicker";
import styles from "./Support.module.css";

function createClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type PreparedAttachments = {
  fileSignature: string;
  attachmentIds: string[];
  failedCount: number;
};

function signatureFor(files: File[]) {
  return files.map(supportFileKey).join("|");
}

export default function SupportComposer({
  conversationId,
  disabled = false,
  onSent,
}: {
  conversationId: string;
  disabled?: boolean;
  onSent: () => Promise<void> | void;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const clientMessageIdRef = useRef<string | null>(null);
  const preparedRef = useRef<PreparedAttachments | null>(null);

  const resetPreparedSubmission = () => {
    clientMessageIdRef.current = null;
    preparedRef.current = null;
    setUploadProgress(0);
  };

  const submit = async () => {
    const message = body.trim();
    if ((!message && !files.length) || submitting || disabled) return;
    setSubmitting(true);
    setError(null);
    const fileSignature = signatureFor(files);

    try {
      let prepared = preparedRef.current;
      if (!prepared || prepared.fileSignature !== fileSignature) {
        const upload = await SupportService.uploadAttachments(
          conversationId,
          files,
          setUploadProgress
        );
        prepared = {
          fileSignature,
          attachmentIds: upload.attachmentIds,
          failedCount: upload.failures.length,
        };
        preparedRef.current = prepared;
      }
      if (!message && !prepared.attachmentIds.length) {
        throw new Error("No attachments could be uploaded. Choose another file and try again.");
      }

      clientMessageIdRef.current ||= createClientMessageId();
      await SupportService.sendMessage(conversationId, {
        body: message,
        attachmentIds: prepared.attachmentIds,
        clientMessageId: clientMessageIdRef.current,
      });

      const failedCount = prepared.failedCount;
      setBody("");
      setFiles([]);
      resetPreparedSubmission();
      await onSent();
      if (failedCount) {
        toast.warning(
          `Message sent, but ${failedCount} attachment${failedCount === 1 ? "" : "s"} could not be uploaded.`
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your reply could not be sent. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <div className="app-alert app-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {submitting && files.length ? (
        <div className={styles.uploadProgress} role="status" aria-live="polite">
          <span style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
          <small>Securing attachments… {Math.round(uploadProgress * 100)}%</small>
        </div>
      ) : null}
      <label className="sr-only" htmlFor="support-reply">
        Reply to support
      </label>
      <textarea
        id="support-reply"
        className={`app-field ${styles.composerInput}`}
        value={body}
        rows={3}
        maxLength={12_000}
        placeholder={disabled ? "This conversation is closed." : "Write a reply…"}
        disabled={disabled || submitting}
        onChange={(event) => {
          setBody(event.target.value);
          setError(null);
          // A changed message needs a new idempotency key. Confirmed file ids
          // remain reusable, avoiding duplicate R2 objects after a send timeout.
          clientMessageIdRef.current = null;
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className={styles.composerActions}>
        <SupportFilePicker
          files={files}
          compact
          disabled={disabled || submitting}
          onChange={(nextFiles) => {
            setFiles(nextFiles);
            resetPreparedSubmission();
          }}
          onError={setError}
        />
        <div className={styles.sendGroup}>
          <span className={styles.sendHint}>Ctrl/⌘ + Enter</span>
          <button
            type="submit"
            className="app-button app-button--primary"
            disabled={
              disabled || submitting || (!body.trim() && !files.length)
            }
          >
            <SendHorizontal size={16} aria-hidden />
            {submitting ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </form>
  );
}
