"use client";

import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Loading from "@/components/common/Loading";
import type { DraftStatus } from "@/components/forms/ui/FormUI";
import {
  consumeReportFormHandoff,
  type ReportFormHandoff,
  type ReportFormKind,
} from "@/services/reportFormNavigation";
import styles from "./ReportFormPage.module.css";

const AssetForm = dynamic(() => import("@/components/forms/AssetForm"), {
  ssr: false,
  loading: () => <Loading message="Loading asset workspace…" />,
});
const LotListingForm = dynamic(
  () => import("@/components/forms/LotListingForm"),
  {
    ssr: false,
    loading: () => <Loading message="Loading lot listing workspace…" />,
  }
);

type Props = {
  kind: ReportFormKind;
};

export default function ReportFormPage({ kind }: Props) {
  const router = useRouter();
  const [handoff, setHandoff] = useState<ReportFormHandoff | null | undefined>();
  const [draftStatus, setDraftStatus] = useState<{
    status: DraftStatus;
    label?: string;
  } | null>(null);

  useEffect(() => {
    setHandoff(consumeReportFormHandoff(kind));
  }, [kind]);

  const returnTo = handoff?.returnTo || "/dashboard";
  const title = kind === "asset" ? "Asset Report" : "Lot Listing";
  const statusLabel =
    draftStatus?.label ||
    (draftStatus?.status === "saving"
      ? "Saving draft…"
      : draftStatus?.status === "saved"
        ? "Draft saved"
        : draftStatus?.status === "dirty"
          ? "Unsaved changes"
          : "Draft status");

  const complete = () => {
    window.dispatchEvent(new Event("cv:report-created"));
    router.push("/previews");
  };

  if (handoff === undefined) {
    return (
      <div className={styles.loading}>
        <Loading message={`Opening ${title.toLowerCase()}…`} />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <p className={styles.eyebrow}>Report workspace</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>
            Complete details, organize media, and save or submit when ready.
          </p>
        </div>
        <div className={styles.actions}>
          {draftStatus ? (
            <span
              className={styles.draftStatus}
              data-status={draftStatus.status}
              title={statusLabel}
            >
              {statusLabel}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={17} aria-hidden />
            <span className={styles.backLabel}>Back to dashboard</span>
          </button>
        </div>
      </header>

      <section className={styles.body} aria-label={`${title} form`}>
        {kind === "asset" ? (
          <AssetForm
            onSuccess={complete}
            onCancel={() => router.push(returnTo)}
            auctioneer={handoff?.auctioneer}
            initialSavedInput={handoff?.savedInput}
            resumeDraft={
              handoff?.resumeDraft?.type === "asset"
                ? handoff.resumeDraft
                : null
            }
            restoreDraftOnMount={Boolean(handoff?.resumeLocalDraftScopeId)}
            resumeLocalDraftScopeId={handoff?.resumeLocalDraftScopeId}
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        ) : (
          <LotListingForm
            onSuccess={complete}
            onCancel={() => router.push(returnTo)}
            auctioneer={handoff?.auctioneer}
            resumeDraft={
              handoff?.resumeDraft?.type === "lotListing"
                ? handoff.resumeDraft
                : null
            }
            restoreDraftOnMount={Boolean(handoff?.resumeLocalDraftScopeId)}
            resumeLocalDraftScopeId={handoff?.resumeLocalDraftScopeId}
            onDraftStatusChange={(status, label) =>
              setDraftStatus({ status, label })
            }
          />
        )}
      </section>
    </main>
  );
}
