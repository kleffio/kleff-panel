"use client";

import * as React from "react";
import { Activity, Boxes, Database, Globe, HardDrive, Server, Shield, Swords } from "lucide-react";
import {
  listWorkloadsByNamespace,
  deleteWorkloadFromNamespace,
  type WorkloadDTO,
} from "@/lib/api/projects";
import { ArchitectureView } from "@/features/hosting/pages/ArchitectureView";
import type {
  InfrastructureEdge,
  InfrastructureNode,
  NodeKind,
  NodeStatus,
} from "@/features/hosting/model/types";

const KIND_ICONS: Record<NodeKind, typeof Activity> = {
  app: Globe,
  api: Server,
  worker: Boxes,
  database: Database,
  cache: HardDrive,
  proxy: Shield,
  "game-server": Swords,
  support: Activity,
};

function hashInt(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededRange(seed: string, min: number, max: number): number {
  return min + (hashInt(seed) % (max - min + 1));
}

function inferNodeKind(image: string, blueprintID: string): NodeKind {
  const s = `${image} ${blueprintID}`.toLowerCase();
  if (/postgres|mysql|mariadb|mongo/.test(s)) return "database";
  if (/redis|cache|memcached/.test(s)) return "cache";
  if (/proxy|traefik|envoy|nginx/.test(s)) return "proxy";
  if (/worker|queue|jobs/.test(s)) return "worker";
  if (/minecraft|game/.test(s)) return "game-server";
  if (/web|frontend|next/.test(s)) return "app";
  return "api";
}

function mapStateToStatus(state: WorkloadDTO["state"], isDeleting: boolean): NodeStatus {
  if (isDeleting) return "deleting";
  if (state === "running") return "running";
  if (state === "pending") return "starting";
  return "error";
}

function fallbackPosition(index: number) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return { x: 80 + col * 340, y: 80 + row * 360 };
}

function gridKey(pos: { x: number; y: number }) {
  return `${Math.round(pos.x / 340)}:${Math.round(pos.y / 360)}`;
}

function reservePosition(preferred: { x: number; y: number }, occupied: Set<string>) {
  let candidate = preferred;
  let attempt = 0;
  while (occupied.has(gridKey(candidate))) {
    attempt++;
    candidate = { x: preferred.x + (attempt % 4) * 340, y: preferred.y + Math.floor(attempt / 4) * 360 };
  }
  occupied.add(gridKey(candidate));
  return candidate;
}

function buildNode(
  workload: WorkloadDTO,
  position: { x: number; y: number },
  isDeleting: boolean,
  namespaceSlug: string,
): InfrastructureNode {
  const displayName = workload.name || workload.id;
  const kind = inferNodeKind(workload.image, workload.blueprint_id);
  const status = mapStateToStatus(workload.state, isDeleting);
  const cpu = seededRange(`${workload.id}-cpu`, 18, 92);
  const ram = seededRange(`${workload.id}-ram`, 20, 89);

  return {
    id: workload.id,
    name: displayName,
    subtitle: workload.image,
    route: `/${namespaceSlug}/servers/${workload.id}`,
    description: workload.error_message || `Workload ${displayName} (${workload.state}).`,
    kind,
    status,
    icon: KIND_ICONS[kind],
    badges: isDeleting ? ["deleting"] : [workload.state],
    metrics: {
      cpu,
      ram,
      ramLabel: `${Math.max(1, Math.round(ram / 10))} / 10 GB`,
      traffic: workload.endpoint || "No endpoint yet",
    },
    footer: workload.endpoint || "Endpoint pending",
    position,
    actions: isDeleting ? ["logs"] : ["restart", "logs", "scale", "delete"],
    cpuLimitMillicores: workload.cpu_millicores || undefined,
    memoryLimitBytes: workload.memory_bytes || undefined,
    panel: {
      title: `${displayName} details`,
      description: isDeleting
        ? `Deletion requested for ${displayName}.`
        : `Namespace workload ${displayName} using ${workload.image}.`,
      highlights: [
        ...(isDeleting ? ["Deletion in progress"] : []),
        `State: ${isDeleting ? "deleting" : workload.state}`,
        workload.endpoint ? `Endpoint: ${workload.endpoint}` : "Endpoint assignment pending",
        workload.error_message ? `Error: ${workload.error_message}` : "No runtime errors reported",
      ],
    },
  };
}

