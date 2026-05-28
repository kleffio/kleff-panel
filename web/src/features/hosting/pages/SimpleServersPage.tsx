"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
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
import { listWorkloads, deleteWorkload, type WorkloadDTO } from "@/lib/api/projects";
import { listAllBlueprints, listCrates, type Blueprint, type Crate } from "@/lib/api/catalog";
import { CreateServerModal } from "@/features/hosting/ui/CreateServerModal";

const CATEGORY_META: Record<string, { icon: LucideIcon; label: string }> = {
  games:     { icon: Gamepad2, label: "Game Server" },
  databases: { icon: Database, label: "Database"    },
  cache:     { icon: Zap,      label: "Cache"       },
  storage:   { icon: Database, label: "Storage"     },
  web:       { icon: Globe,    label: "Web"         },
  apps:      { icon: Code2,    label: "App"         },
  proxy:     { icon: Network,  label: "Proxy"       },
  worker:    { icon: Cpu,      label: "Worker"      },
};

const DEFAULT_META = { icon: Server, label: "Server" };

// ── Context menu ────────────────────────────────────────────────────────────

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

  // Close on outside click / Escape
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
    {
      label: "Restart",
      icon: RotateCcw,
      action: () => { onClose(); /* stub */ },
    },
    {
      label: "Logs",
      icon: ExternalLink,
      action: () => { window.location.href = menu.href; onClose(); },
    },
    {
      label: "Start",
      icon: Play,
      action: () => { onClose(); /* stub */ },
      disabled: menu.workload.state === "running",
    },
    {
      label: "Stop",
      icon: Square,
      action: () => { onClose(); /* stub */ },
      disabled: menu.workload.state !== "running",
    },
  ];

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 9999 }}
      className="animate-in fade-in zoom-in-95 duration-150 origin-top-left"
    >
      <div className="w-44 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111215] shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl">
        {/* Header */}
        <div className="border-b border-white/[0.06] px-3 py-2">
          <p className="truncate text-[11px] font-semibold text-white/60">
            {menu.workload.name || menu.workload.id.slice(0, 10)}
          </p>
        </div>

        {/* Items */}
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

