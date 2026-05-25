"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { useUnreadCount } from "@/features/notifications";
import { Bell, LayoutDashboard, UserCircle } from "lucide-react";
import { cn } from "@kleffio/ui";
import { SidebarUserFooter } from "./SidebarUserFooter";

const ACCOUNT_NAV = [
  { href: "/account",                label: "Home",          icon: LayoutDashboard },
  { href: "/account/profile",        label: "Profile",       icon: UserCircle },
  { href: "/account/notifications",  label: "Notifications", icon: Bell },
];

export function PersonalHubSidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const { projects, currentProjectID } = useCurrentProject();

  const username = (auth.user?.profile?.preferred_username as string | undefined)
    ?? (auth.user?.profile?.sub as string | undefined)
    ?? "user";

  const { data: unreadCount = 0 } = useUnreadCount();

  const currentProject = projects.find((p) => p.id === currentProjectID);
  const workspaceHref = currentProject
    ? `/project/${username}/${currentProject.slug}`
    : "/";

  return (
    <aside className="flex h-full w-56 flex-col bg-sidebar border-r border-sidebar-border">

      {/* Section label */}
      <div className="px-2 pt-3 pb-2">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/20">
            <span className="text-sm font-black text-primary leading-none">A</span>
          </div>
          <span className="text-xs font-semibold text-sidebar-foreground truncate">{username}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-px px-2 py-1 overflow-y-auto">
        {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/account"
            ? pathname === "/account"
            : pathname === href || pathname.startsWith(`${href}/`);
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
                  ? "bg-primary/20 text-primary shadow-[0_0_10px_oklch(0.80_0.17_90_/_0.2)]"
                  : "bg-white/[0.04] text-sidebar-foreground/40"
              )}>
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1">{label}</span>
              {href === "/account/notifications" && unreadCount > 0 && (
                <span className="flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <SidebarUserFooter workspaceHref={workspaceHref} />
    </aside>
  );
}
