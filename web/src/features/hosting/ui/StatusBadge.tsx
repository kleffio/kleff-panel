import { Badge, cn } from "@kleffio/ui";

export type GameServerStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting"
  | "provisioning"
  | "crashed"
  | "error";

interface StatusBadgeProps {
  status: GameServerStatus;
  showDot?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<GameServerStatus, { label: string; dot: string; badge: string }> = {
  running: {
    label: "Running",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  },
  stopped: {
    label: "Stopped",
    dot: "bg-zinc-500",
    badge: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  },
  starting: {
    label: "Starting",
    dot: "bg-amber-400 animate-pulse",
    badge: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
  },
  stopping: {
    label: "Stopping",
    dot: "bg-amber-400 animate-pulse",
    badge: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
  },
  restarting: {
    label: "Restarting",
    dot: "bg-blue-400 animate-pulse",
    badge: "bg-blue-400/10 text-blue-400 ring-blue-400/20",
  },
  provisioning: {
    label: "Provisioning",
    dot: "bg-blue-400 animate-pulse",
    badge: "bg-blue-400/10 text-blue-400 ring-blue-400/20",
  },
  crashed: {
    label: "Crashed",
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-400 ring-red-500/20",
  },
  error: {
    label: "Error",
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-400 ring-red-500/20",
  },
};

export function StatusBadge({ status, showDot = true, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      className={cn(
        "h-auto gap-1.5 border-0 ring-1 ring-inset",
        config.badge,
        className
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 flex-none rounded-full", config.dot)} />}
      {config.label}
    </Badge>
  );
}
