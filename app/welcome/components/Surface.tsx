import type { CSSProperties, ReactNode } from "react";

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function Surface({ children, className = "", style }: SurfaceProps) {
  return (
    <div
      className={`rounded-lg border bg-[var(--welcome-surface)] shadow-[var(--welcome-shadow)] ${className}`}
      style={{
        borderColor: "var(--welcome-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
