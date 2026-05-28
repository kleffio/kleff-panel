"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  User,
  Cpu,
  HardDrive,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { listNamespaces, listNamespaceMembers, getNamespaceQuota, setNamespaceQuota } from "@/lib/api/namespaces";

function fmtCpu(m: number) {
  return m >= 1000 ? `${m / 1000} vCPU` : `${m}m`;
}
function fmtMem(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

function NamespaceRow({ slug, name, type }: { slug: string; name: string; type: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);
  const [cpuInput, setCpuInput] = React.useState("");
  const [memInput, setMemInput] = React.useState("");
  const [editing, setEditing] = React.useState(false);

  const { data: quota, isLoading: quotaLoading } = useQuery({
    queryKey: ["admin", "quota", slug],
    queryFn: () => getNamespaceQuota(slug),
    retry: false,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["admin", "members", slug],
    queryFn: () => listNamespaceMembers(slug),
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const cpu = parseInt(cpuInput, 10);
      const mem = parseInt(memInput, 10);
      if (isNaN(cpu) || isNaN(mem) || cpu < 0 || mem < 0) {
        throw new Error("Invalid values");
      }
      return setNamespaceQuota(slug, { cpu_millicores: cpu, memory_mb: mem });
    },
    onSuccess: () => {
      toast.success(`Quota updated for ${name}`);
      qc.invalidateQueries({ queryKey: ["admin", "quota", slug] });
      setEditing(false);
    },
    onError: () => {
      toast.error("Failed to update quota");
    },
  });

  function startEdit() {
    setCpuInput(String(quota?.cpu_millicores ?? 0));
    setMemInput(String(quota?.memory_mb ?? 0));
    setEditing(true);
  }

  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
          {type === "org" ? (
            <Building2 className="size-3.5 text-primary" />
          ) : (
            <User className="size-3.5 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white/80 truncate">{name}</p>
          <p className="text-[11px] text-white/30">{slug} · {type}</p>
        </div>

        {/* Quota display / edit */}
        <div className="flex items-center gap-2">
          {quotaLoading ? (
            <Loader2 className="size-3.5 text-white/20 animate-spin" />
          ) : editing ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Cpu className="size-3 text-white/30" />
                <input
                  value={cpuInput}
                  onChange={(e) => setCpuInput(e.target.value)}
                  className="w-20 rounded bg-white/[0.06] border border-white/[0.1] px-2 py-1 text-[12px] text-white/70 outline-none focus:border-[#f5b517]/40"
                  placeholder="millicores"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-1">
                <HardDrive className="size-3 text-white/30" />
                <input
                  value={memInput}
                  onChange={(e) => setMemInput(e.target.value)}
                  className="w-20 rounded bg-white/[0.06] border border-white/[0.1] px-2 py-1 text-[12px] text-white/70 outline-none focus:border-[#f5b517]/40"
                  placeholder="MB"
                />
              </div>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex size-6 items-center justify-center rounded bg-[#f5b517]/15 border border-[#f5b517]/20 text-[#f5b517] hover:bg-[#f5b517]/25 transition-colors"
              >
                {saveMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-[11px] text-white/30 hover:text-white/60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 hover:bg-white/[0.06] transition-colors group"
            >
              <span className="flex items-center gap-1.5 text-[11px] text-white/40 group-hover:text-white/60">
                <Cpu className="size-3" />
                {quota ? fmtCpu(quota.cpu_millicores) : "—"}
              </span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1.5 text-[11px] text-white/40 group-hover:text-white/60">
                <HardDrive className="size-3" />
                {quota ? fmtMem(quota.memory_mb) : "—"}
              </span>
              <span className="text-[10px] text-[#f5b517]/50 group-hover:text-[#f5b517]/80">Edit</span>
            </button>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex size-6 items-center justify-center rounded text-white/20 hover:text-white/50 transition-colors"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-3">
          {membersLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-white/25">
              <Loader2 className="size-3.5 animate-spin" /> Loading members…
            </div>
          ) : !membersData?.members?.length ? (
            <p className="text-[12px] text-white/25">No members</p>
          ) : (
            <div className="space-y-1.5">
              {membersData.members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2.5">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-bold text-white/40">
                    {(m.display_name?.[0] ?? m.email[0]).toUpperCase()}
                  </div>
                  <span className="text-[12px] text-white/60 flex-1">{m.display_name || m.email}</span>
                  <span className="text-[10px] text-white/25">{m.role_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminMembersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "namespaces"],
    queryFn: listNamespaces,
  });

  const namespaces = data?.namespaces ?? [];
  const orgs = namespaces.filter((n) => n.type === "org");
  const users = namespaces.filter((n) => n.type === "user");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white/90">Namespace Management</h1>
        <p className="mt-1 text-[13px] text-white/40">
          Set CPU and memory quotas for each namespace. Users can allocate up to these limits when creating servers.
        </p>
      </div>

      <div className="rounded-[10px] border border-[#f5b517]/10 bg-[#f5b517]/[0.02] px-4 py-3">
        <p className="text-[12px] text-[#f5b517]/60">
          <strong className="text-[#f5b517]/80">Quota format:</strong> CPU in millicores (1000m = 1 vCPU), Memory in MB (1024 MB = 1 GB). Set to 0 to disable server creation for that namespace.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-white/25">
          <Loader2 className="size-4 animate-spin" /> Loading namespaces…
        </div>
      ) : error ? (
        <p className="text-[13px] text-red-400/70">Failed to load namespaces.</p>
      ) : (
        <div className="space-y-6">
          {orgs.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/30">
                <Building2 className="size-3.5" /> Organizations ({orgs.length})
              </h2>
              <div className="space-y-2">
                {orgs.map((ns) => (
                  <NamespaceRow key={ns.id} slug={ns.slug} name={ns.name} type={ns.type} />
                ))}
              </div>
            </section>
          )}

          {users.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/30">
                <User className="size-3.5" /> Personal namespaces ({users.length})
              </h2>
              <div className="space-y-2">
                {users.map((ns) => (
                  <NamespaceRow key={ns.id} slug={ns.slug} name={ns.name} type={ns.type} />
                ))}
              </div>
            </section>
          )}

          {namespaces.length === 0 && (
            <p className="text-[13px] text-white/25">No namespaces found.</p>
          )}
        </div>
      )}
    </div>
  );
}
