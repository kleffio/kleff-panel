"use client";

import { Activity, BarChart2, Clock, Cpu, Gauge, TrendingUp, Zap } from "lucide-react";

const METRIC_CARDS = [
  { icon: Gauge,    label: "Request Rate",  value: "—",   unit: "req/s",  trend: null },
  { icon: Clock,    label: "P99 Latency",   value: "—",   unit: "ms",     trend: null },
  { icon: Cpu,      label: "Error Rate",    value: "—",   unit: "%",      trend: null },
  { icon: Zap,      label: "Throughput",    value: "—",   unit: "MB/s",   trend: null },
  { icon: Activity, label: "Uptime",        value: "—",   unit: "",       trend: null },
  { icon: TrendingUp, label: "Req / day",   value: "—",   unit: "k",      trend: null },
] as const;

export function EnvironmentAnalyticsPage() {
  return (
    <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/5 blur-[80px]" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white">Analytics</h1>
            <span className="flex items-center h-[18px] px-2 rounded-full border border-primary/[0.2] bg-primary/[0.08] text-[10px] font-bold text-primary/60 tracking-wide uppercase leading-none">
              Soon
            </span>
          </div>
          <p className="text-[12px] text-white/35 mt-0.5">Request metrics and performance insights</p>
        </div>
      </div>

      {/* Metric cards grid */}
      <div className="relative">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px] bg-background/40 rounded-2xl pointer-events-none">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
            <BarChart2 className="size-5 text-primary/50" />
          </div>
          <p className="text-[13px] font-medium text-white/50">Analytics coming soon</p>
          <p className="text-[11px] text-white/25 max-w-xs text-center">Request rates, latency histograms, and error tracking across all servers.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 opacity-30 select-none">
          {METRIC_CARDS.map(({ icon: Icon, label, value, unit }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <Icon className="size-3.5 text-white/30" />
                <span className="text-[11px] font-medium text-white/30 uppercase tracking-wide">{label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white/20">{value}</span>
                {unit && <span className="text-[11px] text-white/15">{unit}</span>}
              </div>
              <div className="h-12 rounded-lg bg-white/[0.03] overflow-hidden relative">
                <div className="absolute inset-0 flex items-end px-2 pb-1 gap-0.5">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-primary/20"
                      style={{ height: `${20 + Math.sin(i * 0.8) * 15 + Math.sin(i * 1.7 + 2) * 10}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Latency chart placeholder */}
      <div className="relative mt-4">
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <p className="text-[11px] text-white/20 font-medium">Latency histogram · coming soon</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 opacity-25 select-none">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="size-3.5 text-white/30" />
            <span className="text-[11px] font-medium text-white/30 uppercase tracking-wide">Request latency (24h)</span>
          </div>
          <div className="h-24 flex items-end gap-0.5 px-1">
            {Array.from({ length: 48 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-primary/25"
                style={{ height: `${15 + Math.abs(Math.sin(i * 0.4 + 1)) * 60 + Math.sin(i * 0.15) * 20}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
