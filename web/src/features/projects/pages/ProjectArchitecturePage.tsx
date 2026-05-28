"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Boxes, Database, Globe, HardDrive, Server, Shield, Swords } from "lucide-react";

import {
  deleteConnection,
  deleteWorkload,
  getProject,
  listConnections,
  listGraphNodes,
  listWorkloads,
  listProjectMembers,
  upsertGraphNode,
  type EnvironmentScope,
  type WorkloadDTO,
} from "@/lib/api";
import { ArchitectureView } from "@/features/hosting/pages/ArchitectureView";
import { useCurrentUser } from "@/features/auth";
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
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededRange(seed: string, min: number, max: number): number {
  const range = max - min + 1;
  return min + (hashInt(seed) % range);
}

function inferNodeKind(image: string, blueprintID: string): NodeKind {
  const descriptor = `${image} ${blueprintID}`.toLowerCase();
  if (descriptor.includes("postgres") || descriptor.includes("mysql") || descriptor.includes("mariadb") || descriptor.includes("mongo")) {
    return "database";
  }
  if (descriptor.includes("redis") || descriptor.includes("cache") || descriptor.includes("memcached")) {
    return "cache";
  }
  if (descriptor.includes("proxy") || descriptor.includes("traefik") || descriptor.includes("envoy") || descriptor.includes("nginx")) {
    return "proxy";
  }
  if (descriptor.includes("worker") || descriptor.includes("queue") || descriptor.includes("jobs")) {
    return "worker";
  }
  if (descriptor.includes("minecraft") || descriptor.includes("game")) {
    return "game-server";
  }
  if (descriptor.includes("web") || descriptor.includes("frontend") || descriptor.includes("next")) {
    return "app";
  }
  return "api";
}

function mapStateToStatus(
  state: WorkloadDTO["state"],
  isDeleting: boolean,
): NodeStatus {
  if (isDeleting) {
    return "deleting";
  }

  switch (state) {
    case "running":
      return "running";
    case "pending":
      return "starting";
    default:
      return "error";
  }
}

function fallbackPosition(index: number) {
  const columns = 4;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: 80 + col * 340,
    y: 80 + row * 360,
  };
}

function gridPositionKey(position: { x: number; y: number }) {
  const col = Math.round(position.x / 340);
  const row = Math.round(position.y / 360);
  return `${col}:${row}`;
}

function reserveAvailablePosition(
  preferred: { x: number; y: number },
  occupied: Set<string>,
) {
  let candidate = preferred;
  let attempt = 0;

  while (occupied.has(gridPositionKey(candidate))) {
    attempt += 1;
    candidate = {
      x: preferred.x + (attempt % 4) * 340,
      y: preferred.y + Math.floor(attempt / 4) * 360,
    };
  }

  occupied.add(gridPositionKey(candidate));
  return candidate;
}

function edgeLabel(kind: InfrastructureEdge["kind"]): string {
  switch (kind) {
    case "traffic":
      return "Traffic";
    case "dependency":
      return "Dependency";
    default:
      return "Network";
  }
}

function buildNode(
  workload: WorkloadDTO,
  position: { x: number; y: number },
  isDeleting: boolean,
  owner: string,
  slug: string,
): InfrastructureNode {
  const displayName = workload.name || workload.id;
  const kind = inferNodeKind(workload.image, workload.blueprint_id);
  const status = mapStateToStatus(workload.state, isDeleting);
  const cpu = seededRange(`${workload.id}-cpu`, 18, 92);
  const ram = seededRange(`${workload.id}-ram`, 20, 89);
  const badges = isDeleting ? ["deleting"] : [workload.state];

  return {
    id: workload.id,
    name: displayName,
    subtitle: workload.image,
    route: `/project/${owner}/${slug}/servers/${workload.id}`,
    description:
      workload.error_message ||
      `Runtime workload ${displayName} (${workload.state}).`,
    kind,
    status,
    icon: KIND_ICONS[kind],
    badges,
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
        ? `Deletion requested for ${displayName}. The node will disappear when container teardown finishes.`
        : `Environment workload ${displayName} using ${workload.image}.`,
      highlights: [
        ...(isDeleting ? ["Deletion in progress"] : []),
        `State: ${isDeleting ? "deleting" : workload.state}`,
        ...(isDeleting ? [`Last runtime state: ${workload.state}`] : []),
        workload.endpoint ? `Endpoint: ${workload.endpoint}` : "Endpoint assignment pending",
        workload.error_message ? `Error: ${workload.error_message}` : "No runtime errors reported",
      ],
    },
  };
}

