"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Maximize2, Play, RotateCcw, ScrollText, Trash2 } from "lucide-react";
import { memo } from "react";
import Link from "next/link";
import type { NodeProps } from "reactflow";

import { getKindMeta, getStatusMeta, type InfrastructureFlowNodeData } from "@/features/hosting/lib/infrastructure-graph";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@kleffio/ui";

function getNodeLogoMeta(kind: string) {
  switch (kind) {
    case "app":
      return {
        token: "JS",
        className: "bg-[#e7d04c] text-[#151515] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "api":
      return {
        token: "PY",
        className: "bg-[linear-gradient(135deg,#4da3ff,#f4c84e)] text-[#111827] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "database":
      return {
        token: "PG",
        className: "bg-[#2f7adf] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "cache":
      return {
        token: "RD",
        className: "bg-[#d94b5b] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "proxy":
      return {
        token: "EN",
        className: "bg-[#7a849b] text-[#0e1220] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "worker":
      return {
        token: "WK",
        className: "bg-[#e0a54f] text-[#161616] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "game-server":
      return {
        token: "MC",
        className: "bg-[#57c26d] text-[#102114] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    case "support":
      return {
        token: "OB",
        className: "bg-[linear-gradient(135deg,#43d4d0,#4f8cff)] text-[#08131f] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
    default:
      return {
        token: "SV",
        className: "bg-white/10 text-[var(--test-foreground)] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
      };
  }
}

export const InfrastructureNodeCard = memo(function InfrastructureNodeCard({
  data,
  selected,
}: NodeProps<InfrastructureFlowNodeData>) {
  const { node, onAction, justAdded } = data;
  const status = getStatusMeta(node.status);
  const kind = getKindMeta(node.kind);
  const logo = getNodeLogoMeta(node.kind);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          animate={{
            boxShadow: justAdded
              ? [
                  "0 12px 32px rgba(0,0,0,0.28), 0 0 0 2px rgba(99,230,190,0.55)",
                  "0 12px 32px rgba(0,0,0,0.28), 0 0 0 2px rgba(99,230,190,0)",
                ]
              : "0 12px 32px rgba(0, 0, 0, 0.28)",
          }}
          transition={{ duration: justAdded ? 0.8 : 0.2 }}
          className={`relative min-w-[220px] max-w-[220px] rounded-[18px] border backdrop-blur-xl border-white/8 bg-[#111214] ${
            selected ? "ring-2 ring-[#f5b517]/40 ring-offset-2 ring-offset-transparent" : ""
          }`}
          style={{ backgroundImage: `linear-gradient(180deg, ${kind.accent}, transparent)` }}
        >
          <div className="space-y-2.5 p-3">
            {/* Top row: logo + name + kind + link */}
            <div className="flex items-center gap-2">
              <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-[10px] font-bold tracking-[0.02em] ${logo.className}`}>
                {logo.token}
              </div>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[13px] font-semibold leading-tight text-[var(--test-foreground)]">
                  {node.name}
                </strong>
                <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--test-muted)]">
                  {kind.label}
                </span>
              </div>
              {node.route ? (
                <Link
                  href={node.route}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.04] text-[var(--test-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--test-foreground)]"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>

            {/* Status + endpoint row */}
            <div className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.03] px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
                <span className={status.textClassName}>{status.label}</span>
              </div>
              <p className="truncate max-w-[90px] text-right text-[10px] text-[var(--test-muted)]">
                {node.metrics.traffic}
              </p>
            </div>
          </div>
        </motion.div>
      </ContextMenuTrigger>

      <ContextMenuContent className="rounded-2xl border border-[var(--test-border)] bg-[var(--test-panel)] text-[var(--test-foreground)]">
        <ContextMenuLabel>{node.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        {node.actions.includes("restart") ? (
          <ContextMenuItem onSelect={() => onAction(node.id, "restart")}>
            <RotateCcw className="h-4 w-4" />
            Restart
          </ContextMenuItem>
        ) : null}
        {node.actions.includes("logs") ? (
          <ContextMenuItem onSelect={() => onAction(node.id, "logs")}>
            <ScrollText className="h-4 w-4" />
            Logs
          </ContextMenuItem>
        ) : null}
        {node.actions.includes("scale") ? (
          <ContextMenuItem onSelect={() => onAction(node.id, "scale")}>
            <Maximize2 className="h-4 w-4" />
            Scale
          </ContextMenuItem>
        ) : null}
        {node.actions.includes("restart") ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAction(node.id, "restart")}>
              <Play className="h-4 w-4" />
              Quick recover
            </ContextMenuItem>
          </>
        ) : null}
        {node.actions.includes("delete") ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-red-200 focus:bg-red-400/15 focus:text-red-100"
              onSelect={() => onAction(node.id, "delete")}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}, (prev, next) =>
  prev.data.node === next.data.node &&
  prev.selected === next.selected &&
  prev.data.justAdded === next.data.justAdded,
);
