"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Maximize2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

import type { InfrastructureNode, NodeAction } from "@/features/hosting/model/types";
import { getStatusMeta } from "@/features/hosting/lib/infrastructure-graph";
import { Button } from "@kleffio/ui";
import { Sheet, SheetContent, SheetTitle } from "@kleffio/ui";
import { getProjectMetrics, type WorkloadMetricsDTO } from "@/lib/api/usage";
import { getWorkloadLogs, type LogLineDTO } from "@/lib/api/logs";
import type { EnvironmentScope } from "@/lib/api/projects";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";

// ── Log viewer ─────────────────────────────────────────────────────────────────

const LOG_POLL_MS = 5_000;

type LogLevel = "error" | "warn" | "info" | "debug" | "trace" | "default";

function detectLevel(line: string): LogLevel {
  const u = line.toUpperCase();
  if (/\/(ERROR|SEVERE|FATAL)\]|\[ERROR\]|\bERROR\b/.test(u)) return "error";
  if (/\/WARN(ING)?\]|\[WARN\]|\bWARN\b/.test(u)) return "warn";
  if (/\/DEBUG\]|\[DEBUG\]/.test(u)) return "debug";
  if (/\/TRACE\]|\[TRACE\]|\[FINE\]/.test(u)) return "trace";
  if (/\/INFO\]|\[INFO\]/.test(u)) return "info";
  return "default";
}

const LEVEL_MSG_CLS: Record<LogLevel, string> = {
  error:   "text-red-400/90",
  warn:    "text-amber-300/85",
  info:    "text-white/65",
  debug:   "text-white/35",
  trace:   "text-white/22",
  default: "text-white/60",
};

function renderLogSegments(line: string, stream: string) {
  if (stream === "stderr") return <span className="text-red-400/80">{line}</span>;

  const level = detectLevel(line);
  const msgCls = LEVEL_MSG_CLS[level];

  // Split on bracketed tokens [...]
  const parts = line.split(/(\[[^\]]*\])/);

  return (
    <>
      {parts.map((part, i) => {
        if (!part.startsWith("[") || !part.endsWith("]")) {
          return <span key={i} className={msgCls}>{part}</span>;
        }
        const u = part.toUpperCase();
        const cls =
          /\/ERROR\]|\/SEVERE\]|\/FATAL\]/.test(u) ? "text-red-400/75" :
          /\/WARN(ING)?\]/.test(u)                  ? "text-amber-400/80" :
          /\/INFO\]/.test(u)                         ? "text-emerald-400/55" :
          /\/DEBUG\]/.test(u)                        ? "text-purple-400/50" :
          /\/TRACE\]|\/FINE\]/.test(u)               ? "text-white/20" :
                                                       "text-white/25";
        return <span key={i} className={cls}>{part}</span>;
      })}
    </>
  );
}

