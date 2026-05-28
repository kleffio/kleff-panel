"use client";

import { CheckCircle2, GitCommit, Loader2, RefreshCw, XCircle, Zap } from "lucide-react";

const FAKE_DEPLOYMENTS = [
  { id: "dep_1", status: "success", message: "feat: add canvas node drag & drop", sha: "a1b2c3d", branch: "main", author: "jeremy", ago: "2 hours ago", duration: "1m 12s" },
  { id: "dep_2", status: "success", message: "fix: resolve variable interpolation bug", sha: "e4f5a6b", branch: "main", author: "jeremy", ago: "5 hours ago", duration: "58s" },
  { id: "dep_3", status: "failed",  message: "chore: bump plugin-sdk-go to v1.4.2", sha: "c7d8e9f", branch: "main", author: "jeremy", ago: "1 day ago", duration: "34s" },
  { id: "dep_4", status: "success", message: "feat: namespace monitoring page stub", sha: "f1a2b3c", branch: "main", author: "jeremy", ago: "2 days ago", duration: "1m 04s" },
  { id: "dep_5", status: "success", message: "refactor: sidebar scrollable nav", sha: "d4e5f6a", branch: "main", author: "jeremy", ago: "3 days ago", duration: "49s" },
] as const;

function StatusIcon({ status }: { status: "success" | "failed" | "running" }) {
  if (status === "success") return <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />;
  if (status === "failed")  return <XCircle className="size-4 text-rose-400 shrink-0" />;
  return <Loader2 className="size-4 text-amber-400 shrink-0 animate-spin" />;
}

export function EnvironmentDeploymentsPage() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/5 blur-[80px]" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Deployments</h1>
            <span className="flex items-center h-[18px] px-2 rounded-full border border-primary/[0.2] bg-primary/[0.08] text-[10px] font-bold text-primary/60 tracking-wide uppercase leading-none">
              Soon
            </span>
          </div>
          <p className="text-[12px] text-white/35 mt-0.5">Deployment history and rollbacks</p>
        </div>
        <button
          disabled
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.07] bg-white/[0.02] text-[12px] font-medium text-white/25 cursor-not-allowed"
        >
          <RefreshCw className="size-3.5" />
          Trigger deploy
        </button>
      </div>

      <div className="relative">
        {/* Blur overlay */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-[1px] bg-background/30 rounded-2xl pointer-events-none">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
            <Zap className="size-5 text-primary/50" />
          </div>
          <p className="text-[13px] font-medium text-white/50">Deployment pipeline coming soon</p>
          <p className="text-[11px] text-white/25 max-w-xs text-center">Connect a Git provider to enable automatic deploys and rollbacks.</p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden opacity-50 select-none">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <GitCommit className="size-3.5 text-white/40" />
            <span className="text-[12px] font-semibold text-white/60">Recent deployments</span>
            <span className="ml-auto text-[10px] text-white/25">{FAKE_DEPLOYMENTS.length} total</span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {FAKE_DEPLOYMENTS.map((dep) => (
              <div key={dep.id} className="flex items-center gap-3 px-4 py-3.5">
                <StatusIcon status={dep.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/75 truncate">{dep.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-white/30">{dep.sha}</span>
                    <span className="text-white/15 text-[10px]">·</span>
                    <span className="text-[10px] text-white/30">{dep.branch}</span>
                    <span className="text-white/15 text-[10px]">·</span>
                    <span className="text-[10px] text-white/30">{dep.author}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-white/35">{dep.ago}</p>
                  <p className="text-[10px] text-white/20 mt-0.5">{dep.duration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
