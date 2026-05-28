"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Trash2, Globe, Lock, ArrowRight, Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
  cn,
} from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";
import { getMyProfile, updateMyProfile, uploadAvatar } from "@/lib/api/profiles";
import { listEnvironments } from "@/lib/api/namespaces";
import type { ThemePreference, UIMode, UpdateProfilePayload } from "@/types/user";
import { useUserUIMode } from "@/lib/hooks/useUserUIMode";

const PROFILE_KEY = ["users", "me"] as const;

export function AccountProfilePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getMyProfile,
  });
  const profile = data?.data;

  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const uiMode = useUserUIMode();
  const initialisedRef = useRef(false);
  if (profile && !initialisedRef.current) {
    setBio(profile.bio ?? "");
    setTheme(profile.theme_preference);
    initialisedRef.current = true;
  }

  const updateModeMut = useMutation({
    mutationFn: (mode: UIMode) => updateMyProfile({ ui_mode: mode }),
    onSuccess: (res) => { queryClient.setQueryData(PROFILE_KEY, res); },
    onError: () => toast.error("Could not update interface mode."),
  });

  const envsQuery = useQuery({
    queryKey: ["environments", profile?.username],
    queryFn: () => listEnvironments(profile!.username!),
    enabled: !!profile?.username,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
    onSuccess: (res) => { queryClient.setQueryData(PROFILE_KEY, res); toast.success("Profile saved."); },
    onError: () => toast.error("Could not save profile."),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (res) => { queryClient.setQueryData(PROFILE_KEY, res); toast.success("Avatar updated."); },
    onError: (err: unknown) => {
      const msg = (err as { data?: { error?: string } })?.data?.error ?? (err instanceof Error ? err.message : null);
      toast.error(msg ? `Upload failed: ${msg}` : "Could not upload avatar. Max size is 5 MiB.");
    },
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  const envs = envsQuery.data?.environments ?? [];

  return (
    <div className="animate-in fade-in duration-300 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">

        {/* ── Left: profile card ── */}
        <div className="space-y-4">
          {/* Avatar */}
          <div className="relative w-fit">
            <div className="size-[72px] rounded-2xl border border-white/[0.10] bg-white/[0.04] overflow-hidden shadow-lg">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your avatar" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-xl font-black text-primary">
                  {avatarMutation.isPending ? <Loader2 className="size-5 animate-spin text-white/30" /> : initials}
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} aria-label="Upload avatar" />
            <button
              type="button"
              disabled={avatarMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 flex size-7 items-center justify-center rounded-lg border border-white/[0.10] bg-[#0e0e0e] text-white/40 hover:text-white/70 hover:border-white/20 transition-all shadow-md"
            >
              <Upload className="size-3" />
            </button>
          </div>

          {/* Name + username */}
          <div>
            <p className="text-[15px] font-semibold text-white leading-tight">{displayName}</p>
            {profile?.username && (
              <p className="text-[12px] text-white/35 mt-0.5">@{profile.username}</p>
            )}
          </div>

          {/* Bio display */}
          {profile?.bio && (
            <p className="text-[12px] text-white/50 leading-relaxed">{profile.bio}</p>
          )}

          <Separator className="bg-white/[0.06]" />

          {/* Edit form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Bio</Label>
              <Textarea
                rows={3}
                placeholder="Tell us a little about yourself…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="resize-none bg-white/[0.03] border-white/[0.07] text-white placeholder:text-white/[0.18] text-[12px]"
              />
            </div>

            {profile?.username && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Username</Label>
                <Input value={profile.username} disabled className="bg-white/[0.03] border-white/[0.07] text-white/40 h-9 text-[12px]" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Appearance</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
                <SelectTrigger className="bg-white/[0.03] border-white/[0.07] text-white/70 h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Interface Mode</Label>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                <div>
                  <p className="text-[12px] text-white/70 font-medium">{uiMode === "advanced" ? "Advanced" : "Simple"}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {uiMode === "advanced" ? "Canvas, variables, deployments & monitoring" : "Basic server management"}
                  </p>
                </div>
                <Switch
                  checked={uiMode === "advanced"}
                  onCheckedChange={(checked) => updateModeMut.mutate(checked ? "advanced" : "simple")}
                  disabled={updateModeMut.isPending}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full h-9 bg-primary text-black font-semibold text-[12px] hover:opacity-90 disabled:opacity-40"
            >
              {updateMutation.isPending && <Spinner size="xs" className="mr-1.5" />}
              {updateMutation.isPending ? "Saving…" : "Save profile"}
            </Button>
          </form>

          <Separator className="bg-white/[0.06]" />

          {/* Danger zone */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-400/50">Danger Zone</p>
            <div className="rounded-xl border border-rose-500/[0.12] bg-rose-500/[0.04] p-3 space-y-2">
              <p className="text-[11px] text-white/40">Permanently deletes your account and all associated data.</p>
              <Button variant="destructive" size="sm" className="h-7 text-[11px]">
                <Trash2 className="mr-1.5 size-3" />
                Delete account
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right: environments ── */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Your Environments</h2>
              {envs.length > 0 && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/30">
                  {envs.length}
                </span>
              )}
            </div>
            {profile?.username && (
              <Link
                href={`/${profile.username}/new`}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary/[0.08] border border-primary/[0.15] text-[11px] font-semibold text-primary/70 hover:text-primary hover:bg-primary/[0.14] transition-all"
              >
                <Plus className="size-3" />
                New environment
              </Link>
            )}
          </div>

          {envsQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-white/25" />
            </div>
          ) : envs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.07] p-12 flex flex-col items-center gap-3 text-center">
              <p className="text-[13px] text-white/30">No environments yet.</p>
              {profile?.username && (
                <Link
                  href={`/${profile.username}/new`}
                  className="text-[11px] text-primary/60 hover:text-primary transition-colors"
                >
                  Create your first environment →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {envs.map((env) => (
                <Link
                  key={env.id}
                  href={`/${profile?.username}/${env.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] hover:border-white/[0.11] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03]">
                      {env.is_private
                        ? <Lock className="size-3 text-white/25" />
                        : <Globe className="size-3 text-white/25" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white/75 group-hover:text-white/90 transition-colors truncate">{env.name}</p>
                      {env.description && (
                        <p className="text-[11px] text-white/30 truncate mt-0.5">{env.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                      env.is_private
                        ? "border-white/[0.07] text-white/30"
                        : "border-emerald-500/20 text-emerald-400/60"
                    )}>
                      {env.is_private ? "Private" : "Public"}
                    </span>
                    <ArrowRight className="size-3.5 text-white/15 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
