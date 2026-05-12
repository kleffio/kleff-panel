"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, ExternalLink, Monitor, Smartphone, Trash2, LogOut } from "lucide-react";
import { changePassword, listSessions, revokeSession, revokeAllSessions } from "@/lib/api/plugins";
import { useAuth, clearStoredSession, broadcastSignout } from "@/features/auth";
import { PluginSlot } from "@/features/plugins/ui/PluginSlot";
import { PluginWrapper } from "@/features/plugins/ui/PluginWrapper";
import { useBackendPlugins } from "@/features/plugins/model/use-backend-plugins";
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
  Separator,
  Skeleton,
  Textarea,
  cn,
} from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";

import { getMyProfile, updateMyProfile, uploadAvatar } from "@/lib/api/profiles";
import type { ThemePreference, UpdateProfilePayload } from "@/types/user";
import { useViewMode } from "@/lib/hooks/useViewMode";

// ─── Query key ───────────────────────────────────────────────────────────────

const PROFILE_QUERY_KEY = ["users", "me"] as const;

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mode: viewMode, setViewMode } = useViewMode();

  // ── Fetch profile ────────────────────────────────────────────────────────
  // On first call the backend lazily creates the profile for this Kratos
  // identity, so this query is always safe to fire.
  const { data, isLoading, isError } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getMyProfile,
  });

  const profile = data?.data;

  // ── Local form state (controlled by server data once loaded) ─────────────
  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");

  // Sync form state from server data when it first arrives.
  // Using a ref-based initialised guard avoids resetting mid-edit on refetch.
  const initialisedRef = useRef(false);
  if (profile && !initialisedRef.current) {
    setBio(profile.bio ?? "");
    setTheme(profile.theme_preference);
    initialisedRef.current = true;
  }

  // ── Update profile mutation ───────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
    onSuccess: (res) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, res);
      toast.success("Profile saved.");
    },
    onError: () => {
      toast.error("Could not save profile. Please try again.");
    },
  });

  // ── Avatar upload mutation ────────────────────────────────────────────────
  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (res) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, res);
      toast.success("Avatar updated.");
    },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? (err instanceof Error ? err.message : null);
      toast.error(msg ? `Upload failed: ${msg}` : "Could not upload avatar. Max size is 5 MiB.");
    },
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) avatarMutation.mutate(file);
    // Reset input so the same file can be re-selected after an error.
    e.target.value = "";
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ bio, theme_preference: theme });
  }

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile) {
    // Backend profile API is unimplemented — silently hide the extra profile
    // fields (avatar, bio, theme) until the platform supports them.
    return null;
  }

  // Derive initials for the avatar fallback.
  const initials = (profile.username ?? profile.id)
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your avatar, bio, and appearance preferences.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          {/* ── Avatar ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="size-16">
              <AvatarImage src={profile.avatar_url} alt="Your avatar" />
              <AvatarFallback>
                {avatarMutation.isPending ? (
                  <Spinner size="sm" />
                ) : (
                  initials
                )}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              {/* Hidden file input — triggered by the visible button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
                aria-label="Upload avatar"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 size-3.5" />
                {avatarMutation.isPending ? "Uploading…" : "Upload photo"}
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP · max 5 MiB
              </p>
            </div>
          </div>

          {/* ── Username (read-only display) ────────────────────────────── */}
          {profile.username && (
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={profile.username}
                disabled
                className="max-w-sm"
              />
            </div>
          )}

          {/* ── Bio ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="Tell us a little about yourself…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="max-w-lg resize-none"
            />
          </div>

          {/* ── Theme ───────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="theme">Appearance</Label>
            <Select
              value={theme}
              onValueChange={(v) => setTheme(v as ThemePreference)}
            >
              <SelectTrigger id="theme" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls the panel colour scheme for your account only.
            </p>
          </div>

          {/* ── View mode ───────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Interface</Label>
            <div className="flex gap-2">
              {(["simplified", "advanced"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    viewMode === m
                      ? "border-primary bg-primary/[0.1] text-primary"
                      : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Simplified hides projects and shows just your servers. Advanced gives full control.
            </p>
          </div>

          {/* ── Submit ──────────────────────────────────────────────────── */}
          <Button
            type="submit"
            size="sm"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Spinner size="xs" className="mr-1.5" />}
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Sessions section ─────────────────────────────────────────────────────────

