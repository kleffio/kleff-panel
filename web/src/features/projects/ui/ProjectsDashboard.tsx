"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Globe, Plus, Search, Server, Settings, Sparkles } from "lucide-react";
import type { ProjectsDashboardPageData } from "@/types/projects";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@kleffio/ui";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const;

export function ProjectsDashboard({ projects }: ProjectsDashboardPageData) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");

  const activeLabel = STATUS_OPTIONS.find((o) => o.value === filter)?.label ?? "All statuses";

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" ? true : p.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500 text-zinc-50">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
          <p className="mt-1 text-sm text-zinc-400">View and manage your deployed applications.</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus />
            Create Environment
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search environments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full sm:w-auto gap-1.5">
              {activeLabel}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => setFilter(opt.value)}
                className={filter === opt.value ? "text-primary font-medium" : ""}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredProjects.map((project) => (
          <div key={project.id} className="group relative">
            <Link
              href={project.href}
              className="flex h-full flex-col rounded-xl border border-white/8 bg-white/[0.03] p-5 transition-all duration-200 hover:border-[#f5b517]/30 hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(245,181,23,0.06)]"
            >
              {/* Card top */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-base text-white/90 group-hover:text-[#f5b517] transition-colors leading-snug">
                  {project.name}
                </h3>
                <div className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  project.status === "healthy"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : project.status === "warning"
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                      : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    project.status === "healthy" ? "bg-emerald-400" : project.status === "warning" ? "bg-amber-400" : "bg-red-400"
                  }`} />
                  <span className="capitalize">{project.status}</span>
                </div>
              </div>

              {/* AI summary */}
              <div className="mt-3.5 flex flex-1 items-start gap-2.5 rounded-lg border border-white/6 bg-white/[0.03] p-3">
                <Sparkles className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  project.status === "healthy" ? "text-emerald-400" : project.status === "warning" ? "text-amber-400" : "text-red-400"
                }`} />
                <p className="text-xs text-white/50 leading-relaxed">{project.aiSummary}</p>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3.5 text-[11px] text-white/35">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  <span className="uppercase tracking-wide">{project.region}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Server className="h-3 w-3" />
                  <span>{project.servicesCount} services</span>
                </div>
              </div>
            </Link>

            {/* Settings gear */}
            <Link
              href="/admin-panel"
              title="Environment settings"
              className="absolute -right-2.5 -top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-white/30 shadow-md transition-all duration-200 hover:border-[#f5b517]/40 hover:text-[#f5b517] opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>
        ))}
        {filteredProjects.length === 0 && (
          <div className="col-span-full py-16 text-center text-white/30 rounded-xl border border-dashed border-white/8">
            No environments match your search.
          </div>
        )}
      </div>
    </div>
  );
}
