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
      ? "h-16 w-[4.5rem] sm:h-[4.5rem] sm:w-20"
      : "h-14 w-16";

  return (
    <div
      ref={frameRef}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-alt)] ${frameSize}`}
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
          width={size === "card" ? 80 : 64}
          height={size === "card" ? 72 : 56}
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
