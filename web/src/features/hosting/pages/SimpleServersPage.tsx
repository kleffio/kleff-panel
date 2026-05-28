"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Play,
  Plus,
  RotateCcw,
  Server,
  Square,
  Gamepad2,
  Database,
  Zap,
  Network,
  Cpu,
  Globe,
  Code2,
  Trash2,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kleffio/ui";
import { useAuth } from "@/features/auth";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import {
  listWorkloads,
  listWorkloadsByNamespace,
  deleteWorkload,
  deleteWorkloadFromNamespace,
  type WorkloadDTO,
} from "@/lib/api/projects";
import { listAllBlueprints, listCrates, type Blueprint, type Crate } from "@/lib/api/catalog";
import { CreateServerPalette } from "@/features/hosting/ui/CreateServerPalette";

const KIND_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  minecraft:     { icon: Gamepad2, label: "Game Server", color: "text-emerald-400" },
  terraria:      { icon: Gamepad2, label: "Game Server", color: "text-emerald-400" },
  "game-server": { icon: Gamepad2, label: "Game Server", color: "text-emerald-400" },
  database:      { icon: Database, label: "Database",    color: "text-blue-400"    },
  cache:         { icon: Zap,      label: "Cache",       color: "text-amber-400"   },
  proxy:         { icon: Network,  label: "Proxy",       color: "text-purple-400"  },
  worker:        { icon: Cpu,      label: "Worker",      color: "text-cyan-400"    },
  app:           { icon: Globe,    label: "App",         color: "text-pink-400"    },
  api:           { icon: Code2,    label: "API",         color: "text-indigo-400"  },
};

const DEFAULT_META = { icon: Server, label: "Server", color: "text-white/40" };

function inferKind(image: string, blueprintID: string) {
  const s = `${image} ${blueprintID}`.toLowerCase();
  if (/postgres|mysql|mariadb|mongo/.test(s)) return "database";
  if (/redis|cache|memcached/.test(s)) return "cache";
  if (/proxy|traefik|envoy|nginx/.test(s)) return "proxy";
  if (/worker|queue|jobs/.test(s)) return "worker";
  if (/minecraft/.test(s)) return "minecraft";
  if (/terraria/.test(s)) return "terraria";
  if (/game|rust|ark/.test(s)) return "game-server";
  if (/web|frontend|next/.test(s)) return "app";
  return "api";
}

// ── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  workload: WorkloadDTO;
  href: string;
}

function CardContextMenu({
  menu,
  onClose,
  onDelete,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onDelete: (w: WorkloadDTO) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  const items = [
    { label: "Restart", icon: RotateCcw,    action: () => { onClose(); } },
    { label: "Logs",    icon: ExternalLink,  action: () => { window.location.href = menu.href; onClose(); } },
    { label: "Start",   icon: Play,          action: () => { onClose(); }, disabled: menu.workload.state === "running" },
    { label: "Stop",    icon: Square,        action: () => { onClose(); }, disabled: menu.workload.state !== "running" },
  ];

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 9999 }}
      className="animate-in fade-in zoom-in-95 duration-150 origin-top-left"
    >
      <div className="w-44 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111215] shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
        <div className="border-b border-white/[0.06] px-3 py-2">
          <p className="truncate text-[11px] font-semibold text-white/60">
            {menu.workload.name || menu.workload.id.slice(0, 10)}
          </p>
        </div>
        <div className="p-1">
          {items.map(({ label, icon: Icon, action, disabled }) => (
            <button
              key={label}
              disabled={disabled}
              onClick={action}
              className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-[12px] text-white/65 hover:bg-white/[0.06] hover:text-white/90 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </button>
          ))}
          <div className="my-1 h-px bg-white/[0.06]" />
          <button
            onClick={() => { onDelete(menu.workload); onClose(); }}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-[12px] text-red-400/80 hover:bg-red-500/[0.08] hover:text-red-400 transition-colors"
          >
            <Trash2 className="size-3.5 shrink-0" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Server card ───────────────────────────────────────────────────────────────

function StatusPill({ state }: { state: string }) {
  if (state === "running") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
        Online
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
        <span className="size-1.5 rounded-full bg-red-400" />
        Failed
      </span>
    );
  }
  if (state === "pending" || state === "starting") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
        <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
        Starting
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/30">
      <span className="size-1.5 rounded-full bg-white/20" />
      Offline
    </span>
  );
}