export function ProjectArchitecturePage({
  projectID,
  scope,
}: {
  projectID: string;
  scope?: EnvironmentScope;
}) {
  const currentUser = useCurrentUser();
  const { data: membersData } = useQuery({
    queryKey: ["project-members", projectID],
    queryFn: () => listProjectMembers(projectID),
    enabled: !!projectID,
  });
  const currentMember = membersData?.members?.find((m) => m.user_id === currentUser?.userId);
  const readOnly = currentMember?.role === "viewer";

  const [projectName, setProjectName] = React.useState("Environment");
  const [nodes, setNodes] = React.useState<InfrastructureNode[]>([]);
  const [edges, setEdges] = React.useState<InfrastructureEdge[]>([]);
  const [activeServerNames, setActiveServerNames] = React.useState<string[]>([]);
  const [deletingNodeIDs, setDeletingNodeIDs] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refreshRequestIDRef = React.useRef(0);
  const deletingNodeIDsRef = React.useRef<string[]>([]);

  const refresh = React.useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const requestID = refreshRequestIDRef.current + 1;
    refreshRequestIDRef.current = requestID;

    if (!background) {
      setError(null);
    }

    try {
      const projectPromise = getProject(projectID).catch(() => null);
      const [
        project,
        workloadsResponse,
        connectionsResponse,
        graphNodesResponse,
      ] = await Promise.all([
        projectPromise,
        listWorkloads(projectID, scope),
        listConnections(projectID).catch(() => ({ connections: [] })),
        listGraphNodes(projectID).catch(() => ({ graph_nodes: [] })),
      ]);

      if (requestID !== refreshRequestIDRef.current) {
        return;
      }

      setProjectName(project?.name ?? (scope?.environmentSlug ?? "Environment"));

      const activeWorkloads = (workloadsResponse.workloads ?? []).filter(
        (workload) => workload.state !== "deleted",
      );
      const activeWorkloadIDs = new Set(activeWorkloads.map((workload) => workload.id));
      if (deletingNodeIDsRef.current.length > 0) {
        setDeletingNodeIDs((currentNodeIDs) => {
          const remainingNodeIDs = currentNodeIDs.filter((nodeID) =>
            activeWorkloadIDs.has(nodeID),
          );
          deletingNodeIDsRef.current = remainingNodeIDs;
          return remainingNodeIDs.length === currentNodeIDs.length
            ? currentNodeIDs
            : remainingNodeIDs;
        });
      }

      const deletingSet = new Set(deletingNodeIDsRef.current);
      const workloads = activeWorkloads;
      const graphMap = new Map(
        (graphNodesResponse.graph_nodes ?? []).map((graphNode) => [
          graphNode.workload_id,
          { x: graphNode.position_x, y: graphNode.position_y },
        ]),
      );

      const occupiedPositions = new Set<string>();
      const resolvedPositions = new Map<string, { x: number; y: number }>();

      for (const workload of workloads) {
        const persistedPosition = graphMap.get(workload.id);
        if (!persistedPosition) {
          continue;
        }
        resolvedPositions.set(
          workload.id,
          reserveAvailablePosition(persistedPosition, occupiedPositions),
        );
      }

      for (const [index, workload] of workloads.entries()) {
        if (resolvedPositions.has(workload.id)) {
          continue;
        }
        resolvedPositions.set(
          workload.id,
          reserveAvailablePosition(fallbackPosition(index), occupiedPositions),
        );
      }

      const nextNodes = workloads.map((workload) => ({
        ...buildNode(
          workload,
          resolvedPositions.get(workload.id) ?? fallbackPosition(0),
          deletingSet.has(workload.id),
          scope?.namespaceSlug ?? "",
          scope?.environmentSlug ?? "",
        ),
        route: scope?.namespaceSlug && scope?.environmentSlug ? `/project/${scope.namespaceSlug}/${scope.environmentSlug}/servers/${workload.id}` : undefined,
      }));
      const workloadIDs = new Set(nextNodes.map((node) => node.id));
      const nextEdges: InfrastructureEdge[] = (connectionsResponse.connections ?? [])
        .filter(
          (connection) =>
            workloadIDs.has(connection.source_workload_id) &&
            workloadIDs.has(connection.target_workload_id),
        )
        .map((connection) => ({
          id: connection.id,
          source: connection.source_workload_id,
          target: connection.target_workload_id,
          kind: connection.kind,
          label: connection.label || edgeLabel(connection.kind),
        }));

      setNodes(nextNodes);
      setEdges(nextEdges);
      setActiveServerNames(nextNodes.map((node) => node.name));
    } catch (err) {
      if (requestID !== refreshRequestIDRef.current) {
        return;
      }

      const message = err instanceof Error ? err.message : "Failed to load environment architecture";
      if (!background) {
        setError(message);
      }
    } finally {
      if (requestID === refreshRequestIDRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectID, scope]);

  React.useEffect(() => {
    deletingNodeIDsRef.current = deletingNodeIDs;
  }, [deletingNodeIDs]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const intervalID = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refresh({ background: true });
    }, 4000);

    const handleFocusRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refresh({ background: true });
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      window.clearInterval(intervalID);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
    };
  }, [refresh]);

  const handleDeleteEdge = React.useCallback(
    async (edgeID: string) => {
      await deleteConnection(projectID, edgeID);
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeID));
    },
    [projectID],
  );

  const handleDeleteNode = React.useCallback(
    async (nodeID: string) => {
      setDeletingNodeIDs((currentNodeIDs) => {
        if (currentNodeIDs.includes(nodeID)) {
          deletingNodeIDsRef.current = currentNodeIDs;
          return currentNodeIDs;
        }
        const nextNodeIDs = [...currentNodeIDs, nodeID];
        deletingNodeIDsRef.current = nextNodeIDs;
        return nextNodeIDs;
      });

      try {
        await deleteWorkload(projectID, nodeID, scope);
        void refresh({ background: true });
      } catch (error) {
        setDeletingNodeIDs((currentNodeIDs) => {
          const nextNodeIDs = currentNodeIDs.filter(
            (candidateID) => candidateID !== nodeID,
          );
          deletingNodeIDsRef.current = nextNodeIDs;
          return nextNodeIDs;
        });
        void refresh({ background: true });
        throw error;
      }
    },
    [projectID, refresh, scope],
  );

  const handlePersistNodePosition = React.useCallback(
    (nodeID: string, position: { x: number; y: number }) => {
      void upsertGraphNode(projectID, nodeID, {
        position_x: position.x,
        position_y: position.y,
      });
    },
    [projectID],
  );

  const handleRequestRefresh = React.useCallback(() => {
    void refresh({ background: true });
  }, [refresh]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading architecture...
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="px-6 pt-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : null}
      <ArchitectureView
        infrastructureNodes={nodes}
        infrastructureEdges={edges}
        projectID={projectID}
        scope={scope}
        projectName={projectName}
        activeServerNames={activeServerNames}
        onRequestRefresh={handleRequestRefresh}
        onDeleteEdge={handleDeleteEdge}
        onDeleteNode={handleDeleteNode}
        onPersistNodePosition={handlePersistNodePosition}
        simulateMetrics={false}
        readOnly={readOnly}
      />
    </>
  );
}