// ── Server card ─────────────────────────────────────────────────────────────

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
  const meta = CATEGORY_META[crate?.category ?? ""] ?? DEFAULT_META;
  const Icon = meta.icon;
  const isRunning = w.state === "running";
  const backgroundUrl = blueprint?.background;
  const logoUrl = crate?.logo;

  return (
    <Link
      href={href}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, w, href); }}
      className="group relative overflow-hidden rounded-[10px] border border-[#f5b517]/20 bg-[#090909] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_0_1px_rgba(245,181,23,0.04)_inset] transition-all hover:border-[#f5b517]/35 hover:shadow-[0_12px_40px_rgba(0,0,0,0.65),0_0_0_1px_rgba(245,181,23,0.08)_inset] flex flex-col cursor-pointer"
    >
      {/* Background Image with smooth fade to the bottom */}
      {backgroundUrl && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[80%] bg-cover bg-center opacity-40 transition-opacity duration-300 group-hover:opacity-60"
          style={{
            backgroundImage: `url(${backgroundUrl})`,
            maskImage: "linear-gradient(to bottom, black 20%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 20%, transparent 100%)"
          }}
        />
      )}

      {/* Golden top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.09),transparent)] transition-opacity group-hover:opacity-150" />

      <div className="relative flex flex-col flex-1 p-3.5 gap-3">
        {/* Icon + arrow */}
        <div className="flex items-center justify-between">
          <div className={`grid h-8 w-8 shrink-0 place-items-center ${logoUrl ? "" : "rounded-[7px] border border-white/[0.1] bg-[#090909] text-white/40 overflow-hidden shadow-sm"}`}>
            {logoUrl ? (
              <img src={logoUrl} alt={crate?.name ?? ""} className="w-full h-full object-contain drop-shadow-md" />
            ) : (
              <Icon className="size-4" />
            )}
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-[#f5b517]/30 transition-all duration-200 group-hover:text-[#f5b517]/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>

        {/* Name + kind */}
        <div>
          <strong className="block truncate text-[13px] font-semibold leading-tight text-white/90 transition-colors group-hover:text-white">
            {w.name || w.id.slice(0, 12)}
          </strong>
          <span className="text-[10px] uppercase tracking-[0.1em] text-[#f5b517]/40">
            {meta.label}
          </span>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between rounded-[7px] border border-[#f5b517]/10 bg-white/[0.025] px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[11px]">
            {isRunning ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span className="text-emerald-400 font-medium">Online</span>
              </>
            ) : w.state === "failed" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-red-400 font-medium">Failed</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400 font-medium capitalize">{w.state}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              disabled={isRunning}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="size-2.5 fill-emerald-400" />
              Start
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              disabled={!isRunning}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white/30 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <Square className="size-2.5" />
              Stop
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SimpleServersPage() {
  const auth = useAuth();
  const router = useRouter();
  const { projects, isLoading: projectsLoading } = useCurrentProject();
  const [workloads, setWorkloads] = React.useState<WorkloadDTO[]>([]);
  const [blueprintMap, setBlueprintMap] = React.useState<Map<string, Blueprint>>(new Map());
  const [crateMap, setCrateMap] = React.useState<Map<string, Crate>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkloadDTO | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const username =
    (auth.user?.profile?.preferred_username as string | undefined) ?? "user";
  const displayName =
    (auth.user?.profile?.preferred_username as string | undefined) ??
    (auth.user?.profile?.name as string | undefined)?.split(" ")[0] ??
    "there";

  const defaultProject = projects.find((p) => p.is_default) ?? projects[0] ?? null;

  // Fetch blueprints and crates once for image lookup
  React.useEffect(() => {
    Promise.all([listAllBlueprints(), listCrates()]).then(([bRes, cRes]) => {
      setBlueprintMap(new Map((bRes.blueprints ?? []).map((b) => [b.id, b])));
      setCrateMap(new Map((cRes.crates ?? []).map((c) => [c.id, c])));
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (projectsLoading) return;
    if (!defaultProject) { setLoading(false); return; }
    setLoading(true);
    listWorkloads(defaultProject.id)
      .then((res) => setWorkloads(res.workloads ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    const id = setInterval(() => {
      listWorkloads(defaultProject.id)
        .then((res) => setWorkloads(res.workloads ?? []))
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [defaultProject?.id, projectsLoading]);

  // Filter out deleted workloads
  const visible = workloads.filter((w) => w.state !== "deleted");
  const running = visible.filter((w) => w.state === "running").length;

  function refreshWorkloads() {
    if (!defaultProject) return;
    listWorkloads(defaultProject.id)
      .then((res) => setWorkloads(res.workloads ?? []))
      .catch(() => {});
  }

  function handleContextMenu(e: React.MouseEvent, w: WorkloadDTO, href: string) {
    setContextMenu({ x: e.clientX, y: e.clientY, workload: w, href });
  }

  async function confirmDelete() {
    if (!deleteTarget || !defaultProject) return;
    setIsDeleting(true);
    try {
      await deleteWorkload(defaultProject.id, deleteTarget.id);
      setWorkloads((prev) => prev.filter((w) => w.id !== deleteTarget.id));
    } catch {
      // keep target so user can retry
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="w-full space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/70">My Servers</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Hey, {displayName}</h1>
            {!loading && visible.length > 0 && (
              <p className="text-[12px] text-white/35">
                <span className="text-emerald-400 font-semibold">{running}</span> of {visible.length} online
              </p>
            )}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-all"
          >
            <Plus className="size-3.5" />
            Create Server
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, 200px)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-square animate-pulse rounded-[10px] border border-[#f5b517]/10 bg-[#090909]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-white/[0.07] bg-[#111214] shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
              <Server className="size-5 text-white/20" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/40">No servers yet</p>
              <p className="text-[12px] text-white/20 mt-0.5">Create your first server to get started.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, 200px)" }}>
            {visible.map((w) => {
              const href = defaultProject
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

      {/* Context menu */}
      {contextMenu && (
        <CardContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={(w) => setDeleteTarget(w)}
        />
      )}

      {/* Delete confirmation dialog */}
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

      <CreateServerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        projectID={defaultProject?.id ?? null}
        onCreated={refreshWorkloads}
      />
    </>
  );
}
