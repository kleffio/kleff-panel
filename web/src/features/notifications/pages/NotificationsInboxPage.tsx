"use client";

import React from "react";
import Link from "next/link";
import { cn, Button, Skeleton } from "@kleffio/ui";
import {
  Bell,
  CreditCard,
  Users,
  FolderOpen,
  Server,
  Box,
  ShieldAlert,
  Trash2,
  CheckCheck,
} from "lucide-react";
import {
  useNotificationActions,
  useNotifications,
  useUnreadCount,
} from "../hooks/useNotifications";
import { useNotificationStream } from "../hooks/useNotificationStream";
import { AcceptInviteDialog } from "../components/AcceptInviteDialog";
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

const typeLabel: Record<NotificationType, string> = {
  system: "System",
  billing: "Billing",
  org_invitation: "Org Invitation",
  project_invitation: "Environment Invitation",
  deployment: "Deployment",
  workload: "Workload",
  security: "Security",
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

function NotificationRow({
  notification,
  onMarkRead,
  onDelete,
  onAcceptInvite,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onAcceptInvite?: (token: string) => void;
}) {
  const Icon = typeIcon[notification.type] ?? Bell;
  const isUnread = !notification.read_at;

  return (
    <div
      className={cn(
        "group flex items-start gap-4 rounded-xl px-4 py-3.5 transition-colors cursor-default",
        isUnread ? "bg-primary/[0.05] hover:bg-primary/[0.08]" : "hover:bg-white/[0.03]"
      )}
      onClick={() => isUnread && onMarkRead(notification.id)}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
          isUnread
            ? "bg-primary/20 text-primary"
            : "bg-white/[0.06] text-muted-foreground/40"
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm leading-snug",
                isUnread ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {notification.title}
            </p>
            {notification.body && (
              <p className="mt-0.5 text-sm text-muted-foreground/60 line-clamp-2">
                {notification.body}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground/40 tabular-nums">
              {relativeTime(notification.created_at)}
            </span>
            {isUnread && (
              <span className="size-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-muted-foreground/50">
            {typeLabel[notification.type] ?? notification.type}
          </span>
          {notification.type === "project_invitation" && typeof notification.data?.token === "string" && !notification.read_at && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); onAcceptInvite?.(notification.data!.token as string); }}
            >
              Accept invite →
            </button>
          )}
          {notification.type === "org_invitation" && typeof notification.data?.token === "string" && !notification.read_at && (
            <Link
              href={
                typeof notification.data?.environment_slug === "string"
                  ? `/env-invite/${notification.data.token}`
                  : `/ns-invite/${notification.data.token}`
              }
              className="text-xs font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Accept invite →
            </Link>
          )}
        </div>
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-0.5">
        {isUnread && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground/40 hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id); }}
            aria-label="Mark as read"
          >
            <CheckCheck className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground/40 hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          aria-label="Delete"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ unreadOnly }: { unreadOnly?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04]">
        <Bell className="size-6 text-muted-foreground/30" />
      </span>
      <div>
        <p className="text-sm font-medium text-muted-foreground/60">
          {unreadOnly ? "No unread notifications" : "No notifications"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/35">
          {unreadOnly ? "You're all caught up." : "Notifications will appear here when you receive them."}
        </p>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 px-4 py-3.5">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = "all" | "unread";

export function NotificationsInboxPage() {
  useNotificationStream();

  const [tab, setTab] = React.useState<Tab>("all");
  const [inviteToken, setInviteToken] = React.useState<string | null>(null);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: all = [], isLoading: allLoading } = useNotifications();
  const { data: unread = [], isLoading: unreadLoading } = useNotifications({ unread: true });
  const { markRead, markAllRead, remove } = useNotificationActions();

  const activeList = tab === "all" ? all : unread;
  const isLoading = tab === "all" ? allLoading : unreadLoading;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground/50">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="gap-1.5 text-xs"
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 rounded-lg bg-white/[0.04] p-1 w-fit">
        {(["all", "unread"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t
                ? "bg-white/[0.08] text-foreground shadow-sm"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            {t === "all" ? "All" : "Unread"}
            {t === "unread" && unreadCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary leading-none">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-px">
        {isLoading ? (
          <SkeletonRows />
        ) : activeList.length === 0 ? (
          <EmptyState unreadOnly={tab === "unread"} />
        ) : (
          activeList.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onMarkRead={(id) => markRead.mutate(id)}
              onDelete={(id) => remove.mutate(id)}
              onAcceptInvite={(token) => setInviteToken(token)}
            />
          ))
        )}
      </div>

      {inviteToken && (
        <AcceptInviteDialog
          token={inviteToken}
          open={!!inviteToken}
          onOpenChange={(open) => { if (!open) setInviteToken(null); }}
        />
      )}
    </div>
  );
}
