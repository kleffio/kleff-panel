"use client";

import { useContext, type ElementType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Settings,
  ShieldCheck,
  LogOut,
  SunMoon,
  BookOpen,
  HelpCircle,
  Activity,
} from "lucide-react";
import Image from "next/image";
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
import { listNamespaces } from "@/lib/api/namespaces";
import { getMyProfile } from "@/lib/api/profiles";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { useNotificationStream } from "@/features/notifications";
import { revokeSession } from "@/lib/api/plugins";

const SYSTEM_ROOTS = new Set(["settings", "orgs", "ns", "ns-invite", "env-invite", "invite", "account", "admin-panel", "dashboard", "new"]);

const PAGE_LABELS: Record<string, string> = {
  servers: "Servers",
  canvas: "Canvas",
  monitoring: "Monitoring",
  settings: "Settings",
  members: "Members",
  roles: "Roles",
  stacks: "Stacks",
  profile: "Profile",
  security: "Security",
  sessions: "Sessions",
  notifications: "Notifications",
  variables: "Variables",
};

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

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const authConfig = useContext(AuthConfigContext);
  const isAdmin = useHasRole("admin");

  useNotificationStream();

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] ?? "";
  const isSystemRoot = SYSTEM_ROOTS.has(firstSegment);

  const namespacesQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
  });
  const namespaces = namespacesQuery.data?.namespaces ?? [];

  const { data: profileData } = useQuery({
    queryKey: ["users", "me"],
    queryFn: getMyProfile,
  });
  const avatarUrl = profileData?.data?.avatar_url;

  const user = auth.user;
  const displayName = user?.profile?.name ?? user?.profile?.email ?? "User";
  const initial = displayName[0]?.toUpperCase() ?? "U";

  let namespaceName = "";
  let namespaceAvatarUrl: string | null = null;
  let namespaceInitial = "";
  let pageLabel = "";

  if (!isSystemRoot && firstSegment) {
    const currentNs = namespaces.find((ns) => ns.slug === firstSegment);
    namespaceName = currentNs?.name ?? firstSegment;
    namespaceAvatarUrl = currentNs?.avatar_url ?? null;
    namespaceInitial = (currentNs?.name?.[0] ?? firstSegment[0] ?? "?").toUpperCase();

    const seg1 = segments[1];
    if (seg1 === "stacks" && segments[2]) {
      pageLabel = segments[2];
      if (segments[3] && PAGE_LABELS[segments[3]]) {
        pageLabel = `${segments[2]} / ${PAGE_LABELS[segments[3]]}`;
      }
    } else if (seg1 && PAGE_LABELS[seg1]) {
      if (seg1 === "settings" && segments[2] && PAGE_LABELS[segments[2]]) {
        pageLabel = PAGE_LABELS[segments[2]];
      } else {
        pageLabel = PAGE_LABELS[seg1];
      }
    }
  } else if (firstSegment === "account") {
    const username =
      (auth.user?.profile?.preferred_username as string | undefined) ??
      (auth.user?.profile?.sub as string | undefined) ??
      displayName;
    namespaceName = username;
    pageLabel = segments[1] ? (PAGE_LABELS[segments[1]] ?? capitalize(segments[1])) : "Account";
  }

  async function handleSignOut() {
    if (authConfig?.auth_mode === "redirect") {
      broadcastSignout();
      auth.signoutRedirect();
    } else {
      const sid = auth.user?.profile?.sid as string | undefined;
      if (sid) {
        try { await revokeSession(sid); } catch { /* best-effort */ }
      }
      broadcastSignout();
      auth.removeUser();
      router.push("/auth/login");
    }
  }

  return (
    <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/[0.05] bg-background/80 backdrop-blur-sm">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        {namespaceName && (
          <>
            <div className="flex size-5 shrink-0 items-center justify-center rounded-md overflow-hidden bg-primary/10 ring-1 ring-primary/20">
              {namespaceAvatarUrl ? (
                <Image src={namespaceAvatarUrl} alt={namespaceName} width={20} height={20} className="size-full object-cover" unoptimized />
              ) : (
                <span className="text-[10px] font-black text-primary leading-none">{namespaceInitial}</span>
              )}
            </div>
            <span className="font-medium text-white/70">{namespaceName}</span>
            {pageLabel && (
              <>
                <span className="text-white/20 mx-0.5">/</span>
                <span className="text-white/40">{pageLabel}</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Right: bell + divider + avatar */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <div className="w-px h-4 bg-white/[0.08]" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center rounded-full focus-visible:outline-none hover:ring-2 hover:ring-white/10 transition-all">
              <Avatar size="sm">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold ring-1 ring-primary/20">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-52 mt-1">
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
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
