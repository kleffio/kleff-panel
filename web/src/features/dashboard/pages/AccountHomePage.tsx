"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Globe,
  Lock,
  Loader2,
  ArrowRight,
  FolderOpen,
  Users,
  Circle,
  Server,
  Activity,
  Terminal,
  AlertCircle,
  Database,
  Zap,
  Box,
  Cpu,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  listNamespaces,
  listEnvironments,
  type NamespaceDTO,
  type EnvironmentDTO,
} from "@/lib/api/namespaces";
import { listWorkloads, type WorkloadDTO } from "@/lib/api/projects";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateOrgModal } from "@/features/namespaces/ui/CreateOrgModal";

// ── Sparklines ─────────────────────────────────────────────────────────────────

const SPARKS = {
  up:     "0,24 10,22 20,19 30,15 40,17 50,12 60,8 70,10 80,5",
  stable: "0,15 10,13 20,16 30,12 40,15 50,13 60,14 70,15 80,12",
  down:   "0,7 10,9 20,9 30,12 40,14 50,17 60,18 70,21 80,23",
  spiky:  "0,15 10,9 20,18 30,7 40,15 50,11 60,17 70,9 80,13",
} as const;

function Sparkline({ shape, color }: { shape: keyof typeof SPARKS; color: string }) {
  return (
    <svg viewBox="0 0 80 28" fill="none" className="w-full h-6" preserveAspectRatio="none">
      <polyline
        points={SPARKS[shape]}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
    </svg>
  );
}

// ── Node showcase data ─────────────────────────────────────────────────────────

interface ShowcaseNode {
  id: string;
  name: string;
  tag: string;
  tagCls: string;
  dot: string;
  metrics: { label: string; value: string; sub: string; up?: boolean; down?: boolean }[];
  spark: keyof typeof SPARKS;
  sparkColor: string;
  Icon: React.ElementType;
}

const SHOWCASE: ShowcaseNode[] = [
  {
    id: "api",
    name: "api-service",
    tag: "API",
    tagCls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "oklch(0.73 0.2 142)",
    metrics: [
      { label: "Requests/s", value: "1,247", sub: "+12% ↑", up: true },
      { label: "p99 Latency", value: "23ms",  sub: "stable" },
      { label: "Error Rate",  value: "0.02%", sub: "↓ nominal", down: true },
    ],
    spark: "up",
    sparkColor: "oklch(0.73 0.2 142)",
    Icon: Server,
  },
  {
    id: "postgres",
    name: "postgresql",
    tag: "Database",
    tagCls: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    dot: "oklch(0.62 0.19 250)",
    metrics: [
      { label: "Connections", value: "47",    sub: "/ 100 max" },
      { label: "Queries/s",   value: "2,891", sub: "+5% ↑", up: true },
      { label: "DB Size",     value: "12.4 GB", sub: "54% used" },
    ],
    spark: "stable",
    sparkColor: "oklch(0.62 0.19 250)",
    Icon: Database,
  },
  {
    id: "redis",
    name: "redis-cache",
    tag: "Cache",
    tagCls: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "oklch(0.65 0.22 15)",
    metrics: [
      { label: "Hit Rate", value: "98.7%", sub: "excellent", up: true },
      { label: "Memory",   value: "1.2 GB", sub: "/ 4 GB" },
      { label: "Latency",  value: "0.4ms",  sub: "↓ fast", down: true },
    ],
    spark: "stable",
    sparkColor: "oklch(0.65 0.22 15)",
    Icon: Zap,
  },
  {
    id: "game",
    name: "game-server",
    tag: "Game",
    tagCls: "bg-violet-500/10 text-violet-400 border-violet-500/25",
    dot: "oklch(0.65 0.22 300)",
    metrics: [
      { label: "Players Online", value: "1,024", sub: "+148 ↑", up: true },
      { label: "Avg Ping",       value: "18ms",   sub: "low" },
      { label: "CPU",            value: "34%",    sub: "8 instances" },
    ],
    spark: "spiky",
    sparkColor: "oklch(0.65 0.22 300)",
    Icon: Cpu,
  },
  {
    id: "worker",
    name: "task-worker",
    tag: "Worker",
    tagCls: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "oklch(0.75 0.18 80)",
    metrics: [
      { label: "Queue Depth",  value: "124",   sub: "↓ draining", down: true },
      { label: "Processed/h",  value: "8,320", sub: "+3% ↑", up: true },
      { label: "Failures",     value: "3",     sub: "0.04%" },
    ],
    spark: "down",
    sparkColor: "oklch(0.75 0.18 80)",
    Icon: Box,
  },
];

