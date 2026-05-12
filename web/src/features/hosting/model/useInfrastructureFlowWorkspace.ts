"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeDragHandler, NodeMouseHandler, Node, Viewport } from "reactflow";
import { useNodesState } from "reactflow";
import { toast } from "sonner";

import {
  infrastructureEdges,
  infrastructureNodes,
} from "@/features/hosting/model/content";
import type {
  InfrastructureNode,
  InfrastructureEdge,
  NodeAction,
} from "@/features/hosting/model/types";
import {
  buildInfrastructureFlowEdges,
  buildInfrastructureFlowNodes,
  getOrganizedInfrastructurePosition,
  resolveDraggedNodeCollisions,
  type InfrastructureFlowNodeData,
} from "@/features/hosting/lib/infrastructure-graph";

function clampMetric(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

function nudgeNodeMetrics(node: InfrastructureNode) {
  const pressureBias =
    node.id === "backend" ? 4 : node.id === "postgres" ? 2 : node.id === "workers" ? 1 : 0;
  const cpuShift = Math.random() > 0.5 ? 2 + pressureBias : -2 + pressureBias;
  const ramShift = Math.random() > 0.5 ? 1 : -1;

  return {
    ...node,
    metrics: {
      ...node.metrics,
      cpu: clampMetric(node.metrics.cpu + cpuShift, 8, 99),
      ram: clampMetric(node.metrics.ram + ramShift, 10, 97),
    },
  };
}

export function useInfrastructureFlowWorkspace({
  initialInfrastructureNodes = infrastructureNodes,
  initialInfrastructureEdges = infrastructureEdges,
  simulateMetrics = true,
  onDeleteNode,
}: {
  initialInfrastructureNodes?: InfrastructureNode[];
  initialInfrastructureEdges?: InfrastructureEdge[];
  simulateMetrics?: boolean;
  onDeleteNode?: (nodeID: string) => Promise<void> | void;
} = {}) {
  const [domainNodes, setDomainNodes] = useState(initialInfrastructureNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const restartTimersRef = useRef<number[]>([]);
  const repulsionAnimationFrameRef = useRef<number | null>(null);
  const isAnimatingRepulsionRef = useRef(false);
  const domainNodesRef = useRef(domainNodes);
  domainNodesRef.current = domainNodes;

  const handleNodeAction = useCallback((nodeId: string, action: NodeAction) => {
    const targetNode = domainNodesRef.current.find((node) => node.id === nodeId);
    if (!targetNode) {
      return;
    }

    if (action === "delete") {
      if (!onDeleteNode) {
        toast.error("Delete unavailable", {
          description: "This architecture view does not support deleting nodes.",
        });
        return;
      }

      const toastID = `delete-node-${nodeId}`;
      toast.loading("Deleting server", {
        id: toastID,
        description: `Removing ${targetNode.name} from this project.`,
      });

      setDomainNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          return {
            ...node,
            status: "deleting",
            badges: ["deleting"],
            actions: node.actions.filter(
              (candidateAction) =>
                candidateAction !== "restart" &&
                candidateAction !== "scale" &&
                candidateAction !== "delete",
            ),
          };
        }),
      );

      void (async () => {
        try {
          await onDeleteNode(nodeId);
          toast.success("Delete requested", {
            id: toastID,
            description: `${targetNode.name} will disappear once teardown completes.`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete server";
          setDomainNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.id === nodeId ? targetNode : node,
            ),
          );
          toast.error("Delete failed", {
            id: toastID,
            description: message,
          });
        }
      })();

      return;
    }

    setDomainNodes((currentNodes) => {
      if (action === "logs") {
        setSelectedNodeId(nodeId);
        return currentNodes;
      }

      if (action === "scale") {
        return currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                status: "running",
                badges: node.badges.includes("Scaled")
                  ? node.badges
                  : [...node.badges, "Scaled"],
                metrics: {
                  ...node.metrics,
                  cpu: clampMetric(node.metrics.cpu - 14, 7, 99),
                  ram: clampMetric(node.metrics.ram - 9, 8, 97),
                },
              }
            : node,
        );
      }

      const timerId = window.setTimeout(() => {
        setDomainNodes((latestNodes) =>
          latestNodes.map((node) =>
            node.id === nodeId ? { ...node, status: "running" } : node,
          ),
        );
      }, 1800);

      restartTimersRef.current.push(timerId);

      return currentNodes.map((node) =>
        node.id === nodeId ? { ...node, status: "starting" } : node,
      );
    });

    if (action === "logs") {
      toast("Log stream mocked", {
        description: `Opening log stream for ${targetNode.name}.`,
      });
      return;
    }

    if (action === "scale") {
      toast.success("Scaling mocked", {
        description: `${targetNode.name} gained extra capacity in the prototype.`,
      });
      return;
    }

    toast("Restart queued", {
      description: `${targetNode.name} is rolling through a mocked restart.`,
    });
  }, [onDeleteNode]);

  const initialFlowNodes = useMemo(
    () =>
      buildInfrastructureFlowNodes(
        initialInfrastructureNodes,
        new Set<string>(),
        () => undefined,
      ),
    [initialInfrastructureNodes],
  );
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<InfrastructureFlowNodeData>(initialFlowNodes);
  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;

  useEffect(() => {
    setDomainNodes(initialInfrastructureNodes);
  }, [initialInfrastructureNodes]);

  useEffect(() => {
    if (isAnimatingRepulsionRef.current) {
      return;
    }

    setFlowNodes((currentNodes) =>
      buildInfrastructureFlowNodes(
        domainNodes,
        new Set<string>(),
        handleNodeAction,
        currentNodes,
      ),
    );
  }, [domainNodes, handleNodeAction, setFlowNodes]);

  useEffect(() => {
    setFlowNodes((currentNodes) => {
      let resolvedNodes = currentNodes;

      for (const node of currentNodes) {
        resolvedNodes = resolveDraggedNodeCollisions(node.id, resolvedNodes);
      }

      setDomainNodes((currentDomainNodes) =>
        currentDomainNodes.map((domainNode) => {
          const matchingNode = resolvedNodes.find((candidate) => candidate.id === domainNode.id);
          return matchingNode
            ? {
                ...domainNode,
                position: matchingNode.position,
              }
            : domainNode;
        }),
      );

      return resolvedNodes;
    });
  }, [setFlowNodes]);

  useEffect(() => {
    if (!simulateMetrics) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setDomainNodes((currentNodes) => currentNodes.map(nudgeNodeMetrics));
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [simulateMetrics]);

  useEffect(() => {
    const timers = restartTimersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      if (repulsionAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(repulsionAnimationFrameRef.current);
      }
      isAnimatingRepulsionRef.current = false;
    };
  }, []);

  const animateNodesToResolvedPositions = useCallback(
    (
      fromNodes: Array<Node<InfrastructureFlowNodeData>>,
      toNodes: Array<Node<InfrastructureFlowNodeData>>,
    ) => {
      if (repulsionAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(repulsionAnimationFrameRef.current);
        repulsionAnimationFrameRef.current = null;
      }
      isAnimatingRepulsionRef.current = false;

      const startTime = performance.now();
      const duration = 220;
      const targetNodeMap = new Map(toNodes.map((node) => [node.id, node]));

      const tick = (now: number) => {
        isAnimatingRepulsionRef.current = true;
        const progress = Math.min((now - startTime) / duration, 1);
        const easedProgress = easeOutCubic(progress);

        setFlowNodes(
          fromNodes.map((node) => {
            const targetNode = targetNodeMap.get(node.id);
            if (!targetNode) {
              return node;
            }

            return {
              ...node,
              position: {
                x:
                  node.position.x +
                  (targetNode.position.x - node.position.x) * easedProgress,
                y:
                  node.position.y +
                  (targetNode.position.y - node.position.y) * easedProgress,
              },
            };
          }),
        );

        if (progress < 1) {
          repulsionAnimationFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        repulsionAnimationFrameRef.current = null;
        isAnimatingRepulsionRef.current = false;
        setFlowNodes(toNodes);
        setDomainNodes((currentDomainNodes) =>
          currentDomainNodes.map((domainNode) => {
            const matchingNode = targetNodeMap.get(domainNode.id);
            return matchingNode
              ? {
                  ...domainNode,
                  position: matchingNode.position,
                }
              : domainNode;
          }),
        );
      };

      repulsionAnimationFrameRef.current = window.requestAnimationFrame(tick);
    },
    [setFlowNodes],
  );

  const flowEdges = useMemo(
    () => buildInfrastructureFlowEdges(initialInfrastructureEdges, new Set<string>(), hoveredNodeId),
    [hoveredNodeId, initialInfrastructureEdges],
  );

  const selectedNode = useMemo(
    () => domainNodes.find((node) => node.id === selectedNodeId) ?? null,
    [domainNodes, selectedNodeId],
  );

  const relatedNodes = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const relatedIds = initialInfrastructureEdges.flatMap((edge) => {
      if (edge.source === selectedNode.id) {
        return [edge.target];
      }

      if (edge.target === selectedNode.id) {
        return [edge.source];
      }

      return [];
    });

    return domainNodes.filter((node) => relatedIds.includes(node.id));
  }, [domainNodes, initialInfrastructureEdges, selectedNode]);

  const handleOrganizeCanvas = useCallback(() => {
    const currentNodes = flowNodesRef.current;
    const organizedNodes = currentNodes.map((node) => ({
      ...node,
      position: getOrganizedInfrastructurePosition(node.id, node.position),
    }));
    let resolvedNodes = organizedNodes;

    for (const node of organizedNodes) {
      resolvedNodes = resolveDraggedNodeCollisions(node.id, resolvedNodes);
    }

    animateNodesToResolvedPositions(currentNodes, resolvedNodes);
    toast.success("Canvas organized", {
      description: "Services were snapped back into a cleaner topology layout.",
    });
  }, [animateNodesToResolvedPositions]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleNodeDrag = useCallback<NodeDragHandler>(() => {
    // Intentionally empty: allow free overlap during drag and resolve on release only.
  }, []);

  const handleNodeDragStop = useCallback<NodeDragHandler>((_, node) => {
    const currentNodes = flowNodesRef.current;
    const resolvedNodes = resolveDraggedNodeCollisions(node.id, currentNodes);
    animateNodesToResolvedPositions(currentNodes, resolvedNodes);
  }, [animateNodesToResolvedPositions]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const closePanel = useCallback((open: boolean) => {
    if (!open) {
      setSelectedNodeId(null);
    }
  }, []);

  const applyPositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      setFlowNodes((currentNodes) =>
        currentNodes.map((node) => {
          const pos = positions[node.id];
          return pos ? { ...node, position: pos } : node;
        }),
      );
      setDomainNodes((currentDomainNodes) =>
        currentDomainNodes.map((domainNode) => {
          const pos = positions[domainNode.id];
          return pos ? { ...domainNode, position: pos } : domainNode;
        }),
      );
    },
    [setFlowNodes],
  );

  return {
    applyPositions,
    closePanel,
    flowEdges,
    flowNodes,
    handleNodeAction,
    handleNodeClick,
    handleNodeDrag,
    handleNodeDragStop,
    handleOrganizeCanvas,
    handlePaneClick,
    onNodesChange,
    relatedNodes,
    selectedNode,
    setHoveredNodeId,
    setViewport,
    viewport,
  };
}
