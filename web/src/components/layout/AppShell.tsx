"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@kleffio/ui";
import { AdminShell } from "./AdminShell";
import { PersonalHubSidebar } from "./PersonalHubSidebar";

const SYSTEM_ROOTS = new Set(["settings", "orgs", "ns", "ns-invite", "env-invite", "invite", "account", "admin-panel", "dashboard", "new"]);
const NS_MGMT_PAGES = new Set(["environments", "members", "settings", "roles", "monitoring", "new"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "admin-panel") {
    return <AdminShell>{children}</AdminShell>;
  }

  const isEnvContext =
    segments.length >= 2 &&
    !SYSTEM_ROOTS.has(segments[0] ?? "") &&
    !NS_MGMT_PAGES.has(segments[1] ?? "");

  // Canvas and services list need overflow-hidden so they can fill the viewport
  const isCanvasOrServices =
    isEnvContext && segments[2] === "canvas";

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 0% 0%, oklch(0.8 0.17 90 / 0.04), transparent 70%)",
        }}
      />
      <div className="relative z-10 shrink-0">
        <PersonalHubSidebar />
      </div>
      <main
        className={cn(
          "relative z-10 flex-1 min-w-0",
          isCanvasOrServices ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        {children}
      </main>
    </div>
  );
}