function LogViewer({ node, scope }: { node: InfrastructureNode; scope?: EnvironmentScope }) {
  const { currentProjectID } = useCurrentProject();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<LogLineDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const autoScroll = useRef(true);

  useEffect(() => {
    if (!currentProjectID) return;
    let cancelled = false;
    setLoading(true);
    setLines([]);
    autoScroll.current = true;

    const fetch = () => {
      getWorkloadLogs(currentProjectID, node.id, 200, scope).then((res) => {
        if (cancelled) return;
        setLines(res.lines ?? []);
        setLoading(false);
      }).catch(() => { if (!cancelled) setLoading(false); });
    };

    fetch();
    const id = setInterval(fetch, LOG_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [node.id, currentProjectID, scope]);

  useEffect(() => {
    if (autoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-[oklch(0.065_0_0)] font-mono text-[11px] leading-[1.65]"
      onScroll={(e) => {
        const el = e.currentTarget;
        autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      <div className="p-4 pb-6">
        {loading && (
          <p className="text-white/25 animate-pulse">Loading logs…</p>
        )}
        {!loading && lines.length === 0 && (
          <p className="text-white/25">No logs yet. Logs appear within ~5 seconds of output.</p>
        )}
        {lines.map((l) => {
          const level = l.stream === "stderr" ? "error" : detectLevel(l.line);
          const rowBg =
            level === "error" ? "bg-red-500/[0.06]" :
            level === "warn"  ? "bg-amber-500/[0.05]" :
            "";
          return (
            <div key={l.id} className={`flex gap-3 px-1 py-[1px] rounded-[2px] ${rowBg}`}>
              <span className="w-[52px] shrink-0 select-none tabular-nums text-white/20 pt-px">
                {new Date(l.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="break-all">{renderLogSegments(l.line, l.stream)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Metric bar ─────────────────────────────────────────────────────────────────

function MetricBar({ label, pct, primary, secondary }: { label: string; pct: number; primary: string; secondary?: string }) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  const color = clampedPct > 80 ? "bg-red-500" : clampedPct > 60 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="space-y-1.5 rounded-[0.35rem] border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-wide text-white/40">{label}</span>
        <span className="font-medium text-white/70">{primary}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[0.2rem] bg-white/8">
        <div className={`h-full rounded-[0.2rem] ${color} transition-all duration-700`} style={{ width: `${clampedPct}%` }} />
      </div>
      {secondary && <p className="text-[11px] text-white/35">{secondary}</p>}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-[11px]">
      <span className="uppercase tracking-wide text-white/40">{label}</span>
      <span className="font-medium tabular-nums text-white/70">{value}</span>
    </div>
  );
}

// ── Live metrics fetcher ────────────────────────────────────────────────────────

function fmtMemory(mb: number): { primary: string; secondary: string } {
  if (mb >= 1000) {
    return { primary: `${(mb / 1024).toFixed(2)} GB`, secondary: `${mb} MB` };
  }
  return { primary: `${mb} MB`, secondary: `${(mb / 1024).toFixed(2)} GB` };
}

function WorkloadMetricsTab({
  workloadId,
  cpuLimitMillicores,
  memoryLimitBytes,
  scope,
}: {
  workloadId: string;
  cpuLimitMillicores?: number;
  memoryLimitBytes?: number;
  scope?: EnvironmentScope;
}) {
  const { currentProjectID } = useCurrentProject();
  const [data, setData] = useState<WorkloadMetricsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!currentProjectID) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getProjectMetrics(currentProjectID, scope)
      .then((res) => {
        if (cancelled) return;
        const found = res.workloads?.find((w) => w.workload_id === workloadId) ?? null;
        setData(found);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workloadId, currentProjectID, scope]);

  if (loading) {
    return <p className="text-[11px] text-white/40 p-5">Loading metrics…</p>;
  }
  if (error || !data) {
    return <p className="text-[11px] text-white/40 p-5">No metrics available yet. Start the workload and wait up to 30 s.</p>;
  }

  const fmt = (n: number, d = 1) => n.toFixed(d);
  const cpuLimitM = (data.cpu_limit_millicores > 0 ? data.cpu_limit_millicores : cpuLimitMillicores) ?? 1000;
  const memLimitMB = data.memory_limit_bytes > 0
    ? data.memory_limit_bytes / (1024 * 1024)
    : memoryLimitBytes ? memoryLimitBytes / (1024 * 1024) : 2048;
  const cpuM = Math.min(data.cpu_millicores, cpuLimitM);
  const memMB = Math.min(data.memory_mb, memLimitMB);
  const cpuPct = (cpuM / cpuLimitM) * 100;
  const memPct = (memMB / memLimitMB) * 100;
  const memDisplay = fmtMemory(memMB);
  const memLimitDisplay = fmtMemory(memLimitMB);

  return (
    <div className="space-y-3 p-5">
      <MetricBar
        label="CPU"
        pct={cpuPct}
        primary={`${fmt(cpuM / 1000, 2)} cores`}
        secondary={`${fmt(cpuM / 1000, 2)} / ${fmt(cpuLimitM / 1000, 2)} cores`}
      />
      <MetricBar
        label="Memory"
        pct={memPct}
        primary={memDisplay.primary}
        secondary={`${memDisplay.secondary} / ${memLimitDisplay.primary}`}
      />
      <div className="rounded-[0.35rem] border border-white/8 bg-white/[0.03] px-3 divide-y divide-white/8">
        <StatRow label="Net In"    value={`${fmt(data.network_in_kbps)} KB/s`} />
        <StatRow label="Net Out"   value={`${fmt(data.network_out_kbps)} KB/s`} />
        <StatRow label="Disk Read" value={`${fmt(data.disk_read_kbps)} KB/s`} />
        <StatRow label="Disk Write" value={`${fmt(data.disk_write_kbps)} KB/s`} />
      </div>
      <p className="text-[10px] text-white/25">
        Last update: {new Date(data.recorded_at).toLocaleTimeString()}
      </p>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = "logs" | "overview" | "metrics";

// ── Status icon ────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: InfrastructureNode["status"] }) {
  if (status === "running") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === "deleting") return <XCircle className="h-4 w-4 text-red-300/70" />;
  return <Circle className="h-4 w-4 animate-pulse text-amber-400" />;
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export const NodeDetailsPanel = memo(function NodeDetailsPanel({
  node,
  open,
  onOpenChange,
  onAction,
  relatedNodes,
  scope,
}: {
  node: InfrastructureNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (nodeId: string, action: NodeAction) => void;
  relatedNodes: InfrastructureNode[];
  scope?: EnvironmentScope;
}) {
  const { currentProjectID } = useCurrentProject();
  const [tab, setTab] = useState<Tab>("logs");
  const [isSheetOpen, setIsSheetOpen] = useState(open);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = node ? getStatusMeta(node.status) : null;

  const endpointValue = useMemo(() => {
    if (!node) return "";

    const fromHighlights = node.panel.highlights
      .find((line) => line.toLowerCase().startsWith("endpoint:"))
      ?.replace(/^endpoint:\s*/i, "")
      .trim();

    return (node.footer?.trim() || fromHighlights || "").trim();
  }, [node]);

  const showEndpoint = useMemo(() => {
    if (!endpointValue) return false;
    if (endpointValue.toLowerCase().includes("pending")) return false;

    return /(https?:\/\/|localhost|:\d{2,5}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[a-z0-9.-]+\.[a-z]{2,}\b)/i.test(endpointValue);
  }, [endpointValue]);

  const overviewHighlights = useMemo(() => {
    if (!node) return [];

    return node.panel.highlights.filter((line) => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith("endpoint:")) return false;
      if (normalized.startsWith("state:")) return false;

      return true;
    });
  }, [node]);

  // Reset to logs tab when a new node is selected
  useEffect(() => {
    setTab("logs");
  }, [node?.id]);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsSheetOpen(true);
      return;
    }

    setIsSheetOpen(false);
  }, [open, node?.id]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsSheetOpen(true);
      onOpenChange(true);
      return;
    }

    setIsSheetOpen(false);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onOpenChange(false);
    }, 260);
  };

  return (
    <Sheet open={isSheetOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="right"
        className="origin-right flex !right-4 !top-4 !bottom-4 !h-auto !w-[820px] ![max-width:calc(100vw-4rem)] flex-col overflow-hidden rounded-[0.5rem] border border-white/[0.08] bg-[linear-gradient(160deg,oklch(0.11_0_0)_0%,oklch(0.085_0_0)_50%,oklch(0.07_0_0)_100%)] p-0 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_40px_80px_rgba(0,0,0,0.8),-60px_0_140px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm data-[state=open]:duration-520 data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=open]:slide-in-from-right-8 data-[state=open]:zoom-in-[97%] data-[state=closed]:duration-260 data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)] data-[state=closed]:slide-out-to-right-5 data-[state=closed]:zoom-out-[99%]"
      >
        <SheetTitle className="sr-only">Node Details</SheetTitle>
        {node ? (
          <>
            {/* ── Header ────────────────────────────────────────────── */}
            <div className="border-b border-white/[0.07] px-5 pt-5 pb-0 bg-[linear-gradient(180deg,oklch(0.13_0_0)_0%,transparent_100%)]">
              <div className="mb-4 flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold leading-tight text-white">
                    {node.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/40">
                    {node.subtitle || node.kind}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-[0.3rem] border border-white/10 bg-white/5 px-2.5 py-1 text-[11px]">
                  <StatusIcon status={node.status} />
                  <span className={status?.textClassName ?? "text-white/60"}>{status?.label}</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0">
                {(["logs", "overview", "metrics"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative px-4 pb-3 text-[12px] font-medium capitalize transition-colors ${
                      tab === t
                        ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:rounded-full after:bg-primary"
                        : "text-white/35 hover:text-white/65"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tab body ─────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {tab === "logs" ? (
                  <motion.div
                    key="logs"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <LogViewer node={node} scope={scope} />
                  </motion.div>
                ) : null}

                {tab === "metrics" ? (
                  <motion.div
                    key="metrics"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full overflow-y-auto"
                  >
                    <WorkloadMetricsTab
                      workloadId={node.id}
                      cpuLimitMillicores={node.cpuLimitMillicores}
                      memoryLimitBytes={node.memoryLimitBytes}
                      scope={scope}
                    />
                  </motion.div>
                ) : null}

                {tab === "overview" ? (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full space-y-4 overflow-y-auto p-5"
                  >
                    <div className="rounded-[0.4rem] border border-white/[0.08] bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.03]">
                      <p className="mb-2 text-[11px] uppercase tracking-wide text-white/70">
                        Container information
                      </p>
                      <div className="divide-y divide-white/8 text-xs">
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span className="text-[10px] uppercase tracking-wide text-white/40">Name</span>
                          <span className="text-right text-white/82">{node.name}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span className="text-[10px] uppercase tracking-wide text-white/40">Image</span>
                          <span className="max-w-[65%] truncate text-right text-white/82">{node.subtitle || "n/a"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span className="text-[10px] uppercase tracking-wide text-white/40">Container ID</span>
                          <span className="max-w-[70%] truncate text-right font-mono text-[11px] text-white/74">{node.id}</span>
                        </div>
                        {showEndpoint ? (
                          <div className="flex items-center justify-between gap-3 py-2.5">
                            <span className="text-[10px] uppercase tracking-wide text-white/40">Endpoint</span>
                            <span className="max-w-[65%] break-all text-right text-white/82">{endpointValue}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[0.35rem] border border-white/8 bg-white/[0.03] p-4">
                      <p className="mb-3 text-[11px] uppercase tracking-wide text-white/40">Details</p>
                      {overviewHighlights.length > 0 ? (
                        <ul className="space-y-2">
                          {overviewHighlights.map((h) => (
                            <li key={h} className="text-xs leading-5 text-white/60">{h}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs leading-5 text-white/55">No runtime issues reported.</p>
                      )}
                    </div>

                    {relatedNodes.length > 0 ? (
                      <div className="rounded-[0.35rem] border border-white/8 bg-white/[0.03] p-4">
                        <p className="mb-3 text-[11px] uppercase tracking-wide text-white/40">
                          Connected services
                        </p>
                        <div className="space-y-2">
                          {relatedNodes.map((rn) => (
                            <div
                              key={rn.id}
                              className="rounded-[0.25rem] border border-white/6 bg-black/20 px-3 py-2"
                            >
                              <p className="text-xs font-medium text-white/80">{rn.name}</p>
                              <p className="mt-0.5 text-[11px] text-white/35">{rn.subtitle}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {node.badges.length > 0 ? (
                      <div className="rounded-[0.35rem] border border-white/8 bg-white/[0.03] p-4">
                        <p className="mb-3 text-[11px] uppercase tracking-wide text-white/40">Labels</p>
                        <div className="flex flex-wrap gap-2">
                          {node.badges.map((badge) => (
                            <span
                              key={badge}
                              className="rounded-[0.22rem] border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/50"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* ── Footer action bar ─────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-white/[0.07] bg-[oklch(0.065_0_0)] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <StatusIcon status={node.status} />
                <span>{status?.label}</span>
              </div>

              <div className="flex items-center gap-2">
                {node.route ? (
                  <Button
                    asChild
                    size="sm"
                    className="h-8 rounded-[0.3rem] bg-white/[0.07] text-[12px] text-white/70 hover:bg-primary/10 hover:text-primary"
                  >
                    <Link href={node.route}>
                      Open
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
                {node.actions.includes("scale") ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-[0.3rem] text-[12px] text-white/60 hover:bg-white/8 hover:text-white/80"
                    onClick={() => onAction(node.id, "scale")}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Scale
                  </Button>
                ) : null}
                {node.actions.includes("restart") ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-[0.3rem] text-[12px] text-white/60 hover:bg-white/8 hover:text-white/80"
                    onClick={() => onAction(node.id, "restart")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restart
                  </Button>
                ) : null}
                {node.actions.includes("delete") ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-[0.3rem] text-[12px] text-red-400/70 hover:bg-red-400/10 hover:text-red-300"
                    onClick={() => onAction(node.id, "delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}, (prev, next) =>
  prev.open === next.open &&
  prev.node?.id === next.node?.id &&
  prev.node?.status === next.node?.status &&
  prev.node?.metrics.cpu === next.node?.metrics.cpu &&
  prev.node?.metrics.ram === next.node?.metrics.ram &&
  prev.node?.metrics.ramLabel === next.node?.metrics.ramLabel &&
  prev.node?.metrics.traffic === next.node?.metrics.traffic &&
  prev.relatedNodes === next.relatedNodes
);
