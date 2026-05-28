"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import type { InfrastructureNode } from "@/features/hosting/model/types";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalLabel } from "@/components/ui/Modal";

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
  const [label, setLabel] = useState(initialData?.label ?? "");
  const [color, setColor] = useState(initialData?.color ?? "#6366f1");
  const [memberIds, setMemberIds] = useState<string[]>(initialData?.memberIds ?? []);
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [role, setRole] = useState(initialData?.role ?? "");

  useEffect(() => {
    if (!open) return;
    setLabel(initialData?.label ?? "");
    setColor(initialData?.color ?? "#6366f1");
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
    <Modal open={open} onOpenChange={(v) => { if (!v) onCancel(); }} size="md">
      <ModalHeader onClose={onCancel}>
        <ModalTitle>{mode === "create" ? "Create stack" : "Edit stack"}</ModalTitle>
        <ModalDescription>
          Group servers together on the canvas with a shared visual boundary.
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {/* Name */}
        <div className="space-y-1.5">
          <ModalLabel>Name</ModalLabel>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Game Servers, Databases…"
            className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <ModalLabel>Color</ModalLabel>
          <label className="flex cursor-pointer items-center gap-3">
            <div
              className="relative size-9 shrink-0 rounded-lg overflow-hidden border border-white/[0.12]"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="font-mono text-[12px] text-white/40">{color}</span>
            <span className="text-[11px] text-white/25">Click to open color picker</span>
          </label>
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <ModalLabel>
            Type <span className="normal-case text-white/25 tracking-normal font-normal">(optional)</span>
          </ModalLabel>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_ROLES.map((r) => {
              const active = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(active ? "" : r.id)}
                  className="rounded-lg border px-2.5 py-1 text-[12px] transition-colors"
                  style={
                    active
                      ? { borderColor: `${color}60`, backgroundColor: `${color}15`, color }
                      : { borderColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <ModalLabel>
            Notes <span className="normal-case text-white/25 tracking-normal font-normal">(optional)</span>
          </ModalLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What lives in this stack…"
            rows={2}
            className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 resize-none transition-colors"
          />
        </div>

        {/* Servers */}
        {nodes.length > 0 && (
          <div className="space-y-1.5">
            <ModalLabel>
              Servers{" "}
              <span className="normal-case text-white/25 tracking-normal font-normal">
                ({memberIds.length} selected)
              </span>
            </ModalLabel>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {nodes.map((node) => {
                const checked = memberIds.includes(node.id);
                return (
                  <button
                    key={node.id}
                    onClick={() => toggleMember(node.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors"
                    style={
                      checked
                        ? { borderColor: `${color}40`, backgroundColor: `${color}0a` }
                        : { borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.01)" }
                    }
                  >
                    <div
                      className="flex size-3.5 shrink-0 items-center justify-center rounded border"
                      style={
                        checked
                          ? { backgroundColor: color, borderColor: "transparent" }
                          : { borderColor: "rgba(255,255,255,0.15)" }
                      }
                    >
                      {checked && (
                        <svg className="size-2 text-black" fill="none" viewBox="0 0 10 10">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-white/75">{node.name}</p>
                      <p className="truncate text-[10px] text-white/30">{node.subtitle || node.kind}</p>
                    </div>
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
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
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {mode === "edit" && onDelete && (
          <button
            onClick={onDelete}
            className="mr-auto flex items-center gap-1.5 text-[12px] text-red-400/40 hover:text-red-400 transition-colors"
          >
            <Trash2 className="size-3.5" />
            Delete stack
          </button>
        )}
        <button
          onClick={onCancel}
          className="h-9 px-4 rounded-lg text-[12px] font-semibold text-white/50 hover:text-white/80 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!label.trim()}
          className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-primary text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-40 transition-all"
        >
          {mode === "create" ? "Create stack" : "Save changes"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
