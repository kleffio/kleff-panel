"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, ArrowLeft, ShieldCheck, Search } from "lucide-react";
import {
  createRole,
  setRolePermissions,
  listPermissions,
} from "@/lib/api/namespaces";
import { cn } from "@kleffio/ui";

export function NamespaceRoleCreatePage() {
  const { slug, environment } = useParams<{ slug: string; environment?: string }>();
  const router = useRouter();
  const rolesBase = environment
    ? `/${slug}/${environment}/settings/roles`
    : `/${slug}/settings/roles`;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const permsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
  });

  const allPermissions = permsQuery.data?.permissions ?? [];

  const filtered = search
    ? allPermissions.filter(
        (p) =>
          p.key.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : allPermissions;

  const grouped = filtered.reduce<Record<string, typeof allPermissions>>(
    (acc, p) => {
      const cat = p.key.split(":")[0] ?? "other";
      (acc[cat] ??= []).push(p);
      return acc;
    },
    {}
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const role = await createRole(slug, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (selectedPerms.size > 0) {
        await setRolePermissions(slug, role.id, [...selectedPerms]);
      }
      return role;
    },
    onSuccess: () => {
      router.push(rolesBase);
    },
  });

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-300">
      {/* Breadcrumb */}
      <Link
        href={rolesBase}
        className="inline-flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to Roles
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Create role</h1>
        <p className="text-[13px] text-white/40">
          Define a custom role with specific permissions for members of this namespace.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.7fr)]">
        {/* ── Left: form + permissions ── */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                Name <span className="text-rose-400">*</span>
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Moderator"
                className="w-full h-10 px-3 rounded-lg bg-white/[0.03] border border-white/[0.07] text-[14px] text-white placeholder:text-white/[0.18] focus:outline-none focus:border-primary/40"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What can members with this role do?"
                className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-[13px] text-white placeholder:text-white/[0.18] focus:outline-none focus:border-primary/40 resize-none"
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/35">
                Permissions
              </p>
              {selectedPerms.size > 0 && (
                <span className="text-[11px] text-primary/70 font-medium">
                  {selectedPerms.size} selected
                </span>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/25 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permissions…"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.03] border border-white/[0.07] text-[13px] text-white placeholder:text-white/[0.18] focus:outline-none focus:border-primary/40"
              />
            </div>

            {permsQuery.isLoading ? (
              <div className="flex justify-center py-10 rounded-2xl border border-white/[0.07]">
                <Loader2 className="size-4 animate-spin text-white/30" />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden divide-y divide-white/[0.04]">
                {Object.entries(grouped).map(([cat, perms]) => (
                  <div key={cat}>
                    <div className="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                        {cat}
                      </p>
                      <button
                        onClick={() => {
                          const allSelected = perms.every((p) => selectedPerms.has(p.key));
                          setSelectedPerms((prev) => {
                            const next = new Set(prev);
                            if (allSelected) perms.forEach((p) => next.delete(p.key));
                            else perms.forEach((p) => next.add(p.key));
                            return next;
                          });
                        }}
                        className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                      >
                        {perms.every((p) => selectedPerms.has(p.key)) ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="divide-y divide-white/[0.03]">
                      {perms.map((p) => {
                        const checked = selectedPerms.has(p.key);
                        return (
                          <label
                            key={p.key}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                              checked ? "bg-primary/[0.04]" : "hover:bg-white/[0.02]"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(p.key)}
                              className="size-4 rounded accent-primary cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-mono text-white/75">{p.key}</p>
                              {p.description && (
                                <p className="text-[11px] text-white/35 mt-0.5">{p.description}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(grouped).length === 0 && (
                  <div className="px-4 py-8 text-center text-[13px] text-white/30">
                    No permissions match your search.
                  </div>
                )}
              </div>
            )}
          </div>

          {createMut.isError && (
            <p className="text-[12px] text-rose-400 bg-rose-500/[0.08] border border-rose-500/[0.15] rounded-lg px-3 py-2">
              Failed to create role. Please try again.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
              className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-primary text-[13px] font-semibold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-default transition-all"
            >
              {createMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Create role
            </button>
            <Link
              href={rolesBase}
              className="h-9 px-4 flex items-center text-[13px] font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>

        {/* ── Right: info cards ── */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="size-3.5 text-white/40" />
              <span className="text-[12px] font-semibold text-white/70">About roles</span>
            </div>
            <p className="text-[12px] text-white/45 leading-relaxed">
              Roles group permissions together and are assigned to namespace members. Members inherit all permissions granted to their role.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">
              Selected
            </p>
            {selectedPerms.size === 0 ? (
              <p className="text-[12px] text-white/25">No permissions selected yet.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {[...selectedPerms].sort().map((key) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-white/60 truncate">{key}</span>
                    <button
                      onClick={() => togglePerm(key)}
                      className="text-[10px] text-white/25 hover:text-rose-400/70 transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 mb-2">
              Tip
            </p>
            <p className="text-[12px] text-white/40 leading-relaxed">
              Use &quot;Select all&quot; per category to quickly grant all permissions in a domain, then remove individual ones as needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
