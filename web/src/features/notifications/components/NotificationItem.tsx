"use client";

import Link from "next/link";
import { cn, Button } from "@kleffio/ui";
import {
  Bell,
  CreditCard,
  Users,
  FolderOpen,
  Server,
  Box,
  ShieldAlert,
  X,
} from "lucide-react";
import type { Notification, NotificationType } from "../api";

const typeIcon: Record<NotificationType, React.ElementType> = {
  system: Bell,
  billing: CreditCard,
  org_invitation: Users,
  project_invitation: FolderOpen,
  deployment: Server,
  workload: Box,
  security: ShieldAlert,
};

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  notification: Notification;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function NotificationItem({ notification, onMarkRead, onDelete }: Props) {
  const Icon = typeIcon[notification.type] ?? Bell;
  const isUnread = !notification.read_at;

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
        isUnread
          ? "bg-primary/[0.06] hover:bg-primary/[0.1]"
          : "hover:bg-white/[0.03]"
      )}
    >
      {/* Type icon */}
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
          isUnread
            ? "bg-primary/20 text-primary"
            : "bg-white/[0.05] text-muted-foreground/50"
        )}
      >
        <Icon className="size-3.5" />
      </span>

      {/* Content */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => isUnread && onMarkRead?.(notification.id)}
      >
        <p
          className={cn(
            "text-sm leading-snug",
            isUnread
              ? "font-medium text-foreground"
              : "font-normal text-muted-foreground"
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 text-xs text-muted-foreground/70 line-clamp-2">
            {notification.body}
          </p>
        )}
        {notification.type === "project_invitation" && typeof notification.data?.token === "string" && (
          <Link
            href={`/project-invite/${notification.data.token}`}
            className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Accept invite →
          </Link>
        )}
        {notification.type === "org_invitation" && typeof notification.data?.token === "string" && (
          <Link
            href={
              typeof notification.data?.environment_slug === "string"
                ? `/env-invite/${notification.data.token}`
                : `/ns-invite/${notification.data.token}`
            }
            className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Accept invite →
          </Link>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/40">
          {relativeTime(notification.created_at)}
        </p>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
      )}

      {/* Delete button — revealed on hover */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 hidden size-5 group-hover:flex text-muted-foreground/40 hover:text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(notification.id);
        }}
        aria-label="Dismiss notification"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