// ── NodeShowcase ───────────────────────────────────────────────────────────────

function NodeShowcase() {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setDir(1);
      setIdx((i) => (i + 1) % SHOWCASE.length);
    }, 3600);
    return () => clearInterval(t);
  }, []);

  function go(next: number) {
    setDir(next > idx ? 1 : -1);
    setIdx(next);
  }

  const node = SHOWCASE[idx]!;

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="relative h-[252px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={node.id}
            initial={{ opacity: 0, y: 12 * dir }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 * dir }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0"
          >
            <div className="relative h-full rounded-2xl border border-white/[0.08] bg-[#0c0c0d] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              {/* top glow */}
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent 10%, ${node.dot}88 50%, transparent 90%)` }}
              />
              {/* corner glow */}
              <div
                className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-30"
                style={{ background: `radial-gradient(circle, ${node.dot}33, transparent 70%)` }}
              />

              <div className="flex flex-col h-full px-5 py-4 gap-3.5">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex size-2 shrink-0 rounded-full animate-pulse"
                      style={{ backgroundColor: node.dot, boxShadow: `0 0 6px ${node.dot}` }}
                    />
                    <span className="text-[13px] font-semibold text-white/85 font-mono truncate">
                      {node.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full leading-none">
                      running
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border leading-none ${node.tagCls}`}>
                      {node.tag}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  {node.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl bg-white/[0.025] border border-white/[0.05] px-3 py-2.5"
                    >
                      <p className="text-[15px] font-semibold text-white/85 leading-tight tabular-nums">
                        {m.value}
                      </p>
                      <p className="text-[10px] text-white/35 leading-tight mt-0.5">{m.label}</p>
                      <p className={`text-[9px] font-medium leading-tight mt-0.5 ${
                        m.up ? "text-emerald-400/70" : m.down ? "text-rose-400/70" : "text-white/25"
                      }`}>
                        {m.sub}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Sparkline */}
                <div className="flex-1 flex flex-col justify-end gap-1">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[9px] text-white/20 font-mono uppercase tracking-wider">24h activity</span>
                    <span className="text-[9px] text-white/20 font-mono uppercase tracking-wider">now</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-2 py-1.5">
                    <Sparkline shape={node.spark} color={node.sparkColor} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5">
        {SHOWCASE.map((n, i) => (
          <button
            key={n.id}
            onClick={() => go(i)}
            className={`rounded-full transition-all duration-300 ${
              i === idx
                ? "w-5 h-[5px] bg-primary"
                : "w-[5px] h-[5px] bg-white/20 hover:bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Hero ─────────────────────────────────────────────────────────────

function DashboardHero({
  displayName,
  onCreateEnv,
  onCreateOrg,
  personalNs,
  isEmpty,
}: {
  displayName: string;
  onCreateEnv: () => void;
  onCreateOrg: () => void;
  personalNs: NamespaceDTO | undefined;
  isEmpty: boolean;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-[#080809]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 80% at 100% 50%, oklch(0.8 0.17 90 / 0.05), transparent 60%), radial-gradient(ellipse 35% 50% at 0% 0%, oklch(0.8 0.17 90 / 0.04), transparent 55%)",
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-2">
        {/* Left: copy + CTA */}
        <div className="flex flex-col justify-center gap-5 px-8 py-10 lg:py-12">
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/60">
              Welcome back, {displayName}
            </p>
            <h1 className="text-[28px] font-semibold tracking-tight text-white/90 leading-snug">
              Your infrastructure,
              <br />
              <span className="text-white/40">visualized &amp; live.</span>
            </h1>
            <p className="text-[13px] text-white/35 leading-relaxed max-w-xs">
              Deploy nodes, monitor services, and manage environments — all from one canvas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {personalNs && (
              <button
                onClick={onCreateEnv}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-[12px] font-semibold text-black hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_0_28px_oklch(0.80_0.17_90_/_0.28)]"
              >
                <Plus className="size-3.5" />
                New Environment
              </button>
            )}
            <button
              onClick={onCreateOrg}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[12px] font-semibold text-white/50 hover:text-white/80 hover:bg-white/[0.08] transition-all"
            >
              <Users className="size-3.5" />
              New Organization
            </button>
          </div>

          {isEmpty && (
            <div className="flex items-center gap-4 pt-1">
              {(["Create env", "Add a node", "Open canvas"] as const).map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-bold text-white/30">
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-white/25">{label}</span>
                  {i < 2 && <ArrowRight className="size-3 text-white/10 ml-0.5" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: animated node showcase */}
        <div className="px-6 py-8 border-t border-white/[0.05] lg:border-t-0 lg:border-l">
          <NodeShowcase />
        </div>
      </div>
    </div>
  );
}

// ── Environment card ───────────────────────────────────────────────────────────

function EnvironmentCard({ env, ns }: { env: EnvironmentDTO; ns: NamespaceDTO }) {
  const workloadsQuery = useQuery({
    queryKey: ["workloads", ns.slug, env.slug],
    queryFn: () => listWorkloads(env.id, { namespaceSlug: ns.slug, environmentSlug: env.slug }),
    staleTime: 30_000,
  });

  const workloads: WorkloadDTO[] = workloadsQuery.data?.workloads ?? [];
  const running = workloads.filter((w) => w.state === "running").length;
  const stopped = workloads.filter((w) => w.state === "stopped").length;
  const failed  = workloads.filter((w) => w.state === "failed").length;
  const pending = workloads.filter((w) => w.state === "pending").length;
  const total   = workloads.length;

  return (
    <div className="group flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-primary/25 hover:bg-white/[0.035] hover:shadow-[0_0_32px_oklch(0.80_0.17_90_/_0.07)] transition-all overflow-hidden">
      <Link href={`/${ns.slug}/${env.slug}`} className="flex-1 p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.07] group-hover:border-white/[0.1] transition-colors">
              {env.is_private
                ? <Lock className="size-3.5 text-white/30" />
                : <Globe className="size-3.5 text-white/30" />
              }
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white/85 group-hover:text-white transition-colors truncate leading-tight">
                {env.name}
              </p>
              <p className="text-[10px] text-white/25 font-mono truncate leading-tight mt-0.5">
                {ns.slug}/{env.slug}
              </p>
            </div>
          </div>
          {ns.type !== "user" && (
            <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-blue-500/10 border-blue-500/20 text-blue-400">
              Org
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
          {workloadsQuery.isLoading ? (
            <Loader2 className="size-3 animate-spin text-white/20" />
          ) : total === 0 ? (
            <span className="text-[11px] text-white/25 italic">No nodes yet</span>
          ) : (
            <>
              {running > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/8 px-1.5 py-0.5 rounded-md border border-emerald-400/15">
                  <Circle className="size-1.5 fill-emerald-400 text-emerald-400" />
                  {running} running
                </span>
              )}
              {pending > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-yellow-400 bg-yellow-400/8 px-1.5 py-0.5 rounded-md border border-yellow-400/15">
                  <Circle className="size-1.5 fill-yellow-400 text-yellow-400" />
                  {pending} pending
                </span>
              )}
              {stopped > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded-md border border-white/[0.07]">
                  <Circle className="size-1.5 fill-white/20 text-white/20" />
                  {stopped} stopped
                </span>
              )}
              {failed > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-400/8 px-1.5 py-0.5 rounded-md border border-rose-400/15">
                  <Circle className="size-1.5 fill-rose-400 text-rose-400" />
                  {failed} failed
                </span>
              )}
            </>
          )}
        </div>
      </Link>

      <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/${ns.slug}/${env.slug}/canvas`}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Open canvas <ArrowRight className="size-3" />
        </Link>
        <Link
          href={`/${ns.slug}/${env.slug}`}
          className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Terminal className="size-3" /> Nodes
        </Link>
      </div>
    </div>
  );
}

// ── Right sidebar panel ────────────────────────────────────────────────────────

function DashboardSidebar({
  totalEnvs,
  totalRunning,
  isWorkloadsLoading,
  workspaceOrgs,
  sharedOrgs,
  onCreateOrg,
  onCreateEnv,
  allProjects,
}: {
  totalEnvs: number;
  totalRunning: number;
  isWorkloadsLoading: boolean;
  workspaceOrgs: NamespaceDTO[];
  sharedOrgs: NamespaceDTO[];
  onCreateOrg: () => void;
  onCreateEnv: (slug: string) => void;
  allProjects: { env: EnvironmentDTO; ns: NamespaceDTO }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Overview</p>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-3.5 text-white/25" />
              <span className="text-[12px] text-white/50">Environments</span>
            </div>
            <span className="text-[13px] font-semibold text-white/80 tabular-nums">{totalEnvs}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="size-3.5 text-white/25" />
              <span className="text-[12px] text-white/50">Running nodes</span>
            </div>
            {isWorkloadsLoading ? (
              <Loader2 className="size-3.5 animate-spin text-white/25" />
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-white/80 tabular-nums">{totalRunning}</span>
                {totalRunning > 0 && (
                  <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_oklch(0.73_0.2_142)]" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Organizations */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-white/[0.05] flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Workspaces</p>
          <button
            onClick={onCreateOrg}
            className="flex items-center gap-0.5 text-[10px] font-semibold text-primary/60 hover:text-primary transition-colors"
          >
            <Plus className="size-3" />
            New
          </button>
        </div>
        {workspaceOrgs.length === 0 ? (
          <div className="px-4 py-4 flex flex-col items-center gap-2 text-center">
            <Users className="size-5 text-white/15" />
            <p className="text-[11px] text-white/30">No organizations yet</p>
            <button
              onClick={onCreateOrg}
              className="text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors"
            >
              Create one →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {workspaceOrgs.map((ns) => {
              const count = allProjects.filter((p) => p.ns.id === ns.id).length;
              return (
                <Link
                  key={ns.id}
                  href={`/${ns.slug}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.025] transition-colors group"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10 border border-blue-500/20">
                    <span className="text-[10px] font-black text-blue-400 leading-none">
                      {(ns.name[0] ?? "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white/70 group-hover:text-white transition-colors truncate">
                      {ns.name}
                    </p>
                    <p className="text-[10px] text-white/25">{count} env{count !== 1 ? "s" : ""}</p>
                  </div>
                  <ArrowRight className="size-3 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Collaborations */}
      {sharedOrgs.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Collaborations</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {sharedOrgs.map((ns) => (
              <Link
                key={ns.id}
                href={`/${ns.slug}`}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.025] transition-colors group"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[10px] font-black text-amber-400 leading-none">
                    {(ns.name[0] ?? "?").toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white/70 group-hover:text-white transition-colors truncate">
                    {ns.name}
                  </p>
                  <p className="text-[10px] text-white/25 capitalize">{ns.user_role}</p>
                </div>
                <ArrowRight className="size-3 text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function AccountHomePage() {
  const auth  = useAuth();
  const router = useRouter();
  const [showOrgModal, setShowOrgModal] = useState(false);

  const user = auth.user;
  const username = (user?.profile?.preferred_username as string | undefined)
    ?? (user?.profile?.sub as string | undefined)
    ?? "user";
  const displayName =
    (user?.profile?.name as string | undefined)?.split(" ")[0]
    ?? (user?.profile?.given_name as string | undefined)
    ?? username;

  const nsQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
    staleTime: 60_000,
  });
  const namespaces   = nsQuery.data?.namespaces ?? [];
  const personalNs   = namespaces.find((ns) => ns.type === "user" && ns.slug === username);
  const otherNs      = namespaces.filter((ns) => ns.id !== personalNs?.id);
  const workspaceOrgs = otherNs.filter((ns) => ns.user_role === "Owner" || ns.user_role === "Admin");
  const sharedOrgs   = otherNs.filter((ns) => ns.user_role !== "Owner" && ns.user_role !== "Admin");

  const envQueries = useQueries({
    queries: namespaces.map((ns) => ({
      queryKey: ["environments", ns.slug],
      queryFn: () => listEnvironments(ns.slug),
      enabled: namespaces.length > 0,
      staleTime: 60_000,
    })),
  });

  const allProjects = namespaces.flatMap((ns, i) => {
    const envs = envQueries[i]?.data?.environments ?? [];
    return envs.map((env) => ({ env, ns }));
  });

  const ownedProjects  = allProjects.filter((p) =>
    p.ns.id === personalNs?.id || p.ns.user_role === "Owner" || p.ns.user_role === "Admin"
  );
  const sharedProjects = allProjects.filter((p) =>
    p.ns.id !== personalNs?.id && p.ns.user_role !== "Owner" && p.ns.user_role !== "Admin"
  );

  const isLoadingProjects = nsQuery.isLoading || envQueries.some((q) => q.isLoading);
  const hasEnvError = !isLoadingProjects && envQueries.some((q) => q.isError);

  const workloadQueries = useQueries({
    queries: allProjects.map(({ env, ns }) => ({
      queryKey: ["workloads", ns.slug, env.slug],
      queryFn: () => listWorkloads(env.id, { namespaceSlug: ns.slug, environmentSlug: env.slug }),
      staleTime: 30_000,
    })),
  });

  const totalRunning = workloadQueries.reduce(
    (acc, q) => acc + (q.data?.workloads ?? []).filter((w) => w.state === "running").length,
    0
  );
  const isWorkloadsLoading = workloadQueries.some((q) => q.isLoading);

  const isEmpty = !isLoadingProjects && ownedProjects.length === 0 && !!personalNs;

  function createEnv(nsSlug: string) {
    router.push(`/new?namespace=${nsSlug}`);
  }

  return (
    <>
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 pb-16 space-y-6 animate-in fade-in duration-500">
        {/* Ambient */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/5 blur-[140px]" />

        {/* ── Hero (always visible) ── */}
        <DashboardHero
          displayName={displayName}
          onCreateEnv={() => personalNs && createEnv(personalNs.slug)}
          onCreateOrg={() => setShowOrgModal(true)}
          personalNs={personalNs}
          isEmpty={isEmpty}
        />

        {/* ── Error banner ── */}
        {hasEnvError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-[13px] text-rose-400/80">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              Some environments couldn&apos;t be loaded.{" "}
              <button
                onClick={() => envQueries.forEach((q) => q.refetch?.())}
                className="underline underline-offset-2"
              >
                Retry
              </button>
            </span>
          </div>
        )}

        {/* ── Body: main + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-start">
          {/* ── Main content ── */}
          <div className="space-y-6 min-w-0">

            {/* Loading */}
            {isLoadingProjects && (
              <div className="flex h-40 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.015]">
                <Loader2 className="size-5 animate-spin text-white/25" />
              </div>
            )}

            {/* No personal namespace */}
            {!nsQuery.isLoading && !personalNs && (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium text-white/50">Your personal workspace isn&apos;t set up yet.</p>
                  <p className="text-[11px] text-white/25 mt-0.5">Refresh to check, or sign out and back in.</p>
                </div>
                <button
                  onClick={() => nsQuery.refetch()}
                  className="shrink-0 h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] font-semibold text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
                >
                  Refresh
                </button>
              </div>
            )}

            {/* Your Environments */}
            {!isLoadingProjects && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                    Your Environments
                  </h2>
                  <span className="text-[11px] text-white/20">
                    {ownedProjects.length} environment{ownedProjects.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {ownedProjects.length === 0 && !isEmpty ? null : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ownedProjects.map(({ env, ns }) => (
                      <EnvironmentCard key={env.id} env={env} ns={ns} />
                    ))}
                    {personalNs && (
                      <button
                        onClick={() => createEnv(personalNs.slug)}
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.07] bg-transparent hover:border-primary/20 hover:bg-white/[0.02] transition-all min-h-[110px] text-white/20 hover:text-primary/60"
                      >
                        <Plus className="size-4" />
                        <span className="text-[11px] font-medium">New Environment</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Active Nodes */}
            {!isWorkloadsLoading && totalRunning > 0 && (() => {
              const active = allProjects.flatMap(({ env, ns }, i) => {
                const wls = workloadQueries[i]?.data?.workloads ?? [];
                return wls
                  .filter((w) => w.state === "running" || w.state === "pending")
                  .map((w) => ({ w, env, ns }));
              }).slice(0, 6);
              if (active.length === 0) return null;
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="size-3.5 text-white/25" />
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Active Nodes</h2>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.04]">
                    {active.map(({ w, env, ns }) => (
                      <Link
                        key={w.id}
                        href={`/${ns.slug}/${env.slug}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors group"
                      >
                        <Circle className={`size-1.5 shrink-0 ${
                          w.state === "running" ? "fill-emerald-400 text-emerald-400" : "fill-yellow-400 text-yellow-400"
                        }`} />
                        <span className="flex-1 text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors truncate">
                          {w.name}
                        </span>
                        <span className="text-[11px] text-white/20 truncate max-w-[120px] shrink-0 font-mono">
                          {ns.slug}/{env.slug}
                        </span>
                        <ArrowRight className="size-3 text-white/15 group-hover:text-white/45 transition-colors shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Shared Environments */}
            {sharedProjects.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Shared with you</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sharedProjects.map(({ env, ns }) => (
                    <EnvironmentCard key={env.id} env={env} ns={ns} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="sticky top-6">
            <DashboardSidebar
              totalEnvs={allProjects.length}
              totalRunning={totalRunning}
              isWorkloadsLoading={isWorkloadsLoading}
              workspaceOrgs={workspaceOrgs}
              sharedOrgs={sharedOrgs}
              onCreateOrg={() => setShowOrgModal(true)}
              onCreateEnv={createEnv}
              allProjects={allProjects}
            />
          </div>
        </div>
      </div>

      <CreateOrgModal open={showOrgModal} onClose={() => setShowOrgModal(false)} />
    </>
  );
}
