import { Box } from "lucide-react";

export default function BrandLockup({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center ${
        compact ? "gap-2.5" : "gap-3"
      }`}
      aria-label="Asset Insight"
      role="img"
    >
      <span
        className={`grid shrink-0 place-items-center ${
          compact ? "size-9" : "size-10"
        } ${inverse ? "text-white" : "text-[var(--app-accent)]"}`}
        aria-hidden="true"
      >
        <Box
          className="size-full"
          strokeWidth={1.7}
        />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span
          className={`whitespace-nowrap font-bold leading-none tracking-[-0.035em] ${
            compact ? "text-[1rem]" : "text-[1.15rem]"
          } ${inverse ? "text-white" : "text-[var(--app-text-strong)]"}`}
        >
          Asset Insight
        </span>
        {!compact ? (
          <span
            className={`whitespace-nowrap text-[0.7rem] font-medium leading-none ${
              inverse ? "text-white/70" : "text-[var(--app-text-muted)]"
            }`}
          >
            Enterprise workspace
          </span>
        ) : null}
      </span>
    </span>
  );
}
