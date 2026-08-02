"use client";

import { FileText, History, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SavedInputService,
  type AssetFormData,
  type FormType,
  type RealEstateFormData,
  type SavedInput,
} from "@/services/savedInputs";
import { toast } from "@/components/ui/toast";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onLoadInput: (savedInput: SavedInput) => void;
  formType?: FormType;
};

export default function InputsHistoryModal({
  isOpen,
  onClose,
  onLoadInput,
  formType,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [savedInputs, setSavedInputs] = useState<SavedInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      void fetchSavedInputs();
    }
    // fetchSavedInputs intentionally reads the latest formType whenever the modal opens.

  }, [isOpen, formType]);

  const fetchSavedInputs = async () => {
    try {
      setLoading(true);
      const inputs = await SavedInputService.getAll(formType);
      setSavedInputs(inputs);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      setDeleting(id);
      await SavedInputService.delete(id);
      setSavedInputs((prev) => prev.filter((item) => item._id !== id));
      toast.success("Deleted successfully");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  const handleLoad = (savedInput: SavedInput) => {
    onLoadInput(savedInput);
    onClose();
    router.push("/dashboard");
    window.setTimeout(() => {
      const eventName =
        savedInput.formType === "realEstate"
          ? "load-realestate-input"
          : "load-saved-input";
      window.dispatchEvent(new CustomEvent(eventName, { detail: savedInput }));
    }, 300);
  };

  const totalLabel = useMemo(
    () =>
      `${savedInputs.length} saved ${
        savedInputs.length === 1 ? "entry" : "entries"
      }`,
    [savedInputs.length]
  );

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  };

  const renderSummary = (item: SavedInput) => {
    const asset = item.formData as AssetFormData;
    const realEstate = item.formData as RealEstateFormData;
    return (
      <div style={{ display: "grid", gap: 3 }}>
        {asset.clientName ? (
          <span className="app-muted">Client: {asset.clientName}</span>
        ) : null}
        {asset.contractNo ? (
          <span className="app-muted">Contract: {asset.contractNo}</span>
        ) : null}
        {realEstate.property_details?.address ? (
          <span className="app-muted">
            Address: {realEstate.property_details.address}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="drafts-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        width: "min(760px, calc(100% - 32px))",
        padding: 0,
        color: "var(--app-text)",
      }}
    >
      <header
        className="app-dialog__header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              borderRadius: 8,
              background: "var(--app-accent-soft)",
              color: "var(--app-accent)",
            }}
          >
            <History size={21} />
          </span>
          <div>
            <h2
              id="drafts-dialog-title"
              style={{ margin: 0, fontSize: "1.05rem", fontWeight: 750 }}
            >
              Drafts
            </h2>
            <p className="app-muted" style={{ margin: "3px 0 0", fontSize: 13 }}>
              {totalLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="app-button app-button--icon"
          onClick={onClose}
          aria-label="Close drafts"
          autoFocus
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="app-dialog__body" style={{ padding: 16 }}>
        {loading ? (
          <div
            className="app-muted"
            role="status"
            style={{ minHeight: 180, display: "grid", placeItems: "center" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span className="app-spinner" aria-hidden />
              Loading saved drafts…
            </span>
          </div>
        ) : savedInputs.length === 0 ? (
          <div
            style={{
              minHeight: 260,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
            }}
          >
            <div>
              <span
                aria-hidden
                style={{
                  width: 56,
                  height: 56,
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 14px",
                  borderRadius: 8,
                  background: "var(--app-panel-alt)",
                  color: "var(--app-text-muted)",
                }}
              >
                <FileText size={25} />
              </span>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>No saved drafts yet</h3>
              <p className="app-muted" style={{ margin: "7px 0 0" }}>
                Drafts will appear here so you can resume work quickly.
              </p>
            </div>
          </div>
        ) : (
          <ul
            aria-label="Saved drafts"
            style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}
          >
            {savedInputs.map((item) => (
              <li
                key={item._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "stretch",
                  border: "1px solid var(--app-border)",
                  borderRadius: 8,
                  background: "var(--app-panel)",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleLoad(item)}
                  style={{
                    minWidth: 0,
                    padding: 14,
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span
                      className={`app-chip ${
                        item.formType === "realEstate"
                          ? "app-chip--success"
                          : "app-chip--info"
                      }`}
                    >
                      {item.formType === "realEstate" ? "Real Estate" : "Asset"}
                    </span>
                  </span>
                  <span
                    style={{
                      display: "grid",
                      gap: 7,
                      marginTop: 9,
                      fontSize: 13,
                    }}
                  >
                    {renderSummary(item)}
                    <span className="app-muted">
                      Saved {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="app-button app-button--icon app-button--danger"
                  onClick={() => void handleDelete(item._id, item.name)}
                  disabled={deleting === item._id}
                  aria-label={`Delete ${item.name}`}
                  style={{
                    alignSelf: "center",
                    marginRight: 12,
                    borderColor: "transparent",
                  }}
                >
                  {deleting === item._id ? (
                    <span className="app-spinner" aria-hidden />
                  ) : (
                    <Trash2 size={17} aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="app-dialog__footer">
        <button
          type="button"
          className="app-button app-button--secondary"
          onClick={onClose}
        >
          Close
        </button>
      </footer>
    </dialog>
  );
}
