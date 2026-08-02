import Image from "next/image";

export default function BrandLockup({
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex">
      <Image
        src="/brand/asset-insight-light-compact.png"
        alt="Asset Insight"
        width={298}
        height={96}
        priority
        className={`asset-insight-brand-image ${
          compact ? "w-[120px] sm:w-[140px]" : "w-[150px] sm:w-[184px]"
        } h-auto`}
      />
      <style>{`
        [data-theme="dark"] .asset-insight-brand-image {
          content: url("/brand/asset-insight-dark-compact.png");
        }
      `}</style>
    </span>
  );
}
