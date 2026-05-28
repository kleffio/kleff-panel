"use client";

import "reactflow/dist/style.css";

import {
  BookmarkPlus,
  FolderOpen,
  HelpCircle,
  LayersIcon as Layers,
  LayoutGrid,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, EdgeTypes, Node, NodeChange, NodeTypes } from "reactflow";
import {
  Background,
  BackgroundVariant,
  Panel,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";

import { useInfrastructureFlowWorkspace } from "@/features/hosting/model/useInfrastructureFlowWorkspace";
import { useCanvasGroups } from "@/features/hosting/model/useCanvasGroups";
import {
  INFRASTRUCTURE_EDGE_TYPE,
  INFRASTRUCTURE_NODE_TYPE,
} from "@/features/hosting/lib/infrastructure-graph";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@kleffio/ui";
import { toast } from "sonner";
import { EdgeConnection } from "./EdgeConnection";
import { GroupNode } from "./GroupNode";
import { GroupManagerModal } from "./GroupManagerModal";
import { GroupEventProvider } from "./GroupEventContext";
import { InfrastructureNodeCard } from "./InfrastructureNodeCard";
import { CreateServerPalette } from "./CreateServerPalette";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import type { EnvironmentScope } from "@/lib/api/projects";
import type { GroupFormData } from "./GroupManagerModal";
import type { InfrastructureEdge, InfrastructureNode } from "@/features/hosting/model/types";

const nodeTypes: NodeTypes = {
  [INFRASTRUCTURE_NODE_TYPE]: InfrastructureNodeCard,
  stack: GroupNode,
};

const edgeTypes: EdgeTypes = {
  [INFRASTRUCTURE_EDGE_TYPE]: EdgeConnection,
};

// ── Saved layouts (localStorage) ──────────────────────────────────────────────

interface SavedLayout {
  id: string;
  name: string;
  positions: Record<string, { x: number; y: number }>;
  savedAt: string;
}

function loadLayouts(projectID: string): SavedLayout[] {
  try {
    const raw = localStorage.getItem(`kleff:layouts:${projectID}`);
    return raw ? (JSON.parse(raw) as SavedLayout[]) : [];
  } catch {
    return [];
  }
}

function saveLayouts(projectID: string, layouts: SavedLayout[]) {
  localStorage.setItem(`kleff:layouts:${projectID}`, JSON.stringify(layouts));
}

// ── Main canvas body ───────────────────────────────────────────────────────────

function FlowCanvasBody({
  infrastructureNodes,
  infrastructureEdges,
  projectID,
  scope,
  projectName,
  activeServerNames,
  onRequestRefresh,
  onDeleteEdge,
  onDeleteNode,
  onPersistNodePosition,
  simulateMetrics,
  readOnly,
}: {
  infrastructureNodes: InfrastructureNode[];
  infrastructureEdges: InfrastructureEdge[];
  projectID?: string | null;
  scope?: EnvironmentScope;
  projectName?: string;
  activeServerNames?: string[];
  onRequestRefresh?: () => void;
  onDeleteEdge?: (edgeID: string) => Promise<void> | void;
  onDeleteNode?: (nodeID: string) => Promise<void> | void;
  onPersistNodePosition?: (nodeID: string, position: { x: number; y: number }) => void;
  simulateMetrics?: boolean;
  readOnly?: boolean;
}) {
  const { fitView } = useReactFlow();
  const [newServerOpen, setNewServerOpen] = useState(
    () => !readOnly && infrastructureNodes.length === 0 && (!!projectID || !!scope?.namespaceSlug),
  );
  const [hotkeysOpen, setHotkeysOpen] = useState(false);

  const [layouts, setLayouts] = useState<SavedLayout[]>(() =>
    projectID ? loadLayouts(projectID) : [],
  );
  const [saveNamePrompt, setSaveNamePrompt] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const refreshTimersRef = useRef<number[]>([]);

  const {
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
  } = useInfrastructureFlowWorkspace({
    initialInfrastructureNodes: infrastructureNodes,
    initialInfrastructureEdges: infrastructureEdges,
    simulateMetrics,
    onDeleteNode,
  });

  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;

  // State for live drag-over highlight (Phase B)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  // State for pop-in flash animation (Phase C)
  const [recentlyAddedNodeId, setRecentlyAddedNodeId] = useState<string | null>(null);

  const {
    groups,
    groupNodes,
    groupNodeIds,
    groupModal,
    setGroupModal,
    handleDeleteGroup,
    handleEditGroup,
    handleOpenCreateModal,
    handleConfirmGroup,
    handleGroupNodesChange,
    addMemberToGroup,
    removeMemberFromGroup,
    expandGroupToFit,
    fitGroupToMembers,
    resizeGroup,
  } = useCanvasGroups({ projectID, namespaceSlug: scope?.namespaceSlug, flowNodesRef });

  // Refs for synchronous position tracking during continuous drag (Phase D)
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const groupPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const memberPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Sync position refs from React state on each render.
  // These are safe to update outside a hook because we read them only inside callbacks.
  for (const g of groups) {
    groupPositionsRef.current[g.id] = { x: g.position.x, y: g.position.y };
  }
  for (const n of flowNodes) {
    memberPositionsRef.current[n.id] = { x: n.position.x, y: n.position.y };
  }

  const handleAllNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const infraChanges = changes.filter((c) => !groupNodeIds.has((c as { id: string }).id));
      const groupChanges = changes.filter((c) => groupNodeIds.has((c as { id: string }).id));

      // Phase D: co-movement — when a group moves, move all its member nodes with it
      const memberCoMoveChanges: NodeChange[] = [];
      for (const change of groupChanges) {
        if (change.type !== "position" || !change.position) continue;
        const prevPos = groupPositionsRef.current[change.id];
        if (!prevPos) continue;
        const dx = change.position.x - prevPos.x;
        const dy = change.position.y - prevPos.y;
        if (dx === 0 && dy === 0) continue;
        groupPositionsRef.current[change.id] = { x: change.position.x, y: change.position.y };
        const group = groupsRef.current.find((g) => g.id === change.id);
        if (!group) continue;
        for (const memberId of group.memberIds) {
          const prevMemberPos = memberPositionsRef.current[memberId];
          if (!prevMemberPos) continue;
          const newMemberPos = { x: prevMemberPos.x + dx, y: prevMemberPos.y + dy };
          memberPositionsRef.current[memberId] = newMemberPos;
          memberCoMoveChanges.push({ type: "position", id: memberId, position: newMemberPos });
        }
      }

      // Track infra node positions synchronously for the next co-move step
      for (const change of infraChanges) {
        if (change.type === "position" && change.position) {
          memberPositionsRef.current[(change as { id: string }).id] = { x: change.position.x, y: change.position.y };
        }
      }

      if (infraChanges.length || memberCoMoveChanges.length)
        onNodesChange([...infraChanges, ...memberCoMoveChanges]);
      if (groupChanges.length) handleGroupNodesChange(groupChanges);
    },
    [groupNodeIds, onNodesChange, handleGroupNodesChange],
  );

  // Phase B: detect which group a dragged server is hovering over
  const handleNodeDragWithGroupDetect = useCallback(
    (event: React.MouseEvent, node: Node, nodes: Node[]) => {
      handleNodeDrag(event, node, nodes);
      if (groupNodeIds.has(node.id)) {
        setDragOverGroupId(null);
        return;
      }
      const nodeW = node.width ?? 220;
      const nodeH = node.height ?? 110;
      const cx = node.position.x + nodeW / 2;
      const cy = node.position.y + nodeH / 2;
      let found: string | null = null;
      for (const g of groupsRef.current) {
        if (
          cx >= g.position.x &&
          cx <= g.position.x + g.size.width &&
          cy >= g.position.y &&
          cy <= g.position.y + g.size.height
        ) {
          found = g.id;
          break;
        }
      }
      setDragOverGroupId(found);
    },
    [handleNodeDrag, groupNodeIds],
  );

  const requestRefreshBurst = useCallback(() => {
    onRequestRefresh?.();
    for (const delay of [1000, 2500, 5000, 8000, 12000, 18000]) {
      const timerID = window.setTimeout(() => { onRequestRefresh?.(); }, delay);
      refreshTimersRef.current.push(timerID);
    }
  }, [onRequestRefresh]);

  const handleEdgesDelete = useCallback(
    (edges: Edge[]) => {
      if (!onDeleteEdge || edges.length === 0) return;
      void (async () => {
        let failedCount = 0;
        for (const edge of edges) {
          try { await onDeleteEdge(edge.id); } catch { failedCount += 1; }
        }
        if (failedCount === 0) {
          toast.success("Connection removed", {
            description: `${edges.length} connection${edges.length === 1 ? "" : "s"} disconnected.`,
          });
          onRequestRefresh?.();
          return;
        }
        toast.error("Some connections failed to disconnect");
        onRequestRefresh?.();
      })();
    },
    [onDeleteEdge, onRequestRefresh],
  );

  // ── Layout helpers ───────────────────────────────────────────────────────────

  const handleSaveLayout = useCallback(() => {
    if (!projectID || !newLayoutName.trim()) return;
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of flowNodes) {
      positions[node.id] = { x: node.position.x, y: node.position.y };
    }
    const newLayout: SavedLayout = {
      id: `${Date.now()}`,
      name: newLayoutName.trim(),
      positions,
      savedAt: new Date().toISOString(),
    };
    const updated = [...layouts, newLayout];
    setLayouts(updated);
    saveLayouts(projectID, updated);
    setNewLayoutName("");
    setSaveNamePrompt(false);
    toast.success(`Layout "${newLayout.name}" saved`);
  }, [projectID, newLayoutName, layouts, flowNodes]);

  const handleLoadLayout = useCallback(
    (layout: SavedLayout) => {
      applyPositions(layout.positions);
      for (const [nodeID, pos] of Object.entries(layout.positions)) {
        onPersistNodePosition?.(nodeID, pos);
      }
      window.setTimeout(() => {
        fitView({ padding: 0.18, maxZoom: 1.1, duration: 450 });
      }, 260);
      toast.success(`Layout "${layout.name}" loaded`);
    },
    [applyPositions, onPersistNodePosition, fitView],
  );

  const handleDeleteLayout = useCallback(
    (layoutID: string) => {
      if (!projectID) return;
      const updated = layouts.filter((l) => l.id !== layoutID);
      setLayouts(updated);
      saveLayouts(projectID, updated);
    },
    [projectID, layouts],
  );

  const handleAutoOrganize = useCallback(() => {
    handleOrganizeCanvas();
    window.setTimeout(() => {
      fitView({ padding: 0.22, maxZoom: 1.05, duration: 420 });
    }, 240);
  }, [handleOrganizeCanvas, fitView]);

  const handleFitToMembers = useCallback(
    (groupId: string) => {
      const group = groupsRef.current.find((g) => g.id === groupId);
      if (!group || group.memberIds.length === 0) {
        toast.info("No members to fit to");
        return;
      }
      fitGroupToMembers(groupId);
      toast.success("Fitted to members");
    },
    [groupsRef, fitGroupToMembers],
  );

  const handleAutoArrange = useCallback(
    (groupId: string) => {
      const group = groupsRef.current.find((g) => g.id === groupId);
      if (!group || group.memberIds.length === 0) {
        toast.info("No members to arrange");
        return;
      }

      const SNAP = 20;
      const PAD = 48;
      const LABEL_H = 36;
      const GAP = 20;
      const COLS = Math.max(1, Math.ceil(Math.sqrt(group.memberIds.length)));
      const snap = (v: number) => Math.round(v / SNAP) * SNAP;

      const startX = snap(group.position.x + PAD);
      const startY = snap(group.position.y + LABEL_H + PAD);
      const currentNodes = flowNodesRef.current ?? [];

      const dims = group.memberIds.map((memberId) => {
        const node = currentNodes.find((n) => n.id === memberId);
        return { w: node?.width ?? 220, h: node?.height ?? 110 };
      });
      const strideW = Math.max(...dims.map((d) => d.w)) + GAP;
      const strideH = Math.max(...dims.map((d) => d.h)) + GAP;

      const newPositions = group.memberIds.map((memberId, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return {
          id: memberId,
          position: { x: snap(startX + col * strideW), y: snap(startY + row * strideH) },
          nodeW: dims[i].w,
          nodeH: dims[i].h,
        };
      });

      const posChanges: NodeChange[] = newPositions.map(({ id, position }) => ({
        type: "position" as const,
        id,
        position,
      }));
      onNodesChange(posChanges);

      for (const { id, position } of newPositions) {
        memberPositionsRef.current[id] = position;
        onPersistNodePosition?.(id, position);
      }

      // Bounding box from actual snapped positions + real node sizes
      const maxRight = Math.max(...newPositions.map(({ position, nodeW }) => position.x + nodeW));
      const maxBottom = Math.max(...newPositions.map(({ position, nodeH }) => position.y + nodeH));
      resizeGroup(groupId, group.position, {
        width: Math.max(280, maxRight + PAD - group.position.x),
        height: Math.max(180, maxBottom + PAD - group.position.y),
      });

      toast.success(`Auto-arranged ${group.memberIds.length} server${group.memberIds.length === 1 ? "" : "s"}`);
    },
    [groupsRef, flowNodesRef, onNodesChange, onPersistNodePosition, memberPositionsRef, resizeGroup],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (event.repeat || event.key.toLowerCase() !== "c") return;
      fitView({ padding: 0.18, maxZoom: 1.1, duration: 450 });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { window.removeEventListener("keydown", handleKeyDown); };
  }, [fitView]);

  useEffect(() => {
    return () => {
      for (const timerID of refreshTimersRef.current) { window.clearTimeout(timerID); }
      refreshTimersRef.current = [];
    };
  }, []);

  return (
    <GroupEventProvider onDelete={handleDeleteGroup} onEdit={handleEditGroup} onFitToMembers={handleFitToMembers} onAutoArrange={handleAutoArrange}>
      <div className="relative h-full min-h-0 overflow-hidden">
        <ReactFlow
          nodes={[
            ...groupNodes.map((gn) => ({
              ...gn,
              data: { ...gn.data, isDropTarget: gn.id === dragOverGroupId },
            })),
            ...flowNodes.map((n) => ({
              ...n,
              zIndex: 1,
              data: { ...n.data, justAdded: n.id === recentlyAddedNodeId },
            })),
          ]}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
          snapToGrid
          snapGrid={[20, 20]}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          panOnDrag
          zoomOnDoubleClick={false}
          elevateEdgesOnSelect
          minZoom={0.5}
          maxZoom={2}
          onNodesChange={handleAllNodesChange}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onNodeDrag={handleNodeDragWithGroupDetect}
          onNodeDragStop={(event, node, nodes) => {
            setDragOverGroupId(null);
            handleNodeDragStop(event, node, nodes);

            // Group drag: persist co-moved member positions
            if (groupNodeIds.has(node.id)) {
              const group = groupsRef.current.find((g) => g.id === node.id);
              if (group) {
                for (const memberId of group.memberIds) {
                  const memberPos = memberPositionsRef.current[memberId];
                  if (memberPos) onPersistNodePosition?.(memberId, memberPos);
                }
              }
              return;
            }

            // Server drag: persist position + check group membership change
            onPersistNodePosition?.(node.id, node.position);

            const nodeW = node.width ?? 220;
            const nodeH = node.height ?? 110;
            const cx = node.position.x + nodeW / 2;
            const cy = node.position.y + nodeH / 2;
            const nodeLabel = (node.data as { label?: string })?.label ?? node.id;

            for (const g of groups) {
              const inBounds =
                cx >= g.position.x &&
                cx <= g.position.x + g.size.width &&
                cy >= g.position.y &&
                cy <= g.position.y + g.size.height;
              if (inBounds && !g.memberIds.includes(node.id)) {
                const nodeW = node.width ?? 220;
                const nodeH = node.height ?? 110;
                // Expand group to fully contain the dropped server
                expandGroupToFit(g.id, { x: node.position.x, y: node.position.y }, { width: nodeW, height: nodeH });
                addMemberToGroup(g.id, node.id);
                setRecentlyAddedNodeId(node.id);
                window.setTimeout(() => setRecentlyAddedNodeId(null), 800);
                toast.success(`Added "${nodeLabel}" to ${g.label}`, {
                  action: { label: "Undo", onClick: () => removeMemberFromGroup(g.id, node.id) },
                });
                return;
              }
            }

            for (const g of groups) {
              if (!g.memberIds.includes(node.id)) continue;
              const inBounds =
                cx >= g.position.x &&
                cx <= g.position.x + g.size.width &&
                cy >= g.position.y &&
                cy <= g.position.y + g.size.height;
              if (inBounds) {
                expandGroupToFit(g.id, { x: node.position.x, y: node.position.y }, { width: nodeW, height: nodeH });
              } else {
                removeMemberFromGroup(g.id, node.id);
                toast(`Removed "${nodeLabel}" from ${g.label}`, {
                  action: { label: "Undo", onClick: () => addMemberToGroup(g.id, node.id) },
                });
              }
              return;
            }
          }}
          onPaneClick={handlePaneClick}
          onEdgesDelete={handleEdgesDelete}
          className="bg-transparent"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="oklch(1 0 0 / 0.07)" />

          {/* Top-right pill toolbar */}
          <Panel position="top-right" className="!top-3 !right-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/60 backdrop-blur-sm p-1">
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => setNewServerOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add node
                  </button>
                  <div className="w-px h-4 bg-white/[0.08]" />
                </>
              )}

              {/* Organize dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors"
                  >
                    <LayoutGrid className="size-3.5" />
                    Organize
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-[0.3rem] border border-[var(--test-border)] bg-[var(--test-panel)] text-[var(--test-foreground)]"
              >
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={handleAutoOrganize}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Auto-arrange nodes
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={handleOpenCreateModal}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Create group box
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-[var(--test-muted)]">
                  Saved layouts
                </DropdownMenuLabel>
                {layouts.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-[var(--test-muted)]">
                    No saved layouts yet.
                  </div>
                ) : (
                  layouts.map((layout) => (
                    <DropdownMenuItem
                      key={layout.id}
                      className="group flex items-center justify-between gap-2 text-xs"
                      onSelect={() => handleLoadLayout(layout)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{layout.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLayout(layout.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))
                )}

                <DropdownMenuSeparator />

                {saveNamePrompt ? (
                  <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={newLayoutName}
                      onChange={(e) => setNewLayoutName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveLayout();
                        if (e.key === "Escape") { setSaveNamePrompt(false); setNewLayoutName(""); }
                      }}
                      placeholder="Layout name…"
                      className="h-7 text-xs"
                    />
                    <div className="mt-1.5 flex gap-1">
                      <Button size="xs" onClick={handleSaveLayout} className="flex-1">
                        Save
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => { setSaveNamePrompt(false); setNewLayoutName(""); }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DropdownMenuItem
                    className="gap-2 text-xs"
                    onSelect={(e) => {
                      e.preventDefault();
                      setSaveNamePrompt(true);
                    }}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Save current layout…
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Panel>

          {/* Empty canvas prompt — shown when wizard is closed and canvas is empty */}
          {infrastructureNodes.length === 0 && !newServerOpen && !readOnly && (
            <Panel position="top-center" className="!mt-[30%] flex flex-col items-center gap-3 text-center pointer-events-auto">
              <p className="text-[13px] text-[var(--test-muted)]">No nodes on this canvas yet.</p>
              <button
                type="button"
                onClick={() => setNewServerOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-[0.3rem] border border-[var(--test-border)] bg-[var(--test-panel)] px-3 py-1.5 text-xs text-[var(--test-foreground)] hover:bg-[var(--test-accent-soft)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add your first node
              </button>
            </Panel>
          )}

          {/* Bottom-left help button + expandable hotkeys box */}
          <Panel position="bottom-left" className="!mb-2 !ml-4 sm:!mb-3 sm:!ml-6">
            <div className="relative flex flex-col items-start gap-2">
              {hotkeysOpen && (
                <div className="w-[280px] overflow-hidden rounded-[0.4rem] border border-[var(--test-border)] bg-[#0e1117] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <p className="text-xs font-semibold text-white">Keyboard shortcuts</p>
                    <button
                      type="button"
                      onClick={() => setHotkeysOpen(false)}
                      className="grid h-5 w-5 place-items-center rounded text-white/40 hover:bg-white/8 hover:text-white/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-0.5 p-2">
                    {[
                      ["C", "Center / fit all nodes"],
                      ["Scroll", "Pan canvas"],
                      ["Ctrl + Scroll", "Zoom in / out"],
                      ["Click node", "Open details panel"],
                      ["Drag node", "Reposition"],
                      ["Select edge + Del", "Remove connection"],
                      ["Backspace / Del", "Remove selected node"],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between rounded-[0.2rem] px-2 py-1.5 hover:bg-white/[0.03]">
                        <span className="text-[11px] text-white/50">{desc}</span>
                        <kbd className="ml-3 shrink-0 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                          {key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setHotkeysOpen((v) => !v)}
                className="grid h-9 w-9 place-items-center rounded-[0.3rem] border border-[var(--test-border)] bg-[var(--test-panel)] text-[var(--test-muted)] transition-colors hover:bg-[var(--test-accent-soft)] hover:text-[var(--test-foreground)]"
                title="Keyboard shortcuts"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </Panel>
        </ReactFlow>

        {/* Create server palette — fixed overlay above all nodes */}
        <CreateServerPalette
          open={newServerOpen && !readOnly}
          onOpenChange={setNewServerOpen}
          projectID={projectID ?? null}
          namespaceSlug={scope?.namespaceSlug ?? null}
          scope={scope}
          onCreated={() => { requestRefreshBurst(); setNewServerOpen(false); }}
        />

        {/* Node detail panel */}
        {selectedNode ? (
          <NodeDetailsPanel
            node={selectedNode}
            open
            onOpenChange={closePanel}
            onAction={handleNodeAction}
            relatedNodes={relatedNodes}
            scope={scope}
          />
        ) : null}

        {/* Group manager modal */}
        <GroupManagerModal
          open={groupModal.open}
          mode={groupModal.mode}
          initialData={groupModal.initialData}
          nodes={infrastructureNodes}
          onConfirm={(formData) => handleConfirmGroup(formData, groupModal.editId, groupModal.mode)}
          onCancel={() => setGroupModal((prev) => ({ ...prev, open: false }))}
          onDelete={
            groupModal.mode === "edit" && groupModal.editId
              ? () => {
                  handleDeleteGroup(groupModal.editId!);
                  setGroupModal((prev) => ({ ...prev, open: false }));
                }
              : undefined
          }
        />
      </div>
    </GroupEventProvider>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────

export function InfrastructureFlowCanvas({
  infrastructureNodes,
  infrastructureEdges,
  projectID,
  scope,
  projectName,
  activeServerNames,
  onRequestRefresh,
  onDeleteEdge,
  onDeleteNode,
  onPersistNodePosition,
  simulateMetrics,
  readOnly,
}: {
  infrastructureNodes: InfrastructureNode[];
  infrastructureEdges: InfrastructureEdge[];
  projectID?: string | null;
  scope?: EnvironmentScope;
  projectName?: string;
  activeServerNames?: string[];
  onRequestRefresh?: () => void;
  onDeleteEdge?: (edgeID: string) => Promise<void> | void;
  onDeleteNode?: (nodeID: string) => Promise<void> | void;
  onPersistNodePosition?: (nodeID: string, position: { x: number; y: number }) => void;
  simulateMetrics?: boolean;
  readOnly?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasBody
        infrastructureNodes={infrastructureNodes}
        infrastructureEdges={infrastructureEdges}
        projectID={projectID}
        scope={scope}
        projectName={projectName}
        activeServerNames={activeServerNames}
        onRequestRefresh={onRequestRefresh}
        onDeleteEdge={onDeleteEdge}
        onDeleteNode={onDeleteNode}
        onPersistNodePosition={onPersistNodePosition}
        simulateMetrics={simulateMetrics}
        readOnly={readOnly}
      />
    </ReactFlowProvider>
  );
}
