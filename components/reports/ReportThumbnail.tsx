"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";

type ReportThumbnailProps = {
  src?: string | null;
  title: string;
  size?: "card" | "table";
};

export function ReportThumbnail({
  src,
  title,
  size = "table",
}: ReportThumbnailProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setShouldLoad(false);

    if (!src) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const frame = frameRef.current;
    if (!frame) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      {
        rootMargin: "320px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(frame);
    return () => observer.disconnect();
  }, [src]);

  const hasImage = Boolean(src && shouldLoad && !failed);
  const frameSize =
    size === "card"
      ? "h-[5.25rem] w-28 sm:h-24 sm:w-32"
      : "h-14 w-[4.75rem]";

  return (
    <div
      ref={frameRef}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-alt)] ${frameSize}`}
      aria-label={
        !src || failed ? `No preview image available for ${title}` : undefined
      }
    >
      <FileImage
        aria-hidden="true"
        className="size-5 text-[var(--app-text-muted)]"
      />
      {hasImage ? (
        <img
          src={src || undefined}
          alt={`Preview image for ${title}`}
          width={size === "card" ? 128 : 76}
          height={size === "card" ? 96 : 56}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
