import Link from "next/link";
import { Globe, Server, Settings, Sparkles } from "lucide-react";
import type { ProjectsDashboardPageData } from "@/types/projects";

type Project = ProjectsDashboardPageData["projects"][number];

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="relative group">
      <Link
        href={project.href}
        className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/10"
      >
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg text-zinc-50 group-hover:text-amber-400 transition-colors">
            {project.name}
          </h3>
          <div className="flex h-6 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-800/50 px-2.5 text-xs font-medium">
            <span
              className={`h-2 w-2 rounded-full ${
                project.status === "healthy"
                  ? "bg-emerald-500"
                  : project.status === "warning"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
            />
            <span className="capitalize text-zinc-50">{project.status}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-1 items-start gap-3 rounded-xl bg-zinc-800/50 p-4">
          <Sparkles
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              project.status === "healthy"
                ? "text-emerald-500"
                : project.status === "warning"
                ? "text-amber-500"
                : "text-rose-500"
            }`}
          />
          <p className="text-sm text-zinc-400 leading-relaxed font-medium">
            {project.aiSummary}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs font-medium text-zinc-400 border-t border-zinc-800 pt-4">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <span className="uppercase">{project.region}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            {project.servicesCount} Active Services
          </div>
        </div>
      </Link>
      <Link
        href="/admin-panel"
        className="absolute -right-3 -top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 hover:scale-110 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-50 opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Manage Environment Settings"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </div>
  );
}
