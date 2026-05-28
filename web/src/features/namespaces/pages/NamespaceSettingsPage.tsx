"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { Loader2, AlertTriangle, Trash2, Camera } from "lucide-react";
import { getNamespace, updateNamespace, deleteNamespace, uploadNamespaceAvatar } from "@/lib/api/namespaces";

export function NamespaceSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const nsQuery = useQuery({
    queryKey: ["namespace", slug],
    queryFn: () => getNamespace(slug),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nsQuery.data) {
      setName(nsQuery.data.name);
      setDescription(nsQuery.data.description ?? "");
    }
  }, [nsQuery.data]);

  const avatarMut = useMutation({
    mutationFn: (file: File) => uploadNamespaceAvatar(slug, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["namespace", slug] });
      qc.invalidateQueries({ queryKey: ["namespaces"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateNamespace(slug, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["namespace", slug] });
      qc.invalidateQueries({ queryKey: ["namespaces"] });
      if (data.slug !== slug) router.replace(`/${data.slug}/settings`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteNamespace(slug),
    onSuccess: () => router.push("/account"),
  });

  if (nsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  const ns = nsQuery.data;
  if (!ns) return null;

  const dirty = name.trim() !== ns.name || description.trim() !== (ns.description ?? "");

  return (
    <div className="relative mx-auto max-w-2xl space-y-8 animate-in fade-in duration-300 px-4 sm:px-6 lg:px-8 pb-16 pt-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/6 blur-[100px]" />

      {/* Header */}
      <div>
        <Link href={`/${slug}`} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-white tracking-tight mt-1">Settings</h1>
      </div>

      {/* Avatar */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-[12px] font-semibold text-white/60">Avatar</p>
        </div>
        <div className="px-5 py-5 flex items-center gap-5">
          <div className="relative group shrink-0">
            <div className="size-16 rounded-xl overflow-hidden bg-primary/15 flex items-center justify-center">
              {ns.avatar_url ? (
                <Image
                  src={ns.avatar_url}
                  alt={ns.name}
                  width={64}
                  height={64}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-2xl font-black text-primary leading-none">
                  {(ns.name[0] ?? "?").toUpperCase()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="size-5 text-white" />
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] text-white/70">Upload an image to represent this namespace.</p>
            <p className="text-[11px] text-white/30">JPG, PNG, GIF or WebP · Max 5 MB</p>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMut.isPending}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-white/[0.1] bg-white/[0.04] text-[12px] font-medium text-white/70 hover:text-white hover:bg-white/[0.07] disabled:opacity-50 transition-all"
            >
              {avatarMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
              {avatarMut.isPending ? "Uploading…" : "Change avatar"}
            </button>
            {avatarMut.isError && (
              <p className="text-[11px] text-rose-400">{(avatarMut.error as Error).message}</p>
            )}
            {avatarMut.isSuccess && (
              <p className="text-[11px] text-emerald-400">Avatar updated.</p>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) avatarMut.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* General settings */}
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
              className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-white/50">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe this namespace…"
              className="w-full px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-white/50">Slug</label>
            <input
              value={ns.slug}
              disabled
              className="w-full h-9 px-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[13px] text-white/30 font-mono cursor-not-allowed"
            />
            <p className="text-[10px] text-white/25">The slug cannot be changed after creation.</p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => updateMut.mutate()}
              disabled={!dirty || !name.trim() || updateMut.isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-[12px] font-semibold text-black hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {updateMut.isPending && <Loader2 className="size-3 animate-spin" />}
              Save changes
            </button>
          </div>
          {updateMut.isError && (
            <p className="text-[12px] text-rose-400">Failed to save. Please try again.</p>
          )}
          {updateMut.isSuccess && (
            <p className="text-[12px] text-emerald-400">Changes saved.</p>
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
              <p className="text-[13px] font-semibold text-white/70">Delete this namespace</p>
              <p className="text-[12px] text-white/35 mt-0.5">
                Permanently deletes the namespace, all environments, and all workloads. This cannot be undone.
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
                  Type <span className="font-mono">{ns.slug}</span> to confirm deletion
                </p>
              </div>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={ns.slug}
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
                  disabled={deleteConfirm !== ns.slug || deleteMut.isPending}
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