export function NamespaceCanvasPage({ namespaceSlug }: { namespaceSlug: string }) {
  const [nodes, setNodes] = React.useState<InfrastructureNode[]>([]);
  const [activeServerNames, setActiveServerNames] = React.useState<string[]>([]);
  const [deletingNodeIDs, setDeletingNodeIDs] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refreshRequestIDRef = React.useRef(0);
  const deletingNodeIDsRef = React.useRef<string[]>([]);

  // Persisted positions in memory (no backend for NS-level graph nodes yet)
  const positionCacheRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());

  const refresh = React.useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const requestID = refreshRequestIDRef.current + 1;
    refreshRequestIDRef.current = requestID;
    if (!background) setError(null);

    try {
      const workloadsResponse = await listWorkloadsByNamespace(namespaceSlug);
      if (requestID !== refreshRequestIDRef.current) return;

      const activeWorkloads = (workloadsResponse.workloads ?? []).filter((w) => w.state !== "deleted");
      const activeIDs = new Set(activeWorkloads.map((w) => w.id));

      if (deletingNodeIDsRef.current.length > 0) {
        setDeletingNodeIDs((ids) => {
          const remaining = ids.filter((id) => activeIDs.has(id));
          deletingNodeIDsRef.current = remaining;
          return remaining.length === ids.length ? ids : remaining;
        });
      }

      const deletingSet = new Set(deletingNodeIDsRef.current);
      const occupied = new Set<string>();
      const resolvedPositions = new Map<string, { x: number; y: number }>();

      // First pass: use cached positions
      for (const workload of activeWorkloads) {
        const cached = positionCacheRef.current.get(workload.id);
        if (cached) {
          resolvedPositions.set(workload.id, reservePosition(cached, occupied));
        }
      }

      // Second pass: assign fallback positions for new nodes
      for (const [index, workload] of activeWorkloads.entries()) {
        if (!resolvedPositions.has(workload.id)) {
          const pos = reservePosition(fallbackPosition(index), occupied);
          resolvedPositions.set(workload.id, pos);
          positionCacheRef.current.set(workload.id, pos);
        }
      }

      const nextNodes = activeWorkloads.map((w) =>
        buildNode(w, resolvedPositions.get(w.id) ?? fallbackPosition(0), deletingSet.has(w.id), namespaceSlug)
      );

      setNodes(nextNodes);
      setActiveServerNames(nextNodes.map((n) => n.name));
    } catch (err) {
      if (requestID !== refreshRequestIDRef.current) return;
      if (!background) {
        setError(err instanceof Error ? err.message : "Failed to load servers");
      }
    } finally {
      if (requestID === refreshRequestIDRef.current) setIsLoading(false);
    }
  }, [namespaceSlug]);

  React.useEffect(() => { deletingNodeIDsRef.current = deletingNodeIDs; }, [deletingNodeIDs]);
  React.useEffect(() => { void refresh(); }, [refresh]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh({ background: true });
    }, 4000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh({ background: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);

  const handleDeleteNode = React.useCallback(async (nodeID: string) => {
    setDeletingNodeIDs((ids) => {
      if (ids.includes(nodeID)) { deletingNodeIDsRef.current = ids; return ids; }
      const next = [...ids, nodeID];
      deletingNodeIDsRef.current = next;
      return next;
    });
    try {
      await deleteWorkloadFromNamespace(namespaceSlug, nodeID);
      void refresh({ background: true });
    } catch (err) {
      setDeletingNodeIDs((ids) => {
        const next = ids.filter((id) => id !== nodeID);
        deletingNodeIDsRef.current = next;
        return next;
      });
      void refresh({ background: true });
      throw err;
    }
  }, [namespaceSlug, refresh]);

  const handlePersistNodePosition = React.useCallback((nodeID: string, position: { x: number; y: number }) => {
    positionCacheRef.current.set(nodeID, position);
  }, []);

  const handleRequestRefresh = React.useCallback(() => { void refresh({ background: true }); }, [refresh]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading canvas...
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="px-6 pt-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
      <ArchitectureView
        infrastructureNodes={nodes}
        infrastructureEdges={[]}
        projectID=""
        scope={{ namespaceSlug }}
        projectName={namespaceSlug}
        activeServerNames={activeServerNames}
        onRequestRefresh={handleRequestRefresh}
        onDeleteEdge={async () => {}}
        onDeleteNode={handleDeleteNode}
        onPersistNodePosition={handlePersistNodePosition}
        simulateMetrics={false}
        readOnly={false}
      />
    </>
  );
}
