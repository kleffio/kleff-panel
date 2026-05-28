"use client";

import { useState, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  Bell,
  Home,
  Settings,
  LogOut,
  ShieldCheck,
  Layers,
  Plus,
  ChevronRight,
  Users,
  Loader2,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@kleffio/ui";
import { useAuth, broadcastSignout, useHasRole, AuthConfigContext } from "@/features/auth";
import { useUnreadCount } from "@/features/notifications";
import { useQuery } from "@tanstack/react-query";
import { listNamespaces, listEnvironments } from "@/lib/api/namespaces";
import { revokeSession } from "@/lib/api/plugins";
import { getMyProfile } from "@/lib/api/profiles";

// ── Slide-over nav ─────────────────────────────────────────────────────────

function NavEnvList({ nsSlug, onClose }: { nsSlug: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["environments", nsSlug],
    queryFn: () => listEnvironments(nsSlug),
    staleTime: 60_000,
  });
  const envs = data?.environments ?? [];

  if (envs.length === 0) return null;

  return (
    <div className="ml-4 space-y-px">
      {envs.map((env) => (
        <Link
          key={env.id}
          href={`/${nsSlug}/${env.slug}`}
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 transition-colors"
        >
          <Layers className="size-3 shrink-0 text-white/25" />
          <span className="truncate">{env.name}</span>
        </Link>
      ))}
    </div>
  );
}

function SlideOverNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const isAdmin = useHasRole("admin");
  const router = useRouter();
  const [expandedNs, setExpandedNs] = useState<string | null>(null);

  const username =
    (auth.user?.profile?.preferred_username as string | undefined) ??
    (auth.user?.profile?.sub as string | undefined) ??
    "user";

  const nsQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
    staleTime: 60_000,
  });
  const namespaces = nsQuery.data?.namespaces ?? [];
  const personalNs = namespaces.find((ns) => ns.type === "user" && ns.slug === username);
  const orgNs = namespaces.filter((ns) => ns.id !== personalNs?.id);

  const authConfig = useContext(AuthConfigContext);

  async function handleSignOut() {
    onClose();
    if (authConfig?.auth_mode === "redirect") {
      broadcastSignout();
      auth.signoutRedirect();
    } else {
      const sid = auth.user?.profile?.sid as string | undefined;
      if (sid) {
        try { await revokeSession(sid); } catch { /* best-effort */ }
      }
      broadcastSignout();
      auth.removeUser();
      router.push("/auth/login");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-y-0 left-0 z-50 flex w-80 flex-col bg-[#0e0e0f] border-r border-white/[0.07] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
              <Link
                href="/dashboard"
                onClick={onClose}
                className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
              >
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 border border-primary/20">
                  <span className="text-[10px] font-black text-primary">K</span>
                </div>
                Kleff
              </Link>
              <button
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Nav content */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {/* Home */}
              <Link
                href="/dashboard"
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/85 transition-colors"
              >
                <Home className="size-4 text-white/35" />
                Dashboard
              </Link>

              {/* Personal namespace */}
              {personalNs && (
                <div className="pt-2">
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/25">
                    Personal
                  </p>
                  <button
                    onClick={() => setExpandedNs(expandedNs === personalNs.slug ? null : personalNs.slug)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/85 transition-colors"
                  >
                    <div className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-black text-primary leading-none">
                      {(personalNs.name[0] ?? "?").toUpperCase()}
                    </div>
                    <span className="flex-1 truncate text-left">{personalNs.name}</span>
                    <ChevronRight className={cn("size-3.5 text-white/25 transition-transform", expandedNs === personalNs.slug && "rotate-90")} />
                  </button>
                  {expandedNs === personalNs.slug && (
                    <NavEnvList nsSlug={personalNs.slug} onClose={onClose} />
                  )}
                </div>
              )}

              {/* Orgs */}
              {orgNs.length > 0 && (
                <div className="pt-2">
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/25">
                    Organizations
                  </p>
                  {orgNs.map((ns) => (
                    <div key={ns.id}>
                      <button
                        onClick={() => setExpandedNs(expandedNs === ns.slug ? null : ns.slug)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/85 transition-colors"
                      >
                        <div className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-black leading-none",
                          ns.user_role === "Owner" || ns.user_role === "Admin"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-amber-500/15 text-amber-400"
                        )}>
                          {(ns.name[0] ?? "?").toUpperCase()}
                        </div>
                        <span className="flex-1 truncate text-left">{ns.name}</span>
                        <ChevronRight className={cn("size-3.5 text-white/25 transition-transform", expandedNs === ns.slug && "rotate-90")} />
                      </button>
                      {expandedNs === ns.slug && (
                        <NavEnvList nsSlug={ns.slug} onClose={onClose} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {nsQuery.isLoading && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Loader2 className="size-3.5 animate-spin text-white/30" />
                  <span className="text-[12px] text-white/30">Loading…</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/[0.06] px-3 py-3 space-y-px">
              <Link
                href="/account/profile"
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/50 hover:bg-white/[0.05] hover:text-white/80 transition-colors"
              >
                <Settings className="size-3.5" />
                Account settings
              </Link>
              {isAdmin && (
                <Link
                  href="/admin-panel"
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/50 hover:bg-white/[0.05] hover:text-white/80 transition-colors"
                >
                  <ShieldCheck className="size-3.5" />
                  Admin panel
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────

export function AppTopBar() {
  const [navOpen, setNavOpen] = useState(false);
  const auth = useAuth();
  const isAdmin = useHasRole("admin");
  const router = useRouter();
  const authConfig = useContext(AuthConfigContext);
  const { data: unreadCount = 0 } = useUnreadCount();

  const user = auth.user;
  const displayName = user?.profile?.name ?? user?.profile?.email ?? "User";
  const initial = (displayName[0] ?? "U").toUpperCase();

  const { data: profileData } = useQuery({
    queryKey: ["users", "me"],
    queryFn: getMyProfile,
  });
  const avatarUrl = profileData?.data?.avatar_url;

  async function handleSignOut() {
    if (authConfig?.auth_mode === "redirect") {
      broadcastSignout();
      auth.signoutRedirect();
    } else {
      const sid = auth.user?.profile?.sid as string | undefined;
      if (sid) {
        try { await revokeSession(sid); } catch { /* best-effort */ }
      }
      broadcastSignout();
      auth.removeUser();
      router.push("/auth/login");
    }
  }

  return (
    <>
      <SlideOverNav open={navOpen} onClose={() => setNavOpen(false)} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-background/80 px-4 backdrop-blur-xl">
        {/* Hamburger */}
        <button
          onClick={() => setNavOpen(true)}
          className="flex size-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 border border-primary/20 shadow-[0_0_12px_oklch(0.80_0.17_90_/_0.2)]">
            <span className="text-[10px] font-black text-primary leading-none">K</span>
          </div>
          <span className="text-sm font-semibold text-white/70 hidden sm:block">Kleff</span>
        </Link>

        <div className="flex-1" />

        {/* Notifications */}
        <Link
          href="/account/notifications"
          className="relative flex size-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/[0.06] hover:text-white/65 transition-colors"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-[16px] h-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white leading-none border border-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/[0.05] transition-colors focus-visible:outline-none"
              aria-label="User menu"
            >
              <Avatar size="sm">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold ring-1 ring-primary/20">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/account/profile")}>
              <Settings className="size-4" />
              Account settings
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => router.push("/admin-panel")}>
                <ShieldCheck className="size-4" />
                Admin panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </>
  );
}
