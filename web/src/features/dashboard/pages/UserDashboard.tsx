"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  Container,
  CircleOff,
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  GitCommit,
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Zap,
  Layers,
  Users,
  ChevronRight,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { listWorkloads, type WorkloadDTO } from "@/lib/api/projects";
import { useRouter } from "next/navigation";


// ── Mock billing data (replace with real API when billing is live) ──────────

const MOCK_TRANSACTIONS = [
  { id: "1", date: "Apr 15, 2026", description: "Container runtime — prod-api", amount: 12.40, status: "paid" as const },
  { id: "2", date: "Apr 14, 2026", description: "Container runtime — auth-worker", amount: 8.20, status: "paid" as const },
  { id: "3", date: "Apr 13, 2026", description: "Egress bandwidth", amount: 2.10, status: "paid" as const },
  { id: "4", date: "Apr 10, 2026", description: "Container runtime — redis-cache", amount: 4.80, status: "paid" as const },
  { id: "5", date: "Apr 01, 2026", description: "Pro plan — April", amount: 20.00, status: "paid" as const },
];

const MOCK_ACTIVITY = [
  { icon: "check" as const, message: "prod-api deployed successfully", time: "12 min ago" },
  { icon: "alert" as const, message: "API latency spiked to 450ms", time: "24 min ago" },
  { icon: "check" as const, message: "Database backup completed", time: "4 hr ago" },
  { icon: "commit" as const, message: "auth-worker scaled to 3 replicas", time: "6 hr ago" },
  { icon: "commit" as const, message: "redis-cache provisioned", time: "Yesterday" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function UserDashboard() {
  const auth = useAuth();
  const { currentProjectID } = useCurrentProject();
  const [workloads, setWorkloads] = useState<WorkloadDTO[]>([]);
  const [runningCount, setRunningCount] = useState<number | null>(null);
  const [stoppedCount, setStoppedCount] = useState<number | null>(null);

  const user = auth.user;
  const username = (user?.profile?.preferred_username as string | undefined)
    ?? (user?.profile?.sub as string | undefined)
    ?? "user";
  const displayName =
    user?.profile?.given_name ??
    (user?.profile?.name as string | undefined)?.split(" ")[0] ??
    username ??
    "there";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const totalSpend = MOCK_TRANSACTIONS.reduce((s, t) => s + t.amount, 0);

  useEffect(() => {
    if (!currentProjectID) { setWorkloads([]); setRunningCount(0); setStoppedCount(0); return; }
    listWorkloads(currentProjectID)
      .then((r) => {
        const wl = r.workloads ?? [];
        setWorkloads(wl);
        setRunningCount(wl.filter((w) => w.state === "running").length);
        setStoppedCount(wl.filter((w) => w.state === "stopped" || w.state === "failed").length);
      })
      .catch(() => { setWorkloads([]); setRunningCount(0); setStoppedCount(0); });
  }, [currentProjectID]);

  const metrics = [
    {
      label: "Spend this month",
      value: `$${totalSpend.toFixed(2)}`,
      caption: "+$8.30 from last month",
      trend: "up" as "up" | "down" | null,
      icon: DollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Stopped",
      value: stoppedCount === null ? "—" : String(stoppedCount),
      caption: "Idle or failed containers",
      trend: null,
      icon: CircleOff,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Running containers",
      value: runningCount === null ? "—" : String(runningCount),
      caption: "In this environment",
      trend: null,
      icon: Container,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Requests / min",
      value: "4.2k",
      caption: "+12% from last hour",
      trend: "up" as "up" | "down" | null,
      icon: Activity,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="relative mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500 z-0 px-4 sm:px-6 lg:px-8 pb-12">
      {/* Ambient Background Glows & Grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-kleff-grid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,#000_40%,transparent_100%)] opacity-30" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-80 -z-10 h-[24rem] w-[24rem] rounded-full bg-blue-500/5 blur-[100px]" />
      <div className="pointer-events-none absolute -left-20 top-[30rem] -z-10 h-[24rem] w-[24rem] rounded-full bg-purple-500/5 blur-[100px]" />

      {/* Header */}
      <div className="flex items-start justify-between relative z-10 pt-4">
        <div className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-widest text-primary/80">{greeting},</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white capitalize drop-shadow-sm">{displayName}</h1>
        </div>
        <div className="glass-surface rounded-full px-4 py-1.5 text-xs font-medium text-white/70 shadow-sm border border-white/5">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
      </div>



      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="glass-surface p-6 rounded-2xl flex flex-col gap-4 relative overflow-hidden group transition-all duration-300 hover:bg-white/[0.04] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-white/60 tracking-widest uppercase">{m.label}</p>
              <span className={`flex size-8 items-center justify-center rounded-lg shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/5 ${m.bg}`}>
                <m.icon className={`size-4 ${m.color}`} />
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-semibold tracking-tight text-white drop-shadow-md">{m.value}</p>
              <p className="flex items-center gap-1.5 text-xs text-white/50 font-medium mt-1">
                {m.trend === "up" && <span className="flex items-center justify-center size-4 rounded-full bg-emerald-500/10 text-emerald-400"><TrendingUp className="size-2.5" /></span>}
                {m.trend === "down" && <span className="flex items-center justify-center size-4 rounded-full bg-rose-500/10 text-rose-400"><TrendingDown className="size-2.5" /></span>}
                {m.caption}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">

        {/* Left — Spending + Transactions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel overflow-hidden relative group">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-1/2 bg-primary/5 blur-[60px] rounded-full pointer-events-none" />
            <div className="border-b border-white/[0.06] px-6 py-5 flex items-center justify-between relative z-10">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 border border-primary/20 shadow-[0_0_10px_rgba(245,181,23,0.15)]">
                  <CreditCard className="size-3 text-primary" />
                </span>
                Spending Overview
              </h2>
              <span className="glass-surface px-2.5 py-1 rounded-md text-[10px] font-semibold text-white/60 uppercase tracking-widest border border-white/5">April 2026</span>
            </div>
            <div className="px-6 py-6 relative z-10">
              <div className="flex items-end gap-2.5 h-32 mb-4">
                {[18, 32, 24, 40, 28, 47.50, 35].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end group/bar h-full">
                    <div
                      className="rounded-t-md bg-gradient-kleff opacity-70 group-hover/bar:opacity-100 transition-all cursor-default shadow-[0_0_15px_rgba(245,181,23,0.1)] group-hover/bar:shadow-[0_0_25px_rgba(245,181,23,0.4)] relative overflow-hidden"
                      style={{ height: `${(v / 50) * 100}%` }}
                      title={`$${v}`}
                    >
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-white/40" />
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-semibold text-white/30 uppercase tracking-widest border-t border-white/5 pt-4">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <span key={d} className="flex-1 text-center">{d}</span>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-4">
                <div className="flex-1 min-w-[120px] glass-surface rounded-xl p-4 border border-white/[0.04]">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-1.5">This month</p>
                  <p className="text-2xl font-semibold text-white drop-shadow-sm">${totalSpend.toFixed(2)}</p>
                </div>
                <div className="flex-1 min-w-[120px] glass-surface rounded-xl p-4 border border-white/[0.04]">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-1.5">Plan</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center justify-center size-6 rounded bg-primary/20 text-primary shadow-[0_0_10px_rgba(245,181,23,0.2)]"><Zap className="size-3.5" /></span>
                    <p className="text-xl font-semibold text-white drop-shadow-sm">Pro</p>
                  </div>
                </div>
                <div className="flex-1 min-w-[120px] glass-surface rounded-xl p-4 border border-white/[0.04]">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-1.5">Next invoice</p>
                  <p className="text-xl font-semibold text-white drop-shadow-sm mt-0.5">May 1, 2026</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-6 py-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Transaction History</h2>
              <button className="text-[10px] font-semibold uppercase tracking-widest text-primary hover:text-primary/80 flex items-center gap-1 transition-colors bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-md border border-primary/20">
                View all <ArrowUpRight className="size-3" />
              </button>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {MOCK_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.03] transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-white/[0.03] border border-white/[0.05] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all duration-300">
                      <DollarSign className="size-4 text-white/40 group-hover:text-primary transition-colors duration-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">{tx.description}</p>
                      <p className="text-[11px] font-medium text-white/40 mt-1 uppercase tracking-wider">{tx.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <span className="text-sm font-medium text-white drop-shadow-sm font-mono">${tx.amount.toFixed(2)}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest rounded-md px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Containers + Activity */}
        <div className="space-y-6">
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-6 py-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Containers</h2>
              <span className="flex size-5 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white border border-white/10">
                {workloads.length}
              </span>
            </div>
            <div className="p-3">
              {workloads.length === 0 ? (
                <div className="py-8 text-center px-4">
                  <div className="mx-auto size-12 rounded-xl bg-white/5 border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] flex items-center justify-center mb-4">
                    <Container className="size-5 text-white/30" />
                  </div>
                  <p className="text-[13px] text-white/50 leading-relaxed">
                    No containers yet.<br />Add a node from the canvas to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {workloads.map((w) => {
                    const isRunning = w.state === "running";
                    const isFailed = w.state === "failed";
                    const dotColor = isRunning
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                      : isFailed
                      ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
                      : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
                    return (
                      <div
                        key={w.id}
                        className="flex items-center gap-3.5 rounded-xl px-3 py-3 border border-transparent hover:bg-white/[0.04] hover:border-white/[0.05] transition-all group"
                      >
                        <div className={`size-2 rounded-full shrink-0 ${dotColor}`} />
                        <span className="flex-1 text-[13px] font-medium text-white/70 group-hover:text-white transition-colors truncate">{w.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">{w.state}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="border-b border-white/[0.06] px-6 py-5">
              <h2 className="text-sm font-semibold text-white">Activity Feed</h2>
            </div>
            <div className="p-6">
              <div className="relative space-y-6 before:absolute before:inset-y-0 before:left-3.5 before:w-px before:bg-gradient-to-b before:from-white/10 before:via-white/10 before:to-transparent">
                {MOCK_ACTIVITY.map((item, i) => (
                  <div key={i} className="relative flex gap-5 items-start group">
                    <div className="relative z-10 flex size-7 items-center justify-center rounded-full bg-[#141416] border border-white/10 shadow-[0_0_0_4px_rgba(20,20,22,0.8)] group-hover:border-white/20 transition-colors mt-0.5">
                      {item.icon === "commit" && <GitCommit className="size-3.5 text-white/40 group-hover:text-white/80 transition-colors" />}
                      {item.icon === "alert" && <AlertCircle className="size-3.5 text-rose-400" />}
                      {item.icon === "check" && <CheckCircle2 className="size-3.5 text-emerald-400" />}
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className="text-[13px] font-medium text-white/80 leading-snug group-hover:text-white transition-colors">{item.message}</p>
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/40 flex items-center gap-1.5 mt-1.5">
                        <Clock className="size-3" /> {item.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
