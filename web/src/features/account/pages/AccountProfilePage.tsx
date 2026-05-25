"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  Monitor,
  Smartphone,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { useAuth, clearStoredSession, broadcastSignout } from "@/features/auth";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { useBackendPlugins } from "@/features/plugins/model/use-backend-plugins";
import {
  changePassword,
  listSessions,
  revokeAllSessions,
  revokeSession,
} from "@/lib/api/plugins";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";
import { getMyProfile, updateMyProfile, uploadAvatar } from "@/lib/api/profiles";
import type { ThemePreference, UpdateProfilePayload } from "@/types/user";

const PROFILE_KEY = ["users", "me"] as const;

function ProfileSkeleton() {
  return (
    <Card
      data-frosted="true"
      data-focus="false"
      data-spotlight="false"
      className="overview-glass-card gap-0 py-0 overflow-hidden"
    >
      <CardHeader className="pt-6 pb-4 border-b border-white/[0.04]">
        <Skeleton className="h-5 w-40 bg-white/5" />
        <Skeleton className="h-4 w-64 bg-white/5" />
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full bg-white/5" />
          <Skeleton className="h-8 w-32 bg-white/5" />
        </div>
        <Skeleton className="h-8 w-full max-w-sm bg-white/5" />
        <Skeleton className="h-20 w-full max-w-lg bg-white/5" />
        <Skeleton className="h-8 w-24 bg-white/5" />
      </CardContent>
    </Card>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      toast.success("Password changed.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not change password.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="max-w-sm"
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="max-w-sm"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="max-w-sm"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" size="sm" disabled={mutation.isPending || !current || !next || !confirm}>
        {mutation.isPending && <Spinner size="xs" className="mr-1.5" />}
        {mutation.isPending ? "Saving..." : "Change password"}
      </Button>
    </form>
  );
}

function parseUA(ua?: string): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Unknown device", isMobile: false };
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  let os = "";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return { label: [browser, os].filter(Boolean).join(" on ") || ua.slice(0, 60), isMobile };
}

