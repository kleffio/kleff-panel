"use client";

import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
  Skeleton,
  cn,
} from "@kleffio/ui";
import { Bell } from "lucide-react";
import {
  useNotificationActions,
  useNotifications,
  useUnreadCount,
} from "../hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";

export function NotificationBell() {
  const { data: count = 0 } = useUnreadCount();
  const { data: notifications = [], isLoading } = useNotifications();
  const { markRead, markAllRead, remove } = useNotificationActions();

  const hasUnread = count > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-white/[0.05]"
          aria-label={`Notifications${hasUnread ? ` (${count} unread)` : ""}`}
        >
          <Bell className="size-3.5" />
          {hasUnread && (
            <Badge
              className={cn(
                "absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full p-0",
                "bg-primary text-[9px] font-bold text-primary-foreground leading-none"
              )}
            >
              {count > 99 ? "99+" : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {hasUnread && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>
        <Separator />


        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2">
                  <Skeleton className="size-7 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Bell className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/50">
                You&apos;re all caught up
              </p>
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                  onDelete={(id) => remove.mutate(id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
