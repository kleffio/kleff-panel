"use client";

import { Plus, Search } from "lucide-react";
import { useProjectFilters } from "@/features/projects/hooks/useProjectFilters";
import { ProjectCard } from "@/features/projects/ui/ProjectCard";
import type { ProjectsDashboardPageData } from "@/types/projects";

export function ProjectsDashboard({ projects }: ProjectsDashboardPageData) {
  const { search, setSearch, filter, setFilter, filteredProjects } =
    useProjectFilters(projects);

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500 text-zinc-50">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View and manage your deployed applications.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:opacity-90">
          <Plus className="h-4 w-4" />
          Create Environment
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search environments by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-zinc-700"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-zinc-700 cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredProjects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        {filteredProjects.length === 0 && (
          <div className="col-span-full py-16 text-center text-zinc-400 rounded-xl border border-dashed border-zinc-800">
            No environments found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
