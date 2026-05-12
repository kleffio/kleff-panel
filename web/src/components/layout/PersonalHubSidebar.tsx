"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { listNamespaces, listEnvironments, listSharedProjects } from "@/lib/api/namespaces";
import { getMyProfile } from "@/lib/api/profiles";
import { CreateOrgModal } from "@/features/namespaces/ui/CreateOrgModal";
import { useNamespacePermissions } from "@/features/namespaces/hooks/useNamespacePermissions";
import {
  UserCircle,
  ShieldCheck,
  MonitorSmartphone,
  Plus,
  ChevronsUpDown,
  Check,
  Users,
  Settings,
  Layers,
  ScrollText,
  Zap,
  KeyRound,
  Loader2,
  Activity,
  BarChart2,
  HelpCircle,
  Gauge,
  LayoutGrid,
  Share2,
  type LucideIcon,
} from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kleffio/ui";
import { SidebarUserFooter } from "./SidebarUserFooter";

// ── Nav helpers ────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  exact = false,
  badge,
  soon,
}: {
  href: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  badge?: number;
  soon?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-all",
        active
          ? "bg-primary/[0.08] text-sidebar-foreground ring-1 ring-primary/20 sidebar-glow-active"
          : "text-sidebar-foreground/50 hover:bg-white/[0.04] hover:text-sidebar-foreground/80"
      )}
    >
      {Icon && (
        <span className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded transition-all",
          active ? "text-primary drop-glow-primary" : "text-sidebar-foreground/30"
        )}>
          <Icon className="size-4" />
        </span>
      )}
      <span className="flex-1">{label}</span>
      {soon && (
        <span className="flex items-center h-[16px] px-1.5 rounded-full border border-white/[0.07] text-[9px] font-bold text-white/20 tracking-wide uppercase leading-none">
          Soon
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function NavItemStub({ label, icon: Icon }: { label: string; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium text-sidebar-foreground/20 cursor-not-allowed select-none">
      {Icon && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded text-sidebar-foreground/15">
          <Icon className="size-4" />
        </span>
      )}
      <span className="flex-1">{label}</span>
      <span className="flex items-center h-[16px] px-1.5 rounded-full border border-white/[0.07] text-[9px] font-bold text-white/20 tracking-wide uppercase leading-none">
        Soon
      </span>
    </div>
  );
}

function NavDivider() {
  return <div className="my-2 mx-2 h-px bg-white/[0.05]" />;
}

// ── Plan badge ─────────────────────────────────────────────────────────────────

function PlanBadge({ type, role }: { type: "user" | "org"; role?: string }) {
  if (type === "user") {
    return (
      <span className="ml-auto flex h-[16px] items-center px-1.5 rounded-full bg-lime-500/15 text-[9px] font-bold text-lime-400 leading-none tracking-wide uppercase shrink-0">
        Hobby
      </span>
    );
  }
  if (role === "Owner" || role === "Admin") {
    return (
      <span className="ml-auto flex h-[16px] items-center px-1.5 rounded-full bg-blue-500/15 text-[9px] font-bold text-blue-400 leading-none tracking-wide uppercase shrink-0">
        Pro
      </span>
    );
  }
  return null;
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

const SYSTEM_ROOTS = new Set(["settings", "orgs", "ns", "ns-invite", "env-invite", "invite", "account", "dashboard"]);
const NS_MGMT_PAGES = new Set(["environments", "members", "settings", "roles", "profile", "security", "sessions", "notifications", "monitoring", "new"]);
const PERSONAL_SETTINGS_PAGES = new Set(["profile", "security", "sessions", "notifications"]);

export function PersonalHubSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [nsSearch, setNsSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const username =
    (auth.user?.profile?.preferred_username as string | undefined) ??
    (auth.user?.profile?.sub as string | undefined) ??
    "user";

  const namespacesQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
  });
  const namespaces = namespacesQuery.data?.namespaces ?? [];
  const personalNs = namespaces.find((ns) => ns.type === "user" && ns.slug === username);
  const workspaceOrgs = namespaces.filter((ns) =>
    ns.id !== personalNs?.id && (ns.user_role === "Owner" || ns.user_role === "Admin")
  );
  const sharedOrgs = namespaces.filter((ns) =>
    ns.id !== personalNs?.id &&
    ns.user_role !== "Owner" &&
    ns.user_role !== "Admin" &&
    !!ns.user_role  // exclude env-only members (user_role is "" or undefined)
  );

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] ?? "";

  const isInsideNamespace = !!firstSegment && !SYSTEM_ROOTS.has(firstSegment);
  const currentSlug = isInsideNamespace ? firstSegment : "";

  const currentEnvSlug =
    isInsideNamespace && segments.length >= 2 && !NS_MGMT_PAGES.has(segments[1])
      ? segments[1]
      : null;

  const currentNs = isInsideNamespace
    ? namespaces.find((ns) => ns.slug === currentSlug)
    : null;

  const isAccountPage =
    firstSegment === "account" ||
    (isInsideNamespace && currentNs?.type === "user" && PERSONAL_SETTINGS_PAGES.has(segments[1] ?? ""));

  const sharedProjectsQuery = useQuery({
    queryKey: ["shared-projects"],
    queryFn: listSharedProjects,
  });
  const sharedProjects = sharedProjectsQuery.data?.projects ?? [];

  // Group shared projects by namespace slug for quick lookup
  const sharedProjectsByNs = sharedProjects.reduce<Record<string, typeof sharedProjects>>((acc, p) => {
    if (!acc[p.namespace_slug]) acc[p.namespace_slug] = [];
    acc[p.namespace_slug].push(p);
    return acc;
  }, {});

  // A "shared project context" is when the user is inside a namespace they have no NS membership for,
  // but do have env-level access via grants.
  const isSharedProjectContext = isInsideNamespace && !currentNs && !!sharedProjectsByNs[currentSlug];
  const sharedNsProjects = isSharedProjectContext ? (sharedProjectsByNs[currentSlug] ?? []) : [];
  const sharedNsName = sharedNsProjects[0]?.namespace_name ?? currentSlug;

  const envsQuery = useQuery({
    queryKey: ["environments", currentSlug],
    queryFn: () => listEnvironments(currentSlug),
    enabled: isInsideNamespace && !!currentSlug,
  });
  const environments = envsQuery.data?.environments ?? [];
  const currentEnv = currentEnvSlug
    ? environments.find((e) => e.slug === currentEnvSlug)
    : null;

  const { hasPermission } = useNamespacePermissions(currentSlug, currentEnv?.id ?? undefined);

  const isExternalUserContext = currentNs?.type === "user" && currentNs.slug !== username;

  const activeContext = isExternalUserContext ? personalNs : (currentNs ?? personalNs);

  const { data: myProfileData } = useQuery({
    queryKey: ["users", "me"],
    queryFn: getMyProfile,
  });
  const myAvatarUrl = myProfileData?.data?.avatar_url;

  const switcherPrimary = isSharedProjectContext ? sharedNsName : (activeContext?.name ?? username);
  const switcherInitial = (switcherPrimary[0] ?? "?").toUpperCase();

  const switcherBadgeType = activeContext?.type ?? "user";
  const switcherBadgeRole = activeContext?.user_role;

  const homeHref = `/${personalNs?.slug ?? username}`;

  return (
    <>
      <aside className="flex h-full w-[270px] flex-col bg-sidebar border-r border-sidebar-border">

        {/* ── Namespace / Identity Switcher ── */}
        <div className="shrink-0 px-3 pt-4 pb-2">
          <DropdownMenu onOpenChange={(open) => { if (open) { setNsSearch(""); setTimeout(() => searchRef.current?.focus(), 0); } }}>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-white/[0.04] transition-colors focus-visible:outline-none">
                <div className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md ring-1 shadow-[0_0_10px_oklch(0.80_0.17_90_/_0.12)] overflow-hidden",
                  activeContext?.id === personalNs?.id && !isInsideNamespace
                    ? "bg-white/[0.05] ring-white/[0.08]"
                    : "bg-primary/15 ring-primary/20"
                )}>
                  {(activeContext?.avatar_url ?? (activeContext?.type === "user" ? myAvatarUrl : null)) ? (
                    <Image src={activeContext?.avatar_url ?? myAvatarUrl!} alt={switcherPrimary} width={32} height={32} className="size-full object-cover" unoptimized />
                  ) : (
                    <span className={cn(
                      "text-[15px] font-black leading-none",
                      activeContext?.id === personalNs?.id && !isInsideNamespace ? "text-sidebar-foreground/50" : "text-primary"
                    )}>
                      {switcherInitial}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-sidebar-foreground truncate leading-tight">
                    {switcherPrimary}
                  </p>
                </div>
                <PlanBadge type={switcherBadgeType} role={switcherBadgeRole} />
                <ChevronsUpDown className="size-4 text-sidebar-foreground/25 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} className="w-[270px] p-0 overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
                <input
                  ref={searchRef}
                  value={nsSearch}
                  onChange={(e) => setNsSearch(e.target.value)}
                  placeholder="Find team…"
                  className="flex-1 bg-transparent text-[14px] text-sidebar-foreground placeholder:text-sidebar-foreground/30 outline-none"
                />
                <kbd className="hidden sm:flex h-5 items-center px-1.5 rounded border border-white/[0.08] text-[10px] text-white/25 font-mono">Esc</kbd>
              </div>

              {/* Workspace list */}
              <div className="py-1.5 max-h-72 overflow-y-auto">
                {[
                  ...(personalNs ? [{ ns: personalNs, badge: "Hobby" as const, badgeClass: "bg-lime-500/15 text-lime-400", avatarClass: "bg-primary/15 text-primary" }] : []),
                  ...workspaceOrgs.map(ns => ({ ns, badge: "Pro" as const, badgeClass: "bg-blue-500/15 text-blue-400", avatarClass: "bg-blue-500/15 text-blue-400" })),
                  ...sharedOrgs.map(ns => ({ ns, badge: null, badgeClass: "", avatarClass: "bg-amber-500/15 text-amber-400" })),
                ]
                  .filter(({ ns }) => !nsSearch || ns.name.toLowerCase().includes(nsSearch.toLowerCase()))
                  .map(({ ns, badge, badgeClass, avatarClass }) => (
                    <button
                      key={ns.id}
                      onClick={() => router.push(`/${ns.slug}`)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-[12px] font-black leading-none overflow-hidden", avatarClass)}>
                        {ns.avatar_url ? (
                          <Image src={ns.avatar_url} alt={ns.name} width={28} height={28} className="size-full object-cover" unoptimized />
                        ) : (
                          (ns.name[0] ?? "?").toUpperCase()
                        )}
                      </div>
                      <span className="flex-1 text-[14px] text-sidebar-foreground truncate">{ns.name}</span>
                      {badge && (
                        <span className={cn("flex h-[15px] items-center px-1.5 rounded-full text-[9px] font-bold leading-none tracking-wide uppercase shrink-0", badgeClass)}>
                          {badge}
                        </span>
                      )}
                      {activeContext?.id === ns.id && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))
                }

                {/* Shared with you — one entry per namespace */}
                {Object.keys(sharedProjectsByNs).length > 0 && !nsSearch && (
                  <>
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-[10px] font-semibold text-white/25 tracking-widest uppercase">Shared with you</p>
                    </div>
                    {Object.entries(sharedProjectsByNs).map(([nsSlug, projects]) => {
                      const nsName = projects[0]?.namespace_name ?? nsSlug;
                      return (
                        <button
                          key={nsSlug}
                          onClick={() => router.push(`/${nsSlug}`)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                        >
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400 text-[12px] font-black leading-none">
                            {(nsName[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-sidebar-foreground truncate">{nsName}</p>
                            <p className="text-[11px] text-white/30 truncate">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
                          </div>
                          {currentSlug === nsSlug && (
                            <Check className="size-4 text-primary shrink-0" />
                          )}
                          <Share2 className="size-3 text-white/20 shrink-0" />
                        </button>
                      );
                    })}
                  </>
                )}

                {/* Empty orgs state */}
                {workspaceOrgs.length === 0 && sharedOrgs.length === 0 && Object.keys(sharedProjectsByNs).length === 0 && !nsSearch && (
                  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                      <Users className="size-5 text-white/20" />
                    </div>
                    <p className="text-[12px] text-white/30 leading-relaxed max-w-[180px]">
                      Teams you create and join appear here for quick switching.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.06]">
                <button
                  onClick={() => setShowCreateOrg(true)}
                  className="flex w-full items-start gap-3 px-3 py-3 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] mt-0.5">
                    <Plus className="size-4 text-white/40" />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-sidebar-foreground/70">Create Organization</p>
                    <p className="text-[12px] text-white/30">Collaborate in a shared workspace</p>
                  </div>
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Scrollable nav area ── */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

          {/* Account / personal settings pages */}
          {isAccountPage && (
            <>
              <NavItem href={`/${personalNs?.slug ?? username}/profile`} label="Profile" icon={UserCircle} />
              <NavItem href={`/${personalNs?.slug ?? username}/security`} label="Security" icon={ShieldCheck} />
              <NavItem href={`/${personalNs?.slug ?? username}/sessions`} label="Sessions" icon={MonitorSmartphone} />
            </>
          )}

          {/* Namespace-level nav (not inside an environment, not a shared-project-only context) */}
          {isInsideNamespace && !currentEnvSlug && !isAccountPage && !isSharedProjectContext && (
            <>
              {/* Projects is the home view */}
              <NavItem href={`/${currentSlug}`} label="Projects" icon={LayoutGrid} exact />
              <NavItem href={`/${currentSlug}/monitoring`} label="Monitoring" icon={Activity} />
              <NavItemStub label="Deployments" icon={Zap} />
              <NavItemStub label="Analytics" icon={BarChart2} />
              <NavItemStub label="Logs" icon={ScrollText} />

              <NavDivider />

              {hasPermission("member:view") && (
                <NavItem href={`/${currentSlug}/settings/members`} label="Members" icon={Users} />
              )}
              {hasPermission("namespace:manage") && (
                <>
                  <NavItem href={`/${currentSlug}/settings/roles`} label="Roles" icon={ShieldCheck} />
                  <NavItem href={`/${currentSlug}/settings`} label="Settings" icon={Settings} exact />
                </>
              )}
              <NavItemStub label="API Keys" icon={KeyRound} />

              <NavDivider />

              <NavItemStub label="Usage" icon={Gauge} />
              <NavItemStub label="Support" icon={HelpCircle} />
            </>
          )}

          {/* Shared project context: show only the accessible projects */}
          {isSharedProjectContext && !currentEnvSlug && (
            <>
              {sharedNsProjects.map((p) => (
                <NavItem
                  key={p.env_id}
                  href={`/${currentSlug}/${p.env_slug}`}
                  label={p.env_name}
                  icon={Layers}
                />
              ))}
            </>
          )}

          {/* Environment breadcrumb + sub-nav */}
          {isInsideNamespace && currentEnvSlug && (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-2.5 pt-1.5 pb-1 overflow-hidden">
                {!isExternalUserContext && !isSharedProjectContext ? (
                  <Link
                    href={`/${currentSlug}`}
                    className="text-[12px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors truncate max-w-[90px] shrink-0"
                  >
                    {currentNs?.name ?? currentSlug}
                  </Link>
                ) : (
                  <span className="text-[12px] text-sidebar-foreground/35 truncate max-w-[90px] shrink-0">
                    {currentNs?.name ?? sharedNsName}
                  </span>
                )}
                <span className="text-sidebar-foreground/20 text-[12px] shrink-0">/</span>
                <span className="text-[12px] font-medium text-sidebar-foreground/60 truncate">
                  {currentEnv?.name ?? currentEnvSlug}
                </span>
              </div>

              <NavItem href={`/${currentSlug}/${currentEnvSlug}`} label="Overview" icon={MonitorSmartphone} exact />
              <NavItem href={`/${currentSlug}/${currentEnvSlug}/monitoring`} label="Monitoring" icon={Activity} />
              <NavItem href={`/${currentSlug}/${currentEnvSlug}/deployments`} label="Deployments" icon={Zap} soon />
              <NavItem href={`/${currentSlug}/${currentEnvSlug}/logs`} label="Logs" icon={ScrollText} soon />
              <NavItem href={`/${currentSlug}/${currentEnvSlug}/analytics`} label="Analytics" icon={BarChart2} soon />

              <NavDivider />

              <NavItem href={`/${currentSlug}/${currentEnvSlug}/canvas`} label="Canvas" icon={Layers} />
              <NavItem href={`/${currentSlug}/${currentEnvSlug}/variables`} label="Variables" icon={KeyRound} />

              <NavDivider />

              <NavItem href={`/${currentSlug}/${currentEnvSlug}/access`} label="Access" icon={Users} />
              {hasPermission("namespace:manage") && (
                <NavItem href={`/${currentSlug}/${currentEnvSlug}/settings/roles`} label="Roles" icon={ShieldCheck} />
              )}
              {hasPermission("environment:manage") && (
                <NavItem href={`/${currentSlug}/${currentEnvSlug}/settings`} label="Settings" icon={Settings} exact />
              )}
            </>
          )}

        </nav>

        <SidebarUserFooter />
      </aside>

      <CreateOrgModal open={showCreateOrg} onClose={() => setShowCreateOrg(false)} />
    </>
  );
}
