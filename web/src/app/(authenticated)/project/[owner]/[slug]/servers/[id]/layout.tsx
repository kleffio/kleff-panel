"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  ChevronsUpDown,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kleffio/ui";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { getWorkload, listWorkloads, type WorkloadDTO } from "@/lib/api/projects";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { CreateServerModal } from "@/features/hosting/ui/CreateServerModal";
import { SidebarUserFooter } from "@/components/layout/SidebarUserFooter";

function StatusDot({ state }: { state?: string }) {
  if (state === "running")
    return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
  if (state === "failed" || state === "error")
    return <XCircle className="h-3 w-3 text-red-400" />;
  return <Circle className="h-3 w-3 animate-pulse text-amber-400" />;
}

export default function ServerLayout({ children }: { children: React.ReactNode }) {
  const { owner, slug, id } = useParams<{ owner: string; slug: string; id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { projects, setCurrentProjectID } = useCurrentProject();
  const { isSimplified } = useViewMode();
  const project = projects.find((p) => p.slug === slug);

  const [workload, setWorkload] = React.useState<WorkloadDTO | null>(null);
  const [allWorkloads, setAllWorkloads] = React.useState<WorkloadDTO[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    if (project) setCurrentProjectID(project.id);
  }, [project, setCurrentProjectID]);

  // Poll current workload
  React.useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const fetch = () => {
      getWorkload(project.id, id)
        .then((d) => { if (!cancelled) setWorkload(d); })
        .catch(() => {});
    };
    fetch();
    const timer = setInterval(fetch, 5_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [project, id]);

  // Load all workloads for the switcher
  React.useEffect(() => {
    if (!project) return;
    listWorkloads(project.id)
      .then((res) => setAllWorkloads(res.workloads ?? []))
      .catch(() => {});
  }, [project?.id]);

  const basePath = `/project/${owner}/${slug}/servers/${id}`;

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, href: basePath },
    { label: "Monitoring", icon: Activity, href: `${basePath}/metrics` },
    { label: "Files", icon: FolderOpen, href: `${basePath}/files` },
    { label: "Backups", icon: HardDrive, href: `${basePath}/backups` },
    { label: "Mods", icon: Package, href: `${basePath}/mods` },
  ];

  function refreshWorkloads() {
    if (!project) return;
    listWorkloads(project.id)
      .then((res) => setAllWorkloads(res.workloads ?? []))
      .catch(() => {});
  }

  const backHref = isSimplified ? "/account" : `/project/${owner}/${slug}/canvas`;
  const backLabel = isSimplified ? "My Servers" : "Back to canvas";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">

        {/* Server switcher */}
        <div className="px-2 pt-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors focus-visible:outline-none">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/25 shadow-[0_0_12px_oklch(0.80_0.17_90_/_0.15)]">
                  <StatusDot state={workload?.state} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                    {workload?.name ?? id.slice(0, 10)}
                  </p>
                </div>
                <ChevronsUpDown className="size-3.5 text-sidebar-foreground/25 shrink-0" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-52">
              {allWorkloads.filter(w => w.state !== "deleted").length === 0 ? (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  No servers
                </DropdownMenuItem>
              ) : (
                allWorkloads.filter(w => w.state !== "deleted").map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => router.push(`/project/${owner}/${slug}/servers/${w.id}`)}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "size-3.5 shrink-0",
                        w.id === id ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    <span className="truncate flex-1">{w.name || w.id.slice(0, 10)}</span>
                    {w.state === "running" && (
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5 text-muted-foreground" />
                New Server
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search bar */}
        <div className="px-2 pb-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-white/[0.03] px-2.5 py-1.5 text-xs text-sidebar-foreground/35 hover:bg-white/[0.05] hover:text-sidebar-foreground/55 transition-colors"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-sidebar-border bg-white/[0.04] px-1 py-0.5 text-[10px] font-mono text-sidebar-foreground/25">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Back link */}
        <div className="px-2 pb-1">
          <Link
            href={backHref}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-sm font-medium transition-all text-sidebar-foreground/50 hover:bg-white/[0.04] hover:text-sidebar-foreground/80"
          >
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-sidebar-foreground/40 group-hover:bg-white/[0.07] group-hover:text-sidebar-foreground/60 transition-all">
              <ArrowLeft className="size-3" />
            </span>
            {backLabel}
          </Link>
        </div>

        {/* Separator */}
        <div className="mx-2 mb-2 h-px bg-sidebar-border" />

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-px px-2 pb-2 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, href }) => {
            const active = href === basePath
              ? pathname === basePath || pathname === `${basePath}/`
              : pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-sm font-medium transition-all",
                  active
                    ? "bg-primary/[0.1] text-primary"
                    : "text-sidebar-foreground/50 hover:bg-white/[0.04] hover:text-sidebar-foreground/80",
                )}
              >
                <span className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-md transition-all",
                  active
                    ? "bg-primary/[0.2] text-primary shadow-[0_0_10px_oklch(0.80_0.17_90_/_0.22)]"
                    : "bg-white/[0.05] text-sidebar-foreground/40 group-hover:bg-white/[0.07] group-hover:text-sidebar-foreground/60"
                )}>
                  <Icon className="size-3" />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer — same as main sidebar */}
        <SidebarUserFooter workspaceHref={backHref} />

      </aside>

      {/* Page content */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>

      {/* Create server modal */}
      <CreateServerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectID={project?.id ?? null}
        onCreated={refreshWorkloads}
      />
    </div>
  );
}