function parseUA(ua?: string): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Unknown device", isMobile: false };

  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);

  // OS detection
  let os = "";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser detection
  let browser = "";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  const label = [browser, os].filter(Boolean).join(" on ") || ua.slice(0, 60);
  return { label, isMobile };
}

function formatTime(unix?: number) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SessionsSection({ sectionId, canRevoke }: { sectionId: string; canRevoke: boolean }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  // Use the "sid" claim from the ID token — this is the session ID both Keycloak
  // and Authentik embed in their JWTs. session_state is a browser-level OIDC hash
  // (used for check_session_iframe) and does not reliably match the session ID.
  const sid = (auth.user?.profile?.sid as string | undefined) ?? auth.user?.session_state ?? undefined;

  const SESSIONS_KEY = ["sessions", sectionId] as const;

  const { data, isLoading } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => listSessions(sid),
    refetchInterval: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionID: string) => revokeSession(sessionID),
    onSuccess: async () => {
      try {
        const fresh = await listSessions(sid);
        const now = Math.floor(Date.now() / 1000);
        const remaining = (fresh?.sessions ?? []).filter(
          (s) => s.current || !s.expires_at || s.expires_at > now,
        );
        if (remaining.length === 0) {
          clearStoredSession();
          broadcastSignout();
          window.location.href = "/auth/login";
          return;
        }
        queryClient.setQueryData(SESSIONS_KEY, fresh);
        toast.success("Session revoked.");
      } catch {
        queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
        toast.success("Session revoked.");
      }
    },
    onError: () => {
      toast.error("Could not revoke session.");
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeAllSessions(sid),
    onSuccess: async () => {
      try {
        const fresh = await listSessions(sid);
        const now = Math.floor(Date.now() / 1000);
        const remaining = (fresh?.sessions ?? []).filter(
          (s) => s.current || !s.expires_at || s.expires_at > now,
        );
        if (remaining.length === 0) {
          clearStoredSession();
          broadcastSignout();
          window.location.href = "/auth/login";
          return;
        }
        queryClient.setQueryData(SESSIONS_KEY, fresh);
        toast.success("All other sessions signed out.");
      } catch {
        queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
        toast.success("All other sessions signed out.");
      }
    },
    onError: () => {
      toast.error("Could not sign out other sessions.");
    },
  });

  const signOutSelfMutation = useMutation({
    mutationFn: (sessionID: string) => revokeSession(sessionID),
    onSuccess: () => {
      clearStoredSession();
      broadcastSignout();
      window.location.href = "/auth/login";
    },
    onError: () => {
      toast.error("Could not sign out.");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="size-8 rounded-md shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const sessions = (data?.sessions ?? []).filter(
    (s) => s.current || !s.expires_at || s.expires_at > now,
  );
  const otherSessions = sessions.filter((s) => !s.current);

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No active sessions found.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Revoke-all button — only shown when there are other sessions to sign out */}
      {canRevoke && otherSessions.length > 0 && (
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {otherSessions.length === 1
              ? "1 other active session"
              : `${otherSessions.length} other active sessions`}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            disabled={revokeAllMutation.isPending || revokeMutation.isPending}
            onClick={() => revokeAllMutation.mutate()}
          >
            {revokeAllMutation.isPending ? (
              <Spinner size="xs" className="mr-1.5" />
            ) : (
              <LogOut className="mr-1.5 size-3.5" />
            )}
            Sign out all other devices
          </Button>
        </div>
      )}

      {/* Session list */}
      {sessions.map((session) => {
        const { label, isMobile } = parseUA(session.user_agent);
        const DeviceIcon = isMobile ? Smartphone : Monitor;
        return (
          <div key={session.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <DeviceIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{label}</span>
                  {session.current && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      This device
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {session.ip_address && `${session.ip_address} · `}
                  {session.last_access
                    ? `Last active ${formatTime(session.last_access)}`
                    : `Started ${formatTime(session.started_at)}`}
                  {session.expires_at && ` · Expires ${formatTime(session.expires_at)}`}
                </p>
              </div>
            </div>
            {canRevoke && !session.current && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={revokeMutation.isPending || revokeAllMutation.isPending || signOutSelfMutation.isPending}
                onClick={() => revokeMutation.mutate(session.id)}
              >
                {revokeMutation.isPending ? (
                  <Spinner size="xs" />
                ) : (
                  <>
                    <Trash2 className="mr-1.5 size-3.5" />
                    Sign out
                  </>
                )}
              </Button>
            )}
            {canRevoke && session.current && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={signOutSelfMutation.isPending || revokeMutation.isPending || revokeAllMutation.isPending}
                onClick={() => signOutSelfMutation.mutate(session.id)}
              >
                {signOutSelfMutation.isPending ? (
                  <Spinner size="xs" />
                ) : (
                  <>
                    <LogOut className="mr-1.5 size-3.5" />
                    Sign out
                  </>
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Change password form ─────────────────────────────────────────────────────

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      toast.success("Password changed.");
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not change password.";
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast.error("New passwords do not match."); return; }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="max-w-sm" autoComplete="current-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} className="max-w-sm" autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-sm" autoComplete="new-password" />
      </div>
      <Button type="submit" size="sm" disabled={mutation.isPending || !current || !next || !confirm}>
        {mutation.isPending && <Spinner size="xs" className="mr-1.5" />}
        {mutation.isPending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function SettingsView() {
  const { profileSections } = useBackendPlugins();
  return (
    <div className="space-y-6">
      <PluginSlot name="settings.top" />

      <PluginWrapper name="settings.header">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account and organization settings.
          </p>
        </div>
      </PluginWrapper>

      {/* Profile — connects to GET/PATCH /api/v1/users/me */}
      <PluginWrapper name="settings.profile">
        <ProfileCard />
      </PluginWrapper>

      {/* Organization */}
      <PluginWrapper name="settings.org">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Settings that apply to your entire organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" placeholder="Acme Corp" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-slug">Slug</Label>
                <Input id="org-slug" placeholder="acme-corp" />
              </div>
            </div>
            <Button size="sm">Save</Button>
          </CardContent>
        </Card>
      </PluginWrapper>

      {/* Frontend plugin sections */}
      <PluginSlot name="settings.section" />

      {/* Backend plugin profile sections (from active IDP — password, 2FA, sessions) */}
      {profileSections.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Security</h2>
            <p className="text-sm text-muted-foreground">
              Manage passwords, two-factor authentication, and active sessions via your identity provider.
            </p>
          </div>
          {profileSections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{section.label}</CardTitle>
                  {section.description && (
                    <CardDescription>{section.description}</CardDescription>
                  )}
                </div>
                {section.iframe_url && !section.actions?.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    asChild
                  >
                    <a href={section.iframe_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 size-3.5" />
                      Open
                    </a>
                  </Button>
                )}
              </CardHeader>
              {(section.actions?.includes("change_password") || section.actions?.includes("list_sessions")) && (
                <CardContent className="space-y-6">
                  {section.actions?.includes("change_password") && (
                    <>
                      <div>
                        <h3 className="text-sm font-medium mb-3">Change Password</h3>
                        <ChangePasswordForm />
                      </div>
                    </>
                  )}
                  {section.actions?.includes("change_password") && section.actions?.includes("list_sessions") && (
                    <Separator />
                  )}
                  {section.actions?.includes("list_sessions") && (
                    <div>
                      <h3 className="text-sm font-medium mb-3">Active Sessions</h3>
                      <SessionsSection
                        sectionId={section.id}
                        canRevoke={!!section.actions?.includes("revoke_session")}
                      />
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Plugin bottom */}
      <PluginSlot name="settings.bottom" />

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions — proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Organization</p>
              <p className="text-xs text-muted-foreground">
                Permanently deletes all servers and data. This cannot be undone.
              </p>
            </div>
            <Button variant="destructive" size="sm">Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
