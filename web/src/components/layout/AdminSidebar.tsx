"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Puzzle, Users, ScrollText, Activity } from "lucide-react";
import { cn } from "@kleffio/ui";
import { SidebarUserFooter } from "./SidebarUserFooter";

const ADMIN_NAV = [
  { href: "/admin-panel",             label: "Dashboard",      icon: LayoutDashboard },
  { href: "/admin-panel/plugins",     label: "Plugins",        icon: Puzzle },
  { href: "/admin-panel/monitoring",  label: "Infrastructure", icon: Activity },
  { href: "/admin-panel/members",     label: "Members",        icon: Users },
  { href: "/admin-panel/audit",       label: "Audit Log",      icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col bg-sidebar border-r border-sidebar-border">

      {/* Section label */}
      <div className="px-2 pt-3 pb-2">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/15 ring-1 ring-destructive/20">
            <span className="text-sm font-black text-destructive leading-none">A</span>
          </div>
          <span className="text-xs font-semibold text-sidebar-foreground">Admin</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-px px-2 py-1 overflow-y-auto">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin-panel" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
                active
                  ? "bg-white/[0.07] text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/50 hover:bg-white/[0.04] hover:text-sidebar-foreground/80"
              )}
            >
              <span className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md transition-all",
                active
                  ? "bg-destructive/20 text-destructive shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                  : "bg-white/[0.04] text-sidebar-foreground/40"
              )}>
                <Icon className="size-3.5" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <SidebarUserFooter workspaceHref="/" />
    </aside>
  );
}
