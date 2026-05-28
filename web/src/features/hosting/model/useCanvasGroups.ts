"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node } from "reactflow";
import { applyNodeChanges } from "reactflow";
import type { NodeChange } from "reactflow";
import { toast } from "sonner";

import { GROUP_COLORS, type GroupNodeData } from "@/features/hosting/ui/GroupNode";
import type { GroupFormData } from "@/features/hosting/ui/GroupManagerModal";
import type { CanvasGroup } from "@/features/hosting/model/types";
import type { InfrastructureFlowNodeData } from "@/features/hosting/lib/infrastructure-graph";
import {
  listCanvasGroups,
  upsertCanvasGroup,
  deleteCanvasGroup,
  type CanvasGroupDTO,
} from "@/lib/api/canvas_groups";

// ── Conversions ────────────────────────────────────────────────────────────────

function dtoToGroup(dto: CanvasGroupDTO): CanvasGroup {
  return {
    id: dto.id,
    label: dto.label,
    color: dto.color,
    memberIds: dto.member_ids,
    notes: dto.notes,
    role: dto.role,
    position: { x: dto.pos_x, y: dto.pos_y },
    size: { width: dto.width, height: dto.height },
  };
}

function groupToPayload(group: CanvasGroup) {
  return {
    label: group.label,
    color: group.color,
    member_ids: group.memberIds,
    notes: group.notes,
    role: group.role,
    pos_x: group.position.x,
    pos_y: group.position.y,
    width: group.size.width,
    height: group.size.height,
  };
}

