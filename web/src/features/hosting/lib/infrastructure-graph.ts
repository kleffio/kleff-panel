import type { Edge, Node } from "reactflow";
import { MarkerType } from "reactflow";

import type {
  InfrastructureEdge,
  InfrastructureNode,
  NodeAction,
  NodeKind,
  NodeStatus,
} from "@/features/hosting/model/types";

export type InfrastructureFlowNodeData = {
  node: InfrastructureNode;
  onAction: (nodeId: string, action: NodeAction) => void;
  justAdded?: boolean;
};

export type InfrastructureFlowEdgeData = {
  edge: InfrastructureEdge;
  highlighted: boolean;
  dimmed: boolean;
};

// highlighted kept in edge data for hover-based highlighting (not AI)

export const INFRASTRUCTURE_NODE_TYPE = "infrastructureNode";
export const INFRASTRUCTURE_EDGE_TYPE = "infrastructureEdge";
export const INFRASTRUCTURE_NODE_WIDTH = 220;
export const INFRASTRUCTURE_NODE_HEIGHT = 110;
export const INFRASTRUCTURE_NODE_GAP = 24;

const ORGANIZED_INFRASTRUCTURE_LAYOUT: Record<string, { x: number; y: number }> = {
  frontend: { x: 60, y: 200 },
  proxy: { x: 420, y: 200 },
  backend: { x: 760, y: 40 },
  minecraft: { x: 460, y: 520 },
  workers: { x: 1140, y: 40 },
  redis: { x: 820, y: 520 },
  postgres: { x: 1500, y: 280 },
  observability: { x: 1500, y: 620 },
};

const EDGE_SPREAD_INDEX: Record<string, number> = {
  "frontend-proxy": 0,
  "proxy-backend": 0,
  "proxy-minecraft": 0,
  "backend-workers": 0,
  "backend-redis": 1,
  "backend-postgres": 2,
  "backend-observability": 3,
  "workers-redis": 0,
  "workers-postgres": 1,
  "workers-observability": 2,
};

export function getStatusMeta(status: NodeStatus) {
  switch (status) {
    case "running":
      return {
        label: "Running",
        dotClassName: "bg-emerald-400",
        textClassName: "text-emerald-300",
      };
    case "starting":
      return {
        label: "Starting",
        dotClassName: "bg-amber-300",
        textClassName: "text-amber-200",
      };
    case "deleting":
      return {
        label: "Deleting",
        dotClassName: "bg-orange-300",
        textClassName: "text-orange-200",
      };
    case "error":
      return {
        label: "Error",
        dotClassName: "bg-rose-400",
        textClassName: "text-rose-300",
      };
  }
}

export function getKindMeta(kind: NodeKind) {
  switch (kind) {
    case "app":
      return { label: "App", accent: "rgba(246, 193, 119, 0.07)" };
    case "api":
      return { label: "API", accent: "rgba(255, 104, 104, 0.07)" };
    case "worker":
      return { label: "Worker", accent: "rgba(252, 211, 77, 0.06)" };
    case "database":
      return { label: "Database", accent: "rgba(120, 184, 255, 0.07)" };
    case "cache":
      return { label: "Cache", accent: "rgba(83, 218, 161, 0.07)" };
    case "proxy":
      return { label: "Proxy", accent: "rgba(255, 255, 255, 0.04)" };
    case "game-server":
      return { label: "Game", accent: "rgba(87, 194, 109, 0.08)" };
    case "support":
      return { label: "Support", accent: "rgba(163, 133, 255, 0.07)" };
  }
}

export function buildInfrastructureFlowNodes(
  nodes: InfrastructureNode[],
  highlightedNodeIds: Set<string>,
  onAction: (nodeId: string, action: NodeAction) => void,
  previousNodes?: Array<Node<InfrastructureFlowNodeData>>,
) {
  const previousNodeMap = new Map(previousNodes?.map((node) => [node.id, node]) ?? []);

  return nodes.map<Node<InfrastructureFlowNodeData>>((node) => {
    const previousNode = previousNodeMap.get(node.id);

    return {
      id: node.id,
      type: INFRASTRUCTURE_NODE_TYPE,
      position: previousNode?.position ?? node.position,
      selected: previousNode?.selected,
      draggable: true,
      data: {
        node,
        onAction,
      },
    };
  });
}

export function buildInfrastructureFlowEdges(
  edges: InfrastructureEdge[],
  highlightedEdgeIds: Set<string>,
  hoveredNodeId: string | null,
) {
  return edges.map<Edge<InfrastructureFlowEdgeData>>((edge) => ({
    ...(function () {
      const connectedToHoveredNode =
        hoveredNodeId !== null &&
        (edge.source === hoveredNodeId || edge.target === hoveredNodeId);
      const highlighted = highlightedEdgeIds.has(edge.id) || connectedToHoveredNode;
      const dimmed = hoveredNodeId !== null && !connectedToHoveredNode && !highlightedEdgeIds.has(edge.id);

      return {
        zIndex: highlighted ? 10 : 1,
        data: {
          edge,
          highlighted,
          dimmed,
        },
      };
    })(),
    id: edge.id,
    type: INFRASTRUCTURE_EDGE_TYPE,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? "right",
    targetHandle: edge.targetHandle ?? "left",
    animated: edge.kind === "traffic",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "rgba(255,255,255,0.5)",
    },
  }));
}

