"use client";

import { useRef, type ReactNode } from "react";
import { InteractiveDotField } from "@kleffio/ui";

export function ArchitectureThemeShell({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayDotColor = "rgba(245, 181, 23, 0.24)";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-background text-foreground"
    >
      <InteractiveDotField containerRef={containerRef} overlayDotColor={overlayDotColor} />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
