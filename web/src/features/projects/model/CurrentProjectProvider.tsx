"use client";

import * as React from "react";
import { listProjects, type ProjectDTO } from "@/lib/api";

// Extended DTO — the API may optionally return namespace_slug + environment_slug
// for environment-era projects.
// v2: removed pathname/router hooks - no longer needed
type ProjectDTOExtended = ProjectDTO & {
  namespace_slug?: string;
  environment_slug?: string;
};

type CurrentProjectContextValue = {
  projects: ProjectDTOExtended[];
  currentProjectID: string | null;
  setCurrentProjectID: (projectID: string) => void;
  refreshProjects: () => Promise<void>;
  isLoading: boolean;
};

const CurrentProjectContext = React.createContext<CurrentProjectContextValue | null>(null);

const storageKey = "kleff.currentProjectSlug";



export function CurrentProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<ProjectDTOExtended[]>([]);
  const [currentProjectID, setCurrentProjectIDState] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const setCurrentProjectID = React.useCallback((projectID: string) => {
    setCurrentProjectIDState(projectID);
  }, []);

  const refreshProjects = React.useCallback(async () => {
    const response = await listProjects();
    const loaded = (response.projects ?? []) as ProjectDTOExtended[];
    setProjects(loaded);

    const persistedSlug = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const persisted = persistedSlug ? loaded.find((p) => p.slug === persistedSlug) : null;

    if (persisted) {
      setCurrentProjectIDState(persisted.id);
      return;
    }
    const defaultProject = loaded.find((p) => p.is_default) ?? loaded[0];
    if (defaultProject) {
      setCurrentProjectIDState(defaultProject.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, defaultProject.slug);
      }
    } else {
      setCurrentProjectIDState(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    refreshProjects()
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setCurrentProjectIDState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshProjects]);

  // Persist slug when currentProjectID changes.
  React.useEffect(() => {
    if (!currentProjectID) return;
    const proj = projects.find((p) => p.id === currentProjectID);
    if (proj && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, proj.slug);
    }
  }, [currentProjectID, projects]);

  return (
    <CurrentProjectContext.Provider value={{ projects, currentProjectID, setCurrentProjectID, refreshProjects, isLoading }}>
      {children}
    </CurrentProjectContext.Provider>
  );
}

export function useCurrentProject() {
  const ctx = React.useContext(CurrentProjectContext);
  if (!ctx) throw new Error("useCurrentProject must be used within CurrentProjectProvider");
  return ctx;
}


