"use client";

import { LayoutGrid, MoreHorizontal, Pencil, ScanSearch, Trash2 } from "lucide-react";
import { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { NodeResizer } from "reactflow";
import type { NodeProps } from "reactflow";

import { GROUP_ROLES } from "./GroupManagerModal";
import { useGroupEvents } from "./GroupEventContext";

export const GROUP_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f43f5e", // rose
  "#f59e0b", // amber
];

export interface GroupNodeData {
  label: string;
  color: string;
  memberIds: string[];
  memberCount: number;
  avgCpu: number | null;
  computedStatus: null;
  notes: string;
  role: string;
  isDropTarget?: boolean;
}

export const GroupNode = memo(function GroupNode({
  id,
  data,
  selected,
}: NodeProps<GroupNodeData>) {
  const { onDelete, onEdit, onFitToMembers, onAutoArrange } = useGroupEvents();
  const roleInfo = GROUP_ROLES.find((r) => r.id === data.role);
  const { color, isDropTarget } = data;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const sideBorder = isDropTarget ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.08)";
  const bgColor = isDropTarget ? "rgba(11,12,16,0.94)" : "rgba(11,12,16,0.88)";

  return (
    <>
      <NodeResizer
        minWidth={280}
        minHeight={180}
        isVisible={!!selected}
        handleStyle={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: "rgba(255,255,255,0.25)",
          border: "none",
        }}
        lineStyle={{ border: "none" }}
      />
      <motion.div
        className="relative h-full w-full rounded-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{
          borderTop: sideBorder,
          borderRight: sideBorder,
          borderBottom: sideBorder,
          borderLeft: `3px solid ${color}`,
          backgroundColor: bgColor,
          backdropFilter: "blur(12px)",
          pointerEvents: "none",
          transition: "border-color 0.15s ease, background-color 0.15s ease",
        }}
      >
        {/* Label row */}
        <div
          className="absolute left-3 top-2.5 flex items-center gap-1.5"
          style={{ pointerEvents: "auto", cursor: "grab" }}
        >
          <span className="text-[11px] font-semibold leading-none text-white/70">
            {data.label}
          </span>
          {roleInfo && (
            <span className="text-[10px] leading-none text-white/25">
              · {roleInfo.label}
            </span>
          )}
          {data.memberCount > 0 && (
            <span className="text-[10px] leading-none text-white/20">
              · {data.memberCount} server{data.memberCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Three-dot menu trigger */}
        <div className="absolute right-2 top-1.5" style={{ pointerEvents: "auto" }}>
          <button
            ref={buttonRef}
            className="grid size-6 place-items-center rounded text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/70"
            onClick={(e) => {
              e.stopPropagation();
              const rect = buttonRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>

        {/* Notes */}
        {data.notes ? (
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
            <p className="text-[10px] leading-4 text-white/35 line-clamp-2">{data.notes}</p>
          </div>
        ) : null}
      </motion.div>

      {/* Dropdown rendered via portal to document.body — escapes ReactFlow transform */}
      {menuOpen && menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 9999,
            }}
            className="w-40 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0e1117] shadow-2xl"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit(id);
              }}
            >
              <Pencil className="size-3" />
              Edit
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onFitToMembers(id);
              }}
            >
              <ScanSearch className="size-3" />
              Fit to members
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white/90"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onAutoArrange(id);
              }}
            >
              <LayoutGrid className="size-3" />
              Auto-arrange
            </button>
            <div className="mx-2 my-1 h-px bg-white/[0.06]" />
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-red-400/70 transition-colors hover:bg-red-500/[0.08] hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(id);
              }}
            >
              <Trash2 className="size-3" />
              Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
});