function domainGroupToFlowNode(group: CanvasGroup): Node<GroupNodeData> {
  return {
    id: group.id,
    type: "stack",
    position: group.position,
    width: group.size.width,
    height: group.size.height,
    style: { width: group.size.width, height: group.size.height },
    data: {
      label: group.label,
      color: group.color,
      memberIds: group.memberIds,
      memberCount: group.memberIds.length,
      avgCpu: null,
      computedStatus: null,
      notes: group.notes,
      role: group.role,
    },
    draggable: true,
    selectable: true,
    zIndex: 0,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export type GroupModal = {
  open: boolean;
  mode: "create" | "edit";
  editId: string | null;
  initialData?: GroupFormData;
};

export function useCanvasGroups({
  projectID,
  namespaceSlug,
  flowNodesRef,
}: {
  projectID?: string | null;
  namespaceSlug?: string | null;
  flowNodesRef: React.RefObject<Array<Node<InfrastructureFlowNodeData>>>;
}) {
  const colorIndexRef = useRef(0);
  const [groups, setGroups] = useState<CanvasGroup[]>([]);

  // Mirror of groups state for use inside timers without stale closures
  const groupsRef = useRef<CanvasGroup[]>([]);

  // Debounce tracking for position/size changes during drag
  const dirtyGroupsRef = useRef<Set<string>>(new Set());
  const posFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [groupModal, setGroupModal] = useState<GroupModal>({
    open: false,
    mode: "create",
    editId: null,
  });

  // Load from API on mount
  useEffect(() => {
    if (!namespaceSlug) return;
    listCanvasGroups(namespaceSlug)
      .then((data) => {
        const loaded = (data?.groups ?? []).map(dtoToGroup);
        groupsRef.current = loaded;
        setGroups(loaded);
      })
      .catch(() => {});
  }, [namespaceSlug]);

  const updateGroups = useCallback(
    (updater: (prev: CanvasGroup[]) => CanvasGroup[]) => {
      setGroups((prev) => {
        const next = updater(prev);
        groupsRef.current = next;
        return next;
      });
    },
    [],
  );

  const upsertNow = useCallback(
    (group: CanvasGroup) => {
      if (!namespaceSlug) return;
      upsertCanvasGroup(namespaceSlug, group.id, groupToPayload(group)).catch(() => {});
    },
    [namespaceSlug],
  );

  const scheduleFlush = useCallback(
    (groupId: string) => {
      if (!namespaceSlug) return;
      dirtyGroupsRef.current.add(groupId);
      if (posFlushTimerRef.current) clearTimeout(posFlushTimerRef.current);
      posFlushTimerRef.current = setTimeout(() => {
        const dirty = [...dirtyGroupsRef.current];
        dirtyGroupsRef.current = new Set();
        for (const id of dirty) {
          const g = groupsRef.current.find((x) => x.id === id);
          if (g) upsertCanvasGroup(namespaceSlug, g.id, groupToPayload(g)).catch(() => {});
        }
      }, 600);
    },
    [namespaceSlug],
  );

  const groupNodes = useMemo(
    () => groups.map(domainGroupToFlowNode),
    [groups],
  );

  const groupNodeIds = useMemo(
    () => new Set(groups.map((g) => g.id)),
    [groups],
  );

  const handleDeleteGroup = useCallback(
    (id: string) => {
      updateGroups((prev) => prev.filter((g) => g.id !== id));
      if (namespaceSlug) deleteCanvasGroup(namespaceSlug, id).catch(() => {});
    },
    [updateGroups, namespaceSlug],
  );

  const handleEditGroup = useCallback(
    (id: string) => {
      const target = groups.find((g) => g.id === id);
      if (!target) return;
      setGroupModal({
        open: true,
        mode: "edit",
        editId: id,
        initialData: {
          label: target.label,
          color: target.color,
          memberIds: target.memberIds,
          notes: target.notes,
          role: target.role,
        },
      });
    },
    [groups],
  );

  const handleOpenCreateModal = useCallback(() => {
    const color = GROUP_COLORS[colorIndexRef.current % GROUP_COLORS.length];
    colorIndexRef.current += 1;
    setGroupModal({
      open: true,
      mode: "create",
      editId: null,
      initialData: { label: "New Group", color, memberIds: [], notes: "", role: "" },
    });
  }, []);

  const handleConfirmGroup = useCallback(
    (formData: GroupFormData, editId: string | null, mode: "create" | "edit") => {
      const duplicate = groupsRef.current.find(
        (g) =>
          g.label.toLowerCase() === formData.label.toLowerCase() &&
          g.id !== (editId ?? ""),
      );
      if (duplicate) {
        toast.error(`A stack named "${formData.label}" already exists`);
        return;
      }

      if (mode === "edit" && editId) {
        let updated: CanvasGroup | undefined;
        updateGroups((gs) =>
          gs.map((g) => {
            if (g.id !== editId) return g;
            updated = {
              ...g,
              label: formData.label,
              color: formData.color,
              memberIds: formData.memberIds,
              notes: formData.notes,
              role: formData.role,
            };
            return updated;
          }),
        );
        if (updated) upsertNow(updated);
      } else {
        const id = `group-${Date.now()}`;
        let position = { x: 80, y: 80 };
        let width = 380;
        let height = 280;

        const currentFlowNodes = flowNodesRef.current ?? [];
        if (formData.memberIds.length > 0) {
          const memberNodes = currentFlowNodes.filter((n) =>
            formData.memberIds.includes(n.id),
          );
          if (memberNodes.length > 0) {
            const PAD = 48;
            const xs = memberNodes.map((n) => n.position.x);
            const ys = memberNodes.map((n) => n.position.y);
            const x2s = memberNodes.map((n) => n.position.x + (n.width ?? 220));
            const y2s = memberNodes.map((n) => n.position.y + (n.height ?? 110));
            const minX = Math.min(...xs) - PAD;
            const minY = Math.min(...ys) - PAD - 36;
            const maxX = Math.max(...x2s) + PAD;
            const maxY = Math.max(...y2s) + PAD;
            position = { x: minX, y: minY };
            width = Math.max(380, maxX - minX);
            height = Math.max(280, maxY - minY);
          }
        }

        const newGroup: CanvasGroup = {
          id,
          label: formData.label,
          color: formData.color,
          memberIds: formData.memberIds,
          notes: formData.notes,
          role: formData.role,
          position,
          size: { width, height },
        };

        updateGroups((gs) => [...gs, newGroup]);
        upsertNow(newGroup);
        toast.success(`Group "${formData.label}" created`);
      }

      setGroupModal((prev) => ({ ...prev, open: false }));
    },
    [updateGroups, upsertNow, flowNodesRef],
  );

  const handleGroupNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const groupChanges = changes.filter((c) =>
        groupNodeIds.has((c as { id: string }).id),
      );
      if (groupChanges.length === 0) return;

      const changedIds = new Set<string>();

      setGroups((prev) => {
        const updated = prev.map((g) => {
          const relevant = groupChanges.filter(
            (c) => (c as { id: string }).id === g.id,
          );
          if (relevant.length === 0) return g;

          const [applied] = applyNodeChanges(relevant, [domainGroupToFlowNode(g)]);
          if (!applied) return g;

          changedIds.add(g.id);
          return {
            ...g,
            position: applied.position,
            size: {
              width: (applied.style?.width as number | undefined) ?? g.size.width,
              height: (applied.style?.height as number | undefined) ?? g.size.height,
            },
          };
        });
        groupsRef.current = updated;
        return updated;
      });

      // Debounce API persistence for position/size changes
      for (const id of changedIds) scheduleFlush(id);
    },
    [groupNodeIds, scheduleFlush],
  );

  const addMemberToGroup = useCallback(
    (groupId: string, nodeId: string) => {
      let updated: CanvasGroup | undefined;
      updateGroups((gs) =>
        gs.map((g) => {
          if (g.id !== groupId) return g;
          updated = { ...g, memberIds: [...new Set([...g.memberIds, nodeId])] };
          return updated;
        }),
      );
      if (updated) upsertNow(updated);
    },
    [updateGroups, upsertNow],
  );

  const expandGroupToFit = useCallback(
    (
      groupId: string,
      nodePos: { x: number; y: number },
      nodeSize: { width: number; height: number },
    ) => {
      const PAD = 16;
      const LABEL_H = 32;
      updateGroups((gs) =>
        gs.map((g) => {
          if (g.id !== groupId) return g;

          const right = g.position.x + g.size.width;
          const bottom = g.position.y + g.size.height;

          const newX = Math.min(g.position.x, nodePos.x - PAD);
          const newY = Math.min(g.position.y, nodePos.y - LABEL_H - PAD);
          const newRight = Math.max(right, nodePos.x + nodeSize.width + PAD);
          const newBottom = Math.max(bottom, nodePos.y + nodeSize.height + PAD);

          const newWidth = newRight - newX;
          const newHeight = newBottom - newY;

          if (
            newX === g.position.x &&
            newY === g.position.y &&
            newWidth === g.size.width &&
            newHeight === g.size.height
          ) return g;

          const next = { ...g, position: { x: newX, y: newY }, size: { width: newWidth, height: newHeight } };
          scheduleFlush(groupId);
          return next;
        }),
      );
    },
    [updateGroups, scheduleFlush],
  );

  const removeMemberFromGroup = useCallback(
    (groupId: string, nodeId: string) => {
      let updated: CanvasGroup | undefined;
      updateGroups((gs) =>
        gs.map((g) => {
          if (g.id !== groupId) return g;
          updated = { ...g, memberIds: g.memberIds.filter((id) => id !== nodeId) };
          return updated;
        }),
      );
      if (updated) upsertNow(updated);
    },
    [updateGroups, upsertNow],
  );

  const fitGroupToMembers = useCallback(
    (groupId: string) => {
      const currentFlowNodes = flowNodesRef.current ?? [];
      updateGroups((gs) => {
        const group = gs.find((g) => g.id === groupId);
        if (!group || group.memberIds.length === 0) return gs;
        const memberNodes = currentFlowNodes.filter((n) => group.memberIds.includes(n.id));
        if (memberNodes.length === 0) return gs;
        const PAD = 48;
        const LABEL_H = 36;
        const xs = memberNodes.map((n) => n.position.x);
        const ys = memberNodes.map((n) => n.position.y);
        const x2s = memberNodes.map((n) => n.position.x + (n.width ?? 220));
        const y2s = memberNodes.map((n) => n.position.y + (n.height ?? 110));
        const minX = Math.min(...xs) - PAD;
        const minY = Math.min(...ys) - LABEL_H - PAD;
        const maxX = Math.max(...x2s) + PAD;
        const maxY = Math.max(...y2s) + PAD;
        return gs.map((g) => {
          if (g.id !== groupId) return g;
          const next = {
            ...g,
            position: { x: minX, y: minY },
            size: { width: Math.max(280, maxX - minX), height: Math.max(180, maxY - minY) },
          };
          // Fire immediately — user-triggered action
          if (namespaceSlug) {
            upsertCanvasGroup(namespaceSlug, next.id, groupToPayload(next)).catch(() => {});
          }
          return next;
        });
      });
    },
    [updateGroups, flowNodesRef, namespaceSlug],
  );

  const resizeGroup = useCallback(
    (groupId: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
      let updated: CanvasGroup | undefined;
      updateGroups((gs) =>
        gs.map((g) => {
          if (g.id !== groupId) return g;
          updated = { ...g, position, size };
          return updated;
        }),
      );
      if (updated) upsertNow(updated);
    },
    [updateGroups, upsertNow],
  );

  return {
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
  };
}