export function getEdgeSpreadIndex(edgeId: string) {
  return EDGE_SPREAD_INDEX[edgeId] ?? 0;
}

export function getOrganizedInfrastructurePosition(
  nodeId: string,
  fallbackPosition: { x: number; y: number },
) {
  return ORGANIZED_INFRASTRUCTURE_LAYOUT[nodeId] ?? fallbackPosition;
}

function nodesOverlap(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (
    a.x < b.x + INFRASTRUCTURE_NODE_WIDTH + INFRASTRUCTURE_NODE_GAP &&
    a.x + INFRASTRUCTURE_NODE_WIDTH + INFRASTRUCTURE_NODE_GAP > b.x &&
    a.y < b.y + INFRASTRUCTURE_NODE_HEIGHT + INFRASTRUCTURE_NODE_GAP &&
    a.y + INFRASTRUCTURE_NODE_HEIGHT + INFRASTRUCTURE_NODE_GAP > b.y
  );
}

export function resolveDraggedNodeCollisions(
  draggedNodeId: string,
  nodes: Array<Node<InfrastructureFlowNodeData>>,
) {
  const nextNodes = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
  }));
  const draggedNode = nextNodes.find((node) => node.id === draggedNodeId);

  if (!draggedNode) {
    return nextNodes;
  }

  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false;

    for (const otherNode of nextNodes) {
      if (otherNode.id === draggedNodeId) {
        continue;
      }

      if (!nodesOverlap(draggedNode.position, otherNode.position)) {
        continue;
      }

      const centerX = draggedNode.position.x + INFRASTRUCTURE_NODE_WIDTH / 2;
      const centerY = draggedNode.position.y + INFRASTRUCTURE_NODE_HEIGHT / 2;
      const otherCenterX = otherNode.position.x + INFRASTRUCTURE_NODE_WIDTH / 2;
      const otherCenterY = otherNode.position.y + INFRASTRUCTURE_NODE_HEIGHT / 2;
      const diffX = centerX - otherCenterX || 1;
      const diffY = centerY - otherCenterY || 1;
      const overlapX =
        INFRASTRUCTURE_NODE_WIDTH + INFRASTRUCTURE_NODE_GAP - Math.abs(diffX);
      const overlapY =
        INFRASTRUCTURE_NODE_HEIGHT + INFRASTRUCTURE_NODE_GAP - Math.abs(diffY);

      if (overlapX < overlapY) {
        otherNode.position.x -= diffX > 0 ? overlapX : -overlapX;
      } else {
        otherNode.position.y -= diffY > 0 ? overlapY : -overlapY;
      }

      moved = true;
    }

    if (!moved) {
      break;
    }
  }

  for (let pass = 0; pass < 8; pass += 1) {
    let cascaded = false;

    for (let i = 0; i < nextNodes.length; i += 1) {
      for (let j = i + 1; j < nextNodes.length; j += 1) {
        const firstNode = nextNodes[i];
        const secondNode = nextNodes[j];

        if (firstNode.id === draggedNodeId || secondNode.id === draggedNodeId) {
          continue;
        }

        if (!nodesOverlap(firstNode.position, secondNode.position)) {
          continue;
        }

        cascaded = true;

        const firstCenterX = firstNode.position.x + INFRASTRUCTURE_NODE_WIDTH / 2;
        const firstCenterY = firstNode.position.y + INFRASTRUCTURE_NODE_HEIGHT / 2;
        const secondCenterX = secondNode.position.x + INFRASTRUCTURE_NODE_WIDTH / 2;
        const secondCenterY = secondNode.position.y + INFRASTRUCTURE_NODE_HEIGHT / 2;
        const diffX = secondCenterX - firstCenterX || 1;
        const diffY = secondCenterY - firstCenterY || 1;
        const overlapX =
          INFRASTRUCTURE_NODE_WIDTH + INFRASTRUCTURE_NODE_GAP - Math.abs(diffX);
        const overlapY =
          INFRASTRUCTURE_NODE_HEIGHT + INFRASTRUCTURE_NODE_GAP - Math.abs(diffY);

        if (overlapX < overlapY) {
          const direction = diffX > 0 ? 1 : -1;
          firstNode.position.x -= (overlapX / 2) * direction;
          secondNode.position.x += (overlapX / 2) * direction;
        } else {
          const direction = diffY > 0 ? 1 : -1;
          firstNode.position.y -= (overlapY / 2) * direction;
          secondNode.position.y += (overlapY / 2) * direction;
        }
      }
    }

    if (!cascaded) {
      break;
    }
  }

  return nextNodes;
}
