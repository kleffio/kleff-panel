"use client";

import * as React from "react";
import { ScrollText, Loader2, ChevronDown, ChevronUp, Filter } from "lucide-react";

export function AdminAuditPage() {
  const [expandedFilters, setExpandedFilters] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white/90">Audit Log</h1>
        <p className="mt-1 text-[13px] text-white/40">
          A record of administrative actions taken across all namespaces.
        </p>
      </div>

      <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2 text-[12px] text-white/30">
            <ScrollText className="size-3.5" />
            <span>No audit events yet</span>
          </div>
          <button
            onClick={() => setExpandedFilters((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/50 transition-colors"
          >
            <Filter className="size-3" />
            Filters
            {expandedFilters ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>

        {expandedFilters && (
          <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-3">
            <input
              placeholder="Filter by actor, action, or resource…"
              className="flex-1 rounded bg-white/[0.06] border border-white/[0.1] px-3 py-1.5 text-[12px] text-white/70 placeholder-white/20 outline-none focus:border-white/20"
            />
          </div>
        )}

        <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-white/[0.07]">
            <ScrollText className="size-5 text-white/20" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/40">Audit log is empty</p>
            <p className="mt-1 text-[12px] text-white/20">
              Admin actions such as quota changes and namespace updates will appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
