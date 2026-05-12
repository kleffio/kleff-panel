"use client";

import { useContext, type ElementType } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  ShieldCheck,
  LogOut,
  ChevronsUpDown,
  SunMoon,
  BookOpen,
  HelpCircle,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@kleffio/ui";
import { useAuth, broadcastSignout, useHasRole, AuthConfigContext } from "@/features/auth";
import { getMyProfile } from "@/lib/api/profiles";
import { useNotificationStream } from "@/features/notifications";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { revokeSession } from "@/lib/api/plugins";

function StubItem({ icon: Icon, label }: { icon: ElementType; label: string }) {
  return (
    <DropdownMenuItem disabled className="gap-2 opacity-40 cursor-not-allowed">
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      <span className="flex items-center h-[14px] px-1.5 rounded-full border border-white/[0.1] text-[9px] font-bold text-white/30 tracking-wide uppercase leading-none">
        Soon
      </span>
    </DropdownMenuItem>
  );
}

export function SidebarUserFooter({ workspaceHref = "/" }: { workspaceHref?: string }) {
  const router = useRouter();
  const auth = useAuth();
  const authConfig = useContext(AuthConfigContext);
  const isAdmin = useHasRole("admin");

  // SSE stream — owned here so both the bell badge and the popover stay in sync.
  useNotificationStream();

  const user = auth.user;
  const displayName = user?.profile?.name ?? user?.profile?.email ?? "User";
  const initial = displayName[0]?.toUpperCase() ?? "U";

  const { data: profileData } = useQuery({
    queryKey: ["users", "me"],
    queryFn: getMyProfile,
  });
  const avatarUrl = profileData?.data?.avatar_url;

  async function handleSignOut() {
    if (authConfig?.auth_mode === "redirect") {
      broadcastSignout();
      auth.signoutRedirect();
    } else {
      const sid = auth.user?.profile?.sid as string | undefined;
      if (sid) {
        try {
          await revokeSession(sid);
        } catch {
          // best-effort — still clear local session
        }
      }
      broadcastSignout();
      auth.removeUser();
      router.push("/auth/login");
    }
  }

  return (
    <div className="border-t border-sidebar-border px-2 py-2">
      <div className="flex items-center gap-1">
        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.05] focus-visible:outline-none">
              <Avatar size="sm" className="shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold ring-1 ring-primary/20">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-left text-xs font-medium text-sidebar-foreground/60">
                {displayName}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/25" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52 mb-1">
            <DropdownMenuItem onClick={() => router.push("/account/profile")}>
              <Settings className="size-4" />
              <span className="flex-1">Account settings</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => router.push("/admin-panel")}>
                <ShieldCheck className="size-4" />
                Admin panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <StubItem icon={SunMoon} label="Theme" />
            <StubItem icon={BookOpen} label="Changelog" />
            <StubItem icon={HelpCircle} label="Help & Docs" />
            <StubItem icon={Activity} label="Platform Status" />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification bell */}
        <NotificationBell />
      </div>
    </div>
  );
}
