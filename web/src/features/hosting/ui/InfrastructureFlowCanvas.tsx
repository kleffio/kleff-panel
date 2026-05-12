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
  Waypoints,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, EdgeTypes, Node, NodeChange, NodeTypes } from "reactflow";
import {
  Panel,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
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
import { NewServerSheet } from "./NewServerSheet";
import { NodeDetailsPanel } from "./NodeDetailsPanel";
import type { EnvironmentScope } from "@/lib/api/projects";
import type { GroupFormData } from "./GroupManagerModal";
import type { InfrastructureEdge, InfrastructureNode } from "@/features/hosting/model/types";

const nodeTypes: NodeTypes = {
  [INFRASTRUCTURE_NODE_TYPE]: InfrastructureNodeCard,
  group: GroupNode,
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
  const [newServerOpen, setNewServerOpen] = useState(false);
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

  const {
    groupNodes,
    groupNodeIds,
    groupModal,
    setGroupModal,
    handleDeleteGroup,
    handleEditGroup,
    handleOpenCreateModal,
    handleConfirmGroup,
    handleGroupNodesChange,
  } = useCanvasGroups({ projectID, flowNodesRef });

  const handleAllNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const infraChanges = changes.filter((c) => !groupNodeIds.has((c as { id: string }).id));
      const groupChanges = changes.filter((c) => groupNodeIds.has((c as { id: string }).id));
      if (infraChanges.length) onNodesChange(infraChanges);
      if (groupChanges.length) handleGroupNodesChange(groupChanges);
    },
    [groupNodeIds, onNodesChange, handleGroupNodesChange],
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
    <GroupEventProvider onDelete={handleDeleteGroup} onEdit={handleEditGroup}>
      <div className="relative h-full min-h-0 overflow-hidden">
        <ReactFlow
          nodes={[...groupNodes, ...flowNodes]}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
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
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={(event, node, nodes) => {
            handleNodeDragStop(event, node, nodes);
            onPersistNodePosition?.(node.id, node.position);
          }}
          onPaneClick={handlePaneClick}
          onEdgesDelete={handleEdgesDelete}
          className="bg-transparent"
          proOptions={{ hideAttribution: true }}
        >
          {/* Top-right stacked controls */}
          <Panel position="top-right" className="!mr-4 !mt-4 flex flex-col items-stretch gap-2 sm:!mr-6 sm:!mt-5">
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                className="h-9 min-w-[138px] justify-start rounded-[0.3rem] border-[var(--test-border)] bg-[var(--test-panel)] px-3 text-xs text-[var(--test-foreground)] hover:bg-[var(--test-accent-soft)]"
                onClick={() => {
                  if (!projectID) {
                    toast("Node creation mocked", { description: "Choose an environment context first." });
                    return;
                  }
                  setNewServerOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add Node
              </Button>
            )}

            {/* Organize dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 min-w-[138px] justify-start rounded-[0.3rem] border-[var(--test-border)] bg-[var(--test-panel)] px-3 text-xs text-[var(--test-foreground)] hover:bg-[var(--test-accent-soft)]"
                >
                  <Waypoints className="h-4 w-4" />
                  Organize
                </Button>
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
          </Panel>

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

        {/* New server wizard */}
        <NewServerSheet
          open={newServerOpen}
          onOpenChange={setNewServerOpen}
          projectID={projectID ?? null}
          scope={scope}
          activeServerNames={activeServerNames ?? []}
          onCreated={() => { requestRefreshBurst(); }}
        />

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
