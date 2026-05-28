"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { ArrowRight, Globe, Loader2, Lock } from "lucide-react";
import { Button, Input, Label } from "@kleffio/ui";
import { createEnvironment, getNamespace } from "@/lib/api/namespaces";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function NamespaceEnvironmentCreatePage() {
  const { slug: paramSlug } = useParams<{ slug?: string }>();
  const searchParams = useSearchParams();
  const slug = paramSlug ?? searchParams.get("namespace") ?? "";
  const router = useRouter();
  const qc = useQueryClient();

  const namespaceQuery = useQuery({
    queryKey: ["namespace", slug],
    queryFn: () => getNamespace(slug),
    enabled: !!slug,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      createEnvironment(slug, {
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || undefined,
        is_private: isPrivate,
      }),
    onSuccess: (env) => {
      qc.invalidateQueries({ queryKey: ["environments", slug] });
      router.replace(`/${slug}/${env.slug}`);
    },
  });

  if (namespaceQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (!namespaceQuery.data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        <Lock className="size-10 text-white/20" />
        <p className="text-sm text-white/40">Namespace not found.</p>
      </div>
    );
  }

  const ns = namespaceQuery.data;

  return (
    <div className="relative mx-auto max-w-3xl space-y-8 animate-in fade-in duration-300 px-4 sm:px-6 lg:px-8 pb-16 pt-6">
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/6 blur-[100px]" />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[12px] text-white/35">
          <span>{ns.name}</span>
          <ArrowRight className="size-3" />
          <span className="font-mono">New project</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Create project</h1>
        <p className="text-[13px] text-white/40 max-w-2xl">
          Projects belong to namespaces. Personal namespaces can create projects the same way organizations can.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production"
              className="bg-white/[0.03] border-white/[0.07] text-white placeholder:text-white/[0.18] h-10"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what lives here…"
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 text-[13px] text-white placeholder:text-white/[0.18] focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 size-4 rounded border-white/20 bg-transparent text-primary focus:ring-primary/40"
            />
            <span>
              <span className="block text-[13px] font-medium text-white/80">Private project</span>
              <span className="block text-[11px] text-white/30 mt-0.5">Only members who can access this namespace can view it.</span>
            </span>
          </label>

          {createMut.isError && (
            <p className="text-[12px] text-rose-400 bg-rose-500/[0.08] border border-rose-500/[0.15] rounded-lg px-3 py-2">
              Failed to create the project. The slug may already be taken.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => router.back()} className="text-white/40 hover:text-white/70 h-9 px-4">
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !name.trim()}
              className="bg-primary text-black hover:opacity-90 h-9 px-5 font-semibold disabled:opacity-30"
            >
              {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create project"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-white/40" />
              <span className="text-[12px] font-semibold text-white/70">Namespace</span>
            </div>
            <div className="mt-3 space-y-2 text-[12px] text-white/55">
              <div className="flex items-center justify-between gap-3">
                <span>Name</span>
                <span className="font-medium text-white/80">{ns.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Slug</span>
                <span className="font-mono text-white/70">{ns.slug}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Type</span>
                <span className="text-white/70">{ns.type === "org" ? "Organization" : "Personal"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Flow</p>
            <p className="mt-2 text-[13px] leading-6 text-white/55">
              Create the project here, then jump straight into the environment home, canvas, monitoring, or team views.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