function formatTime(unix?: number) {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Copyable({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`group/copy inline-flex items-center gap-1.5 cursor-pointer max-w-full ${className || ""}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      }}
      title="Copy to clipboard"
    >
      <div className="truncate">{children}</div>
      <Copy className="size-3 text-white/0 group-hover/copy:text-white/40 transition-colors shrink-0" />
    </div>
  );
}

function SessionsList({ sectionId, canRevoke }: { sectionId: string; canRevoke: boolean }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<"date" | "ip" | "device">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showSortIndicator, setShowSortIndicator] = useState(false);
  const sid = (auth.user?.profile?.sid as string | undefined) ?? auth.user?.session_state ?? undefined;
  const SESSIONS_KEY = ["sessions", sectionId] as const;

  const { data, isLoading } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => listSessions(sid),
    refetchInterval: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }); toast.success("Session revoked."); },
    onError: () => toast.error("Could not revoke session."),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeAllSessions(sid),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }); toast.success("All other sessions signed out."); },
    onError: () => toast.error("Could not sign out other sessions."),
  });

  const signOutSelfMutation = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => { clearStoredSession(); broadcastSignout(); window.location.href = "/auth/login"; },
    onError: () => toast.error("Could not sign out."),
  });

  if (isLoading) return (
    <div className="divide-y divide-white/[0.04]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <Skeleton className="size-10 rounded-lg shrink-0 bg-white/5" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-40 bg-white/5" />
            <Skeleton className="h-3 w-56 bg-white/5" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0 bg-white/5" />
        </div>
      ))}
    </div>
  );

  const now = Math.floor(Date.now() / 1000);
  let sessions = (data?.sessions ?? []).filter(
    (s) => s.current || !s.expires_at || s.expires_at > now,
  );

  sessions.sort((a, b) => {
    if (sortBy === "device") {
      const aLabel = parseUA(a.user_agent).label;
      const bLabel = parseUA(b.user_agent).label;
      return sortOrder === "asc" ? aLabel.localeCompare(bLabel) : bLabel.localeCompare(aLabel);
    } else if (sortBy === "date") {
      const aDate = a.last_access || a.started_at || 0;
      const bDate = b.last_access || b.started_at || 0;
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    } else {
      const aIp = a.ip_address || "";
      const bIp = b.ip_address || "";
      return sortOrder === "asc" ? aIp.localeCompare(bIp) : bIp.localeCompare(aIp);
    }
  });

  const otherSessions = sessions.filter((s) => !s.current);

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <Monitor className="size-10 text-white/[0.15] mb-4" />
      <h3 className="text-sm font-medium text-white/90">No active sessions</h3>
      <p className="mt-1 text-xs text-white/50">You have no active sessions at the moment.</p>
    </div>
  );

  return (
    <div className="flex flex-col relative z-10 overflow-x-auto">
      <div className="min-w-[760px]">
        {canRevoke && otherSessions.length > 0 && (
          <div className="flex items-center px-6 py-3 border-b border-white/[0.04] bg-primary/[0.02]">
            <div className="w-12 shrink-0"></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary/80">
                {otherSessions.length === 1 ? "1 other active session" : `${otherSessions.length} other active sessions`}
              </p>
            </div>
            <div className="w-40 shrink-0"></div>
            <div className="w-64 shrink-0 flex justify-end">
              <Button
                variant="ghost" size="sm"
                className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={revokeAllMutation.isPending || revokeMutation.isPending}
                onClick={() => revokeAllMutation.mutate()}
              >
                {revokeAllMutation.isPending ? <Spinner size="xs" className="mr-1.5" /> : <LogOut className="mr-1.5 size-3.5" />}
                Sign out all others
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.04] bg-white/[0.01]">
          <div className="w-12 shrink-0">#</div>
          <div
            className="flex-1 min-w-0 cursor-pointer hover:text-white/60 flex items-center gap-1 transition-colors select-none"
            onClick={() => {
              setShowSortIndicator(true);
              if (sortBy === "device") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              else { setSortBy("device"); setSortOrder("asc"); }
            }}
          >
            Title / Device
            {showSortIndicator && sortBy === "device" && <ChevronDown className={`size-3 text-primary transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`} />}
          </div>
          <div
            className="w-40 shrink-0 cursor-pointer hover:text-white/60 flex items-center gap-1 transition-colors select-none"
            onClick={() => {
              setShowSortIndicator(true);
              if (sortBy === "ip") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              else { setSortBy("ip"); setSortOrder("desc"); }
            }}
          >
            IP Address
            {showSortIndicator && sortBy === "ip" && <ChevronDown className={`size-3 text-primary transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`} />}
          </div>
          <div className="w-64 shrink-0 flex items-center justify-between gap-1 select-none">
            <div
              className="cursor-pointer hover:text-white/60 flex items-center gap-1 transition-colors"
              onClick={() => {
                setShowSortIndicator(true);
                if (sortBy === "date") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                else { setSortBy("date"); setSortOrder("desc"); }
              }}
            >
              Date active
              {showSortIndicator && sortBy === "date" && <ChevronDown className={`size-3 text-primary transition-transform ${sortOrder === "asc" ? "rotate-180" : ""}`} />}
            </div>
          </div>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {sessions.map((session, index) => {
            const { label, isMobile } = parseUA(session.user_agent);
            const DeviceIcon = isMobile ? Smartphone : Monitor;
            return (
              <div key={session.id} className="flex items-center px-6 py-3 transition-colors hover:bg-white/[0.04] group">
                <div className="w-12 shrink-0 flex items-center">
                  {session.current ? (
                    <User className="size-4 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                  ) : (
                    <span className="text-sm font-medium text-white/30 group-hover:text-white/50 transition-colors">
                      {index + 1}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded border border-white/5 bg-white/5 text-white/40 group-hover:text-white/70 transition-colors">
                    <DeviceIcon className="size-4" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Copyable text={label}>
                      <span className="text-sm font-medium text-white/90">{label}</span>
                    </Copyable>
                    {session.current && (
                      <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-primary uppercase shadow-[0_0_12px_rgba(var(--primary),0.15)]">Current</span>
                    )}
                  </div>
                </div>
                <div className="w-40 shrink-0 text-sm text-white/50 flex items-center min-w-0 pr-4">
                  {session.ip_address ? (
                    <Copyable text={session.ip_address}>
                      {session.ip_address}
                    </Copyable>
                  ) : (
                    "-"
                  )}
                </div>
                <div className="w-64 shrink-0 flex items-center justify-between">
                  <div className="flex flex-col justify-center text-sm text-white/50 min-w-0 pr-2">
                    <Copyable text={session.last_access ? formatTime(session.last_access) : formatTime(session.started_at)}>
                      <span>{session.last_access ? formatTime(session.last_access) : formatTime(session.started_at)}</span>
                    </Copyable>
                    {session.expires_at && <span className="text-[10px] text-white/30 truncate">Exp: {formatTime(session.expires_at)}</span>}
                  </div>
                  <div className="shrink-0 flex justify-end">
                    {canRevoke && !session.current && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/30 hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        disabled={revokeMutation.isPending || revokeAllMutation.isPending || signOutSelfMutation.isPending}
                        onClick={() => revokeMutation.mutate(session.id)}
                        title="Sign out"
                      >
                        {revokeMutation.isPending ? <Spinner size="xs" /> : <Trash2 className="size-4" />}
                      </Button>
                    )}
                    {canRevoke && session.current && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/30 hover:bg-white/10 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                        disabled={signOutSelfMutation.isPending || revokeMutation.isPending || revokeAllMutation.isPending}
                        onClick={() => signOutSelfMutation.mutate(session.id)}
                        title="Sign out this device"
                      >
                        {signOutSelfMutation.isPending ? <Spinner size="xs" /> : <LogOut className="size-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      data-frosted="true"
      data-focus="false"
      data-spotlight="false"
      className={`overview-glass-card gap-0 py-0 overflow-hidden ${className}`}
    >
      {children}
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/38">
      <span className="h-px w-6 bg-white/12" />
      {children}
    </div>
  );
}

export function AccountProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mode: viewMode, setViewMode } = useViewMode();
  const { profileSections } = useBackendPlugins();

  const { data, isLoading } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getMyProfile,
  });
  const profile = data?.data;

  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const initialisedRef = useRef(false);
  if (profile && !initialisedRef.current) {
    setBio(profile.bio ?? "");
    setTheme(profile.theme_preference);
    initialisedRef.current = true;
  }

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
    onSuccess: (res) => { queryClient.setQueryData(PROFILE_KEY, res); toast.success("Profile saved."); },
    onError: () => toast.error("Could not save profile."),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (res) => { queryClient.setQueryData(PROFILE_KEY, res); toast.success("Avatar updated."); },
    onError: () => toast.error("Could not upload avatar. Max size is 5 MiB."),
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) avatarMutation.mutate(file);
    e.target.value = "";
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ bio, theme_preference: theme });
  }

  const displayName = auth.user?.profile?.name ?? auth.user?.profile?.preferred_username ?? "User";
  const initials = (profile?.username ?? displayName).slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;
  const securitySections = profileSections.filter(
    (s) => s.actions?.includes("change_password")
  );
  const sessionSections = profileSections.filter((s) => s.actions?.includes("list_sessions"));

  return (
    <div className="relative mx-auto w-full max-w-7xl space-y-8 animate-in fade-in duration-500 z-0 px-4 sm:px-6 lg:px-8 pb-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-kleff-grid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,#000_40%,transparent_100%)] opacity-30" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-80 -z-10 h-[24rem] w-[24rem] rounded-full bg-blue-500/5 blur-[100px]" />
      <div className="pointer-events-none absolute -left-20 top-[30rem] -z-10 h-[24rem] w-[24rem] rounded-full bg-purple-500/5 blur-[100px]" />

      <div className="px-2 pt-4 relative z-10">
        <div className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Account</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white capitalize drop-shadow-sm">Profile</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="flex h-full flex-col space-y-4">
          <SectionLabel>Identity</SectionLabel>
          {isLoading ? (
            <ProfileSkeleton />
          ) : (
            <GlassCard className="h-full min-h-[420px]">
              <CardContent className="grid h-full gap-8 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex flex-col items-stretch gap-5 border-b border-white/[0.06] pb-6 md:border-b-0 md:border-r md:pb-0 md:pr-6">
                  <div className="self-start">
                    <p className="text-sm font-medium text-white/90">Profile Picture</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/40">
                      Shown across your account.
                    </p>
                  </div>

                  <div className="relative self-center">
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/14 blur-2xl" />
                    <Avatar className="relative size-28 border border-white/10 bg-white/[0.04] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                      <AvatarImage src={avatarUrl} alt="Current avatar" />
                      <AvatarFallback className="text-2xl font-semibold text-white/80">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} aria-label="Upload avatar" />
                  <div className="w-full space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={avatarMutation.isPending}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full justify-center border-white/10 bg-white/[0.035] text-white/80 hover:bg-white/[0.06] hover:text-white"
                    >
                      {avatarMutation.isPending ? <Spinner size="xs" className="mr-1.5" /> : <Upload className="mr-1.5 size-3.5" />}
                      {avatarMutation.isPending ? "Uploading..." : "Upload image"}
                    </Button>
                    <p className="text-[11px] leading-relaxed text-white/35">
                      JPG, PNG, or WebP. Max 5 MiB.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSave} className="flex min-w-0 flex-col justify-between gap-5">
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-medium text-white/90">Profile Customization</p>
                      <p className="mt-1 text-sm text-white/45">Edit the profile fields currently supported by the platform.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea id="bio" rows={5} placeholder="Tell us a little about yourself..." value={bio} onChange={(e) => setBio(e.target.value)} className="resize-none" />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="theme">Appearance</Label>
                      <Select value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
                        <SelectTrigger id="theme" className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">System</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
                    <p className="text-xs text-white/35">Saves bio and appearance only. Avatar uploads separately.</p>
                    <Button type="submit" size="sm" disabled={updateMutation.isPending} className="shrink-0">
                      {updateMutation.isPending && <Spinner size="xs" className="mr-1.5" />}
                      {updateMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </GlassCard>
          )}
        </div>

        <div className="flex h-full flex-col space-y-4">
          <SectionLabel>Security</SectionLabel>
          <div className="flex flex-1 flex-col gap-4">
            {securitySections.length > 0 ? (
              securitySections.map((section) => (
                <GlassCard key={section.id} className="h-full">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5 pb-4 border-b border-white/[0.04]">
                    <div>
                      <CardTitle className="text-base font-semibold text-white/90">{section.title}</CardTitle>
                      {section.description && <CardDescription className="text-sm text-white/50 mt-1">{section.description}</CardDescription>}
                    </div>
                    {section.iframe_url && !section.actions?.length && (
                      <Button variant="outline" size="sm" className="shrink-0" asChild>
                        <a href={section.iframe_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 size-3.5" />
                          Open
                        </a>
                      </Button>
                    )}
                  </CardHeader>
                  {section.actions?.includes("change_password") && (
                    <CardContent className="p-5">
                      <ChangePasswordForm />
                    </CardContent>
                  )}
                </GlassCard>
              ))
            ) : (
              <GlassCard className="h-full">
                <CardHeader className="pt-5 pb-4 border-b border-white/[0.04]">
                  <CardTitle className="text-base font-semibold text-white/90">Change Password</CardTitle>
                  <CardDescription className="text-sm text-white/50 mt-1">Update your account password.</CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                  <ChangePasswordForm />
                </CardContent>
              </GlassCard>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <SectionLabel>Sessions</SectionLabel>
        {sessionSections.length > 0 ? (
          sessionSections.map((section) => (
            <GlassCard key={section.id}>
              <CardHeader className="pt-6 pb-4 border-b border-white/[0.04]">
                <CardTitle className="text-lg font-semibold text-white/90">{section.title}</CardTitle>
                {section.description && <CardDescription className="text-sm text-white/50 mt-1">{section.description}</CardDescription>}
              </CardHeader>
              <CardContent className="p-0">
                <SessionsList sectionId={section.id} canRevoke={!!section.actions?.includes("revoke_session")} />
              </CardContent>
            </GlassCard>
          ))
        ) : (
          <GlassCard>
            <CardHeader className="pt-6 pb-4 border-b border-white/[0.04]">
              <CardTitle className="text-lg font-semibold text-white/90">Active Sessions</CardTitle>
              <CardDescription className="text-sm text-white/50 mt-1">Devices currently signed in to your account.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SessionsList sectionId="default" canRevoke={true} />
            </CardContent>
          </GlassCard>
        )}
      </div>

      <div className="space-y-4">
        <SectionLabel>Interface</SectionLabel>
        <GlassCard>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white/90">View mode</p>
                <p className="mt-1 text-xs text-white/50">Simplified shows just your servers. Advanced gives full project and canvas access.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {(["simplified", "advanced"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setViewMode(m)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      viewMode === m
                        ? "border-primary bg-primary/[0.1] text-primary"
                        : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.06]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <div className="space-y-4">
        <SectionLabel>Account removal</SectionLabel>
        <GlassCard className="border-destructive/30">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white/90">Delete Account</p>
                <p className="mt-1 text-xs text-white/50">Permanently deletes your account and all associated data. This cannot be undone.</p>
              </div>
              <Button variant="destructive" size="sm" className="shrink-0">
                <Trash2 className="mr-1.5 size-3.5" />
                Delete
              </Button>
            </div>
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
