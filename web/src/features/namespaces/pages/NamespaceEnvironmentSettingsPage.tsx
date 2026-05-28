"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEnvironment, updateEnvironment, deleteEnvironment } from "@/lib/api/namespaces";
import { isApiError } from "@/lib/api";
import { Loader2, ShieldAlert, Lock, AlertTriangle, Globe, Trash2 } from "lucide-react";
import { useNamespacePermissions } from "@/features/namespaces/hooks/useNamespacePermissions";
import { toast } from "sonner";
import { cn } from "@kleffio/ui";

export function NamespaceEnvironmentSettingsPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const envQuery = useQuery({
    queryKey: ["environment", slug, environment],
    queryFn: () => getEnvironment(slug, environment),
  });

  useNamespacePermissions(slug, envQuery.data?.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (envQuery.data) {
      setName(envQuery.data.name);
      setDescription(envQuery.data.description ?? "");
      setIsPrivate(envQuery.data.is_private ?? false);
    }
  }, [envQuery.data]);

  const updateMut = useMutation({
    mutationFn: () =>
      updateEnvironment(slug, environment, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["environment", slug, environment] });
      qc.invalidateQueries({ queryKey: ["environments", slug] });
      toast.success("Settings saved");
      if (data.slug !== environment) {
        router.replace(`/${slug}/${data.slug}/settings`);
      }
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteEnvironment(slug, environment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["environments", slug] });
      router.push(`/${slug}`);
    },
    onError: () => toast.error("Failed to delete environment"),
  });

  if (envQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (!envQuery.data) {
    const isForbidden = isApiError(envQuery.error) && envQuery.error.status === 403;
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        {isForbidden ? (
          <ShieldAlert className="size-10 text-white/20" />
        ) : (
          <Lock className="size-10 text-white/20" />
        )}
        <p className="text-sm text-white/40">
          {isForbidden ? "You don't have access to this environment." : "Environment not found."}
        </p>
      </div>
    );
  }

  const env = envQuery.data;
  const dirty =
    name.trim() !== env.name ||
    (description.trim() || undefined) !== (env.description || undefined) ||
    isPrivate !== (env.is_private ?? false);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-16 pt-6 space-y-6 animate-in fade-in duration-300">
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/5 blur-[100px]" />

      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Environment Settings</h1>
        <p className="mt-1 text-[13px] text-white/40">Manage configuration for {env.name}.</p>
      </div>

      {/* General */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-[12px] font-semibold text-white/60">General</p>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-white/50">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-white/50">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what lives here…"
              className="w-full px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 resize-none transition-colors"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => updateMut.mutate()}
              disabled={!dirty || !name.trim() || updateMut.isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {updateMut.isPending && <Loader2 className="size-3 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* Visibility */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-[12px] font-semibold text-white/60">Visibility</p>
        </div>
        <div className="px-5 py-5">
          <button
            type="button"
            onClick={() => setIsPrivate((p) => !p)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
              isPrivate
                ? "border-primary/25 bg-primary/[0.06]"
                : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
            )}
          >
            <div className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
              isPrivate ? "bg-primary/15 text-primary" : "bg-white/[0.05] text-white/40"
            )}>
              {isPrivate ? <Lock className="size-4" /> : <Globe className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white/80">
                {isPrivate ? "Private" : "Visible to namespace members"}
              </p>
              <p className="text-[12px] text-white/35 mt-0.5">
                {isPrivate
                  ? "Only explicitly invited members can see this environment."
                  : "All namespace members can discover this environment."}
              </p>
            </div>
            <div className={cn(
              "mt-0.5 size-4 shrink-0 rounded-full border-2 transition-all",
              isPrivate
                ? "border-primary bg-primary"
                : "border-white/[0.20] bg-transparent"
            )} />
          </button>
          {dirty && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => updateMut.mutate()}
                disabled={updateMut.isPending}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {updateMut.isPending && <Loader2 className="size-3 animate-spin" />}
                Save changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-500/10">
          <p className="text-[12px] font-semibold text-rose-400/80">Danger zone</p>
        </div>
        <div className="px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-white/70">Delete this environment</p>
              <p className="text-[12px] text-white/35 mt-0.5">
                Permanently deletes the environment and all workloads within it. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-[12px] font-semibold text-rose-400 hover:bg-rose-500/20 transition-all"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </div>

          {showDelete && (
            <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-rose-400 shrink-0" />
                <p className="text-[12px] font-semibold text-rose-400">
                  Type <span className="font-mono">{env.slug}</span> to confirm deletion
                </p>
              </div>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={env.slug}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-rose-500/20 text-[13px] text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                  className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white/40 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMut.mutate()}
                  disabled={deleteConfirm !== env.slug || deleteMut.isPending}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-rose-600 text-[12px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50 transition-all"
                >
                  {deleteMut.isPending && <Loader2 className="size-3 animate-spin" />}
                  Permanently delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
