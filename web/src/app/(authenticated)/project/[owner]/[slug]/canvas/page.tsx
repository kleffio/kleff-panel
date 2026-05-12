"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { ProjectArchitecturePage } from "@/features/projects/pages/ProjectArchitecturePage";

export default function ProjectWorkspacePage() {
  const { owner, slug } = useParams<{ owner: string; slug: string }>();
  const { projects, setCurrentProjectID } = useCurrentProject();

  const project = projects.find((p) => p.slug === slug);

  useEffect(() => {
    if (project) setCurrentProjectID(project.id);
  }, [project, setCurrentProjectID]);

  if (!project) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050505]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-[-18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(245,181,23,0.22)_0%,rgba(245,181,23,0)_72%)]" />
        <div className="absolute -left-24 bottom-[-18%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(245,181,23,0.14)_0%,rgba(245,181,23,0)_74%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,4,0.48)_0%,rgba(4,4,4,0.8)_100%)]" />
      </div>

      <div className="relative z-10 h-full">
        <ProjectArchitecturePage
          projectID={project.id}
          scope={{ namespaceSlug: owner, environmentSlug: slug }}
        />
      </div>
    </div>
  );
}