function ServerCard({
  w,
  href,
  blueprint,
  crate,
  onContextMenu,
}: {
  w: WorkloadDTO;
  href: string;
  blueprint?: Blueprint;
  crate?: Crate;
  onContextMenu: (e: React.MouseEvent, w: WorkloadDTO, href: string) => void;
}) {
  const kind = inferKind(w.image, w.blueprint_id);
  const meta = KIND_META[kind] ?? DEFAULT_META;
  const Icon = meta.icon;
  const isRunning = w.state === "running";
  const backgroundUrl = blueprint?.background;
  const logoUrl = crate?.logo;

  return (
    <Link
      href={href}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, w, href); }}
      className="group relative overflow-hidden rounded-[12px] border border-[#f5b517]/20 bg-[#090909] shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_0_1px_rgba(245,181,23,0.04)_inset] transition-all hover:border-[#f5b517]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(245,181,23,0.10)_inset] flex flex-col cursor-pointer"
    >
      {/* Background image with smooth fade */}
      {backgroundUrl && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[75%] bg-cover bg-center opacity-35 transition-opacity duration-300 group-hover:opacity-55"
          style={{
            backgroundImage: `url(${backgroundUrl})`,
            maskImage: "linear-gradient(to bottom, black 20%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 20%, transparent 100%)",
          }}
        />
      )}

      {/* Top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.08),transparent)]" />

      <div className="relative flex flex-col flex-1 gap-3 p-4">
        {/* Icon row + status pill */}
        <div className="flex items-start justify-between gap-2">
          <div className={`grid size-9 shrink-0 place-items-center ${logoUrl ? "" : "rounded-[8px] border border-white/[0.08] bg-[#111] overflow-hidden"}`}>
            {logoUrl ? (
              <img src={logoUrl} alt={crate?.name ?? ""} className="size-full object-contain drop-shadow-md" />
            ) : (
              <Icon className={`size-4 ${meta.color}`} />
            )}
          </div>
          <StatusPill state={w.state} />
        </div>

        {/* Name + type */}
        <div className="flex-1">
          <p className="text-[15px] font-bold leading-snug text-white/90 transition-colors group-hover:text-white line-clamp-2">
            {w.name || w.id.slice(0, 12)}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-[#f5b517]/40">
            {meta.label}
          </p>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              disabled={isRunning}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="size-3 fill-emerald-400" />
              Start
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              disabled={!isRunning}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/30 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <Square className="size-3" />
              Stop
            </button>
          </div>
          <ArrowRight className="size-3.5 text-[#f5b517]/25 transition-all group-hover:text-[#f5b517]/60 group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "online" | "offline" | "failed";

export function SimpleServersPage({
  namespaceSlug: nsProp,
  environmentSlug: envProp,
}: {
  namespaceSlug?: string;
  environmentSlug?: string;
} = {}) {
  const auth = useAuth();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [initialPaletteCategory, setInitialPaletteCategory] = React.useState<string | undefined>(undefined);
  const [blueprintMap, setBlueprintMap] = React.useState<Map<string, Blueprint>>(new Map());
  const [crateMap, setCrateMap] = React.useState<Map<string, Crate>>(new Map());
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkloadDTO | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");

  const username =
    (auth.user?.profile?.preferred_username as string | undefined) ?? "user";
  const displayName =
    (auth.user?.profile?.preferred_username as string | undefined) ??
    (auth.user?.profile?.name as string | undefined)?.split(" ")[0] ??
    "there";

  const isNsMode = !!nsProp;

  const nsWorkloadsQuery = useQuery({
    queryKey: ["workloads", "ns", nsProp],
    queryFn: () => listWorkloadsByNamespace(nsProp!),
    enabled: isNsMode,
    refetchInterval: 10_000,
  });

  const { projects, isLoading: projectsLoading } = useCurrentProject();
  const defaultProject = !isNsMode ? (projects.find((p) => p.is_default) ?? projects[0] ?? null) : null;

  const [legacyWorkloads, setLegacyWorkloads] = React.useState<WorkloadDTO[]>([]);
  const [legacyLoading, setLegacyLoading] = React.useState(!isNsMode);

  // Fetch blueprints and crates once for image/icon lookup
  React.useEffect(() => {
    Promise.all([listAllBlueprints(), listCrates()]).then(([bRes, cRes]) => {
      setBlueprintMap(new Map((bRes.blueprints ?? []).map((b) => [b.id, b])));
      setCrateMap(new Map((cRes.crates ?? []).map((c) => [c.id, c])));
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (isNsMode) return;
    if (projectsLoading) return;
    if (!defaultProject) { setLegacyLoading(false); return; }
    setLegacyLoading(true);
    listWorkloads(defaultProject.id)
      .then((res) => setLegacyWorkloads(res.workloads ?? []))
      .catch(() => {})
      .finally(() => setLegacyLoading(false));
    const id = setInterval(() => {
      listWorkloads(defaultProject.id)
        .then((res) => setLegacyWorkloads(res.workloads ?? []))
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [defaultProject?.id, projectsLoading, isNsMode]);

  const allWorkloads = isNsMode ? (nsWorkloadsQuery.data?.workloads ?? []) : legacyWorkloads;
  const loading = isNsMode ? nsWorkloadsQuery.isLoading : legacyLoading;

  const visible = allWorkloads.filter((w) => w.state !== "deleted");
  const running = visible.filter((w) => w.state === "running").length;
  const failed = visible.filter((w) => w.state === "failed").length;
  const offline = visible.length - running - failed;

  const filtered =
    activeTab === "online"  ? visible.filter((w) => w.state === "running") :
    activeTab === "offline" ? visible.filter((w) => w.state !== "running" && w.state !== "failed") :
    activeTab === "failed"  ? visible.filter((w) => w.state === "failed") :
    visible;

  function refreshWorkloads() {
    if (isNsMode) {
      nsWorkloadsQuery.refetch();
    } else {
      if (!defaultProject) return;
      listWorkloads(defaultProject.id)
        .then((res) => setLegacyWorkloads(res.workloads ?? []))
        .catch(() => {});
    }
  }

  function handleContextMenu(e: React.MouseEvent, w: WorkloadDTO, href: string) {
    setContextMenu({ x: e.clientX, y: e.clientY, workload: w, href });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (isNsMode && nsProp) {
        await deleteWorkloadFromNamespace(nsProp, deleteTarget.id);
        nsWorkloadsQuery.refetch();
      } else if (defaultProject) {
        await deleteWorkload(defaultProject.id, deleteTarget.id);
        setLegacyWorkloads((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      }
    } catch {
      // keep target so user can retry
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  const tabs: { label: string; value: FilterTab; count: number }[] = [
    { label: "All servers", value: "all",     count: visible.length },
    { label: "Online",      value: "online",  count: running        },
    { label: "Offline",     value: "offline", count: offline        },
    { label: "Failed",      value: "failed",  count: failed         },
  ];

  return (
    <>
      <div className="w-full px-8 py-8 animate-in fade-in duration-500 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold tracking-tight text-white leading-tight">
              Hey, {displayName}
            </h1>
            {!loading && visible.length > 0 && (
              <p className="text-[13px] text-white/35">
                <span className="font-semibold text-emerald-400">{running} online</span>
                {" · "}
                {visible.length} total
              </p>
            )}
          </div>
          <button
            onClick={() => { setInitialPaletteCategory(undefined); setPaletteOpen(true); }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-4 h-9 text-[13px] font-medium text-white/70 hover:bg-white/[0.07] hover:text-white/90 transition-colors"
          >
            <Plus className="size-3.5" />
            New server
          </button>
        </div>

        {/* ── Stats pills ── */}
        {!loading && visible.length > 0 && (
          <div className="flex items-center gap-3">
            {[
              {
                value: "online" as FilterTab,
                label: "Running",
                count: running,
                dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
                activeClass: "border-emerald-500/25 bg-emerald-500/[0.06]",
                countClass: "text-emerald-400",
              },
              {
                value: "offline" as FilterTab,
                label: "Stopped",
                count: offline,
                dotClass: "bg-white/30",
                activeClass: "border-white/[0.12] bg-white/[0.05]",
                countClass: "text-white/60",
              },
              {
                value: "failed" as FilterTab,
                label: "Failed",
                count: failed,
                dotClass: "bg-red-400",
                activeClass: "border-red-500/25 bg-red-500/[0.06]",
                countClass: "text-red-400",
              },
            ].map(({ value, label, count, dotClass, activeClass, countClass }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`flex flex-1 items-center gap-2.5 rounded-xl border px-4 py-3 transition-colors text-left ${
                  activeTab === value ? activeClass : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`size-2 shrink-0 rounded-full ${dotClass}`} />
                <span className={`text-[22px] font-bold tabular-nums ${activeTab === value ? countClass : "text-white/70"}`}>
                  {count}
                </span>
                <span className="text-[12px] text-white/35">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Filter tabs ── */}
        {!loading && visible.length > 0 && (
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  activeTab === tab.value
                    ? "bg-white/[0.08] text-white"
                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
                <span className={`text-[10px] font-bold tabular-nums ${activeTab === tab.value ? "text-white/50" : "text-white/20"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        {loading ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[150px] animate-pulse rounded-[12px] border border-white/[0.05] bg-white/[0.02]"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-10 py-20 text-center">
            <div className="space-y-2">
              <h2 className="text-[22px] font-bold text-white/70">Ready to launch something?</h2>
              <p className="text-[14px] text-white/30">Your servers will appear here once you create one.</p>
            </div>
            <div className="grid w-full grid-cols-3 gap-4 max-w-2xl">
              {[
                {
                  id: "game-server",
                  icon: Gamepad2,
                  label: "Game Server",
                  description: "Minecraft, Terraria, Rust, ARK and more",
                  iconColor: "text-emerald-400",
                  iconBg: "bg-emerald-500/10 border-emerald-500/20",
                },
                {
                  id: "docker",
                  icon: Database,
                  label: "Docker Image",
                  description: "Any image from Docker Hub",
                  iconColor: "text-blue-400",
                  iconBg: "bg-blue-500/10 border-blue-500/20",
                },
                {
                  id: "template",
                  icon: Zap,
                  label: "From Template",
                  description: "Pre-built server configurations",
                  iconColor: "text-amber-400",
                  iconBg: "bg-amber-500/10 border-amber-500/20",
                },
              ].map(({ id, icon: Icon, label, description, iconColor, iconBg }) => (
                <button
                  key={id}
                  onClick={() => { setInitialPaletteCategory(id); setPaletteOpen(true); }}
                  className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition-all hover:border-white/[0.10] hover:bg-white/[0.04] group"
                >
                  <div className={`flex size-10 items-center justify-center rounded-xl border ${iconBg}`}>
                    <Icon className={`size-5 ${iconColor}`} />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-white/70 group-hover:text-white/90 transition-colors">{label}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-white/30">{description}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[12px] text-white/25 group-hover:text-white/50 transition-colors">
                    Get started <ArrowRight className="size-3" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <p className="text-[14px] font-medium text-white/30">No {activeTab} servers</p>
            <button
              onClick={() => setActiveTab("all")}
              className="text-[12px] text-white/20 hover:text-white/50 transition-colors underline underline-offset-2"
            >
              Show all servers
            </button>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {filtered.map((w) => {
              const href = isNsMode && nsProp
                ? `/${nsProp}/servers/${w.id}`
                : defaultProject
                ? `/project/${username}/${defaultProject.slug}/servers/${w.id}`
                : "#";
              const bp = blueprintMap.get(w.blueprint_id);
              const crate = bp ? crateMap.get(bp.crate_id) : undefined;
              return (
                <ServerCard
                  key={w.id}
                  w={w}
                  href={href}
                  blueprint={bp}
                  crate={crate}
                  onContextMenu={handleContextMenu}
                />
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <CardContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={(w) => setDeleteTarget(w)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete server?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-white/80">{deleteTarget?.name}</strong> will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={confirmDelete}
              className="bg-red-500/90 text-white hover:bg-red-500 border-red-400/30"
            >
              {isDeleting ? "Deleting…" : "Delete server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateServerPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        initialCategory={initialPaletteCategory}
        projectID={isNsMode ? null : (defaultProject?.id ?? null)}
        namespaceSlug={isNsMode ? (nsProp ?? null) : null}
        onCreated={refreshWorkloads}
      />
    </>
  );
}
