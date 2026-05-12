"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { InfrastructureNode } from "@/features/hosting/model/types";
import { GROUP_COLORS } from "./GroupNode";

export interface GroupFormData {
  label: string;
  color: string;
  memberIds: string[];
  notes: string;
  role: string;
}

export const GROUP_ROLES: { id: string; label: string; emoji: string }[] = [
  { id: "game-servers", label: "Game Servers", emoji: "🎮" },
  { id: "databases", label: "Databases", emoji: "🗄️" },
  { id: "networking", label: "Networking", emoji: "🌐" },
  { id: "api", label: "API Layer", emoji: "⚡" },
  { id: "workers", label: "Workers", emoji: "⚙️" },
  { id: "monitoring", label: "Monitoring", emoji: "📊" },
  { id: "frontend", label: "Frontend", emoji: "🖥️" },
  { id: "custom", label: "Custom", emoji: "📦" },
];

export function GroupManagerModal({
  open,
  mode,
  initialData,
  nodes,
  onConfirm,
  onCancel,
  onDelete,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialData?: GroupFormData;
  nodes: InfrastructureNode[];
  onConfirm: (data: GroupFormData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(initialData?.label ?? "New Group");
  const [color, setColor] = useState(initialData?.color ?? GROUP_COLORS[0]);
  const [memberIds, setMemberIds] = useState<string[]>(initialData?.memberIds ?? []);
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [role, setRole] = useState(initialData?.role ?? "");

  useEffect(() => {
    if (!open) return;
    setLabel(initialData?.label ?? "New Group");
    setColor(initialData?.color ?? GROUP_COLORS[0]);
    setMemberIds(initialData?.memberIds ?? []);
    setNotes(initialData?.notes ?? "");
    setRole(initialData?.role ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleMember = useCallback((id: string) => {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (!label.trim()) return;
    onConfirm({ label: label.trim(), color, memberIds, notes, role });
  }, [label, color, memberIds, notes, role, onConfirm]);

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#0e1117] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  {mode === "create" ? "Create group" : "Edit group"}
                </p>
                <p className="text-xs text-white/40">
                  {mode === "create"
                    ? "Organize containers into a named group"
                    : "Update membership, role, color, or notes"}
                </p>
              </div>
              <button
                onClick={onCancel}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/40 hover:bg-white/8 hover:text-white/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/40">
                  Group name
                </label>
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Game Servers, Databases…"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/25"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirm();
                    if (e.key === "Escape") onCancel();
                  }}
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/40">
                  Role <span className="normal-case text-white/25">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_ROLES.map((r) => {
                    const active = role === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setRole(active ? "" : r.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "border-white/20 bg-white/[0.08] text-white"
                            : "border-white/6 bg-white/[0.02] text-white/50 hover:border-white/14 hover:bg-white/[0.05] hover:text-white/75"
                        }`}
                        style={active ? { borderColor: `${color}50`, backgroundColor: `${color}12`, color } : undefined}
                      >
                        <span>{r.emoji}</span>
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/40">
                  Color
                </label>
                <div className="flex gap-2.5">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        boxShadow:
                          color === c ? `0 0 0 2px #0e1117, 0 0 0 4px ${c}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Members */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/40">
                  Containers{" "}
                  <span className="normal-case text-white/25">
                    ({memberIds.length} selected)
                  </span>
                </label>
                {nodes.length === 0 ? (
                  <p className="text-xs text-white/30">No containers in this environment yet.</p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                    {nodes.map((node) => {
                      const checked = memberIds.includes(node.id);
                      return (
                        <button
                          key={node.id}
                          onClick={() => toggleMember(node.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            checked
                              ? "border-white/20 bg-white/[0.06]"
                              : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                            style={
                              checked
                                ? { backgroundColor: color, borderColor: "transparent" }
                                : { borderColor: "rgba(255,255,255,0.2)" }
                            }
                          >
                            {checked ? (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                <path
                                  d="M2 5l2.5 2.5L8 3"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white/80">{node.name}</p>
                            <p className="truncate text-[11px] text-white/35">{node.subtitle || node.kind}</p>
                          </div>
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              node.status === "running"
                                ? "bg-emerald-400"
                                : node.status === "error"
                                  ? "bg-red-400"
                                  : "animate-pulse bg-amber-400"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-white/40">
                  Notes <span className="normal-case text-white/25">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Isolated workloads for game servers…"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-white/25"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
              <div>
                {mode === "edit" && onDelete ? (
                  <button
                    onClick={onDelete}
                    className="text-xs text-red-400/50 transition-colors hover:text-red-400"
                  >
                    Delete group
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!label.trim()}
                  className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-30"
                  style={{ background: "#f5b517", color: "#0e0c00" }}
                >
                  {mode === "create" ? "Create group" : "Save changes"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
