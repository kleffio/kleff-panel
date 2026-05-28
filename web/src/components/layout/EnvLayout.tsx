"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@kleffio/ui";

export function EnvLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const isCanvas = segments[2] === "canvas";
  const isServicesList = segments.length === 2;

  return (
    <div className={cn(
      "h-full w-full",
      (isCanvas || isServicesList) ? "overflow-hidden" : "overflow-y-auto"
    )}>
      {children}
    </div>
  );
}
