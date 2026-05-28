"use client";

import { Activity, BarChart2, Clock, Cpu, Gauge, Zap } from "lucide-react";

const METRIC_CARDS = [
  { icon: Gauge, label: "Request Rate", value: "—" },
  { icon: Clock, label: "P99 Latency", value: "—" },
  { icon: Cpu, label: "Error Rate", value: "—" },
  { icon: Zap, label: "Throughput", value: "—" },
  { icon: Activity, label: "Uptime", value: "—" },
  { icon: BarChart2, label: "Deployments", value: "—" },
];

export function NamespaceMonitoringPage() {
  return (
    <div className="relative min-h-[60vh] flex flex-col items-center justify-center px-6 py-20 overflow-hidden">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 30%, oklch(0.75 0.18 260 / 0.06), transparent 70%)",
        }}
      />

      {/* Blurred metric cards grid */}
      <div className="absolute inset-x-0 top-6 bottom-6 grid grid-cols-3 gap-3 px-6 opacity-40 blur-sm pointer-events-none select-none">
        {METRIC_CARDS.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <Icon className="size-3.5 text-white/30" />
              <span className="text-[11px] font-medium text-white/30 uppercase tracking-wide">
                {label}
              </span>
            </div>
            <span className="text-2xl font-bold text-white/20">{value}</span>
            <div className="h-1.5 rounded-full bg-white/[0.05]" />
          </div>
        ))}
      </div>

      {/* Coming soon content */}
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <Activity className="size-6 text-primary/50" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-lg font-semibold text-white/70">Namespace Monitoring</h1>
            <span className="flex items-center h-[18px] px-2 rounded-full border border-primary/[0.2] bg-primary/[0.08] text-[10px] font-bold text-primary/60 tracking-wide uppercase leading-none">
              Soon
            </span>
          </div>
          <p className="text-sm text-white/35 max-w-xs">
            Aggregate metrics across all projects in this namespace — coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
