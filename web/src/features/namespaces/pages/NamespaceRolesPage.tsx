"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { cn } from "@kleffio/ui";
import {
  listRoles,
  deleteRole,
  listRolePermissions,
  setRolePermissions,
  listPermissions,
  listNamespaceMembers,
  updateRole,
  type RoleDTO,
} from "@/lib/api/namespaces";

// ── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-default",
        checked ? "bg-primary" : "bg-white/[0.12]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ── Display tab ────────────────────────────────────────────────────────────

function DisplayTab({ slug, role }: { slug: string; role: RoleDTO }) {
  const qc = useQueryClient();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");

  useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
  }, [role.id, role.name, role.description]);

  const deleteMut = useMutation({
    mutationFn: () => deleteRole(slug, role.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", slug] }),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateRole(slug, role.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", slug] }),
  });

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.08em]">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={role.is_system}
            className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 disabled:opacity-50 disabled:cursor-default"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.08em]">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={role.is_system}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 disabled:opacity-50 disabled:cursor-default resize-none"
          />
        </div>
      </div>

      {role.is_system && (
        <p className="text-[12px] text-white/30 italic">System roles cannot be edited.</p>
      )}

      {!role.is_system && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || saveMut.isPending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-[13px] font-semibold text-black hover:bg-primary/90 disabled:opacity-40 disabled:cursor-default transition-all"
          >
            {saveMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Save changes
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete role "${role.name}"? This cannot be undone.`)) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[13px] font-semibold text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-all"
          >
            {deleteMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Delete role
          </button>
        </div>
      )}

      {saveMut.isSuccess && (
        <p className="text-[12px] text-green-400">Saved.</p>
      )}
      {saveMut.isError && (
        <p className="text-[12px] text-rose-400">Failed to save.</p>
      )}
    </div>
  );
}

// ── Permissions tab ────────────────────────────────────────────────────────

function PermissionsTab({ slug, role }: { slug: string; role: RoleDTO }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [localPerms, setLocalPerms] = useState<Set<string> | null>(null);

  const permsQuery = useQuery({
    queryKey: ["role-permissions", slug, role.id],
    queryFn: () => listRolePermissions(slug, role.id),
  });

  const allPermsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
  });

  useEffect(() => {
    if (permsQuery.data && localPerms === null) {
      setLocalPerms(new Set(permsQuery.data.permissions));
    }
  }, [permsQuery.data, localPerms]);

  // Reset when role changes
  useEffect(() => {
    setLocalPerms(null);
    setSearch("");
  }, [role.id]);

  const saveMut = useMutation({
    mutationFn: (keys: string[]) => setRolePermissions(slug, role.id, keys),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["role-permissions", slug, role.id] }),
    onError: () => {
      setLocalPerms(
        permsQuery.data ? new Set(permsQuery.data.permissions) : null
      );
    },
  });

  const current = localPerms ?? new Set(permsQuery.data?.permissions ?? []);
  const allPermissions = allPermsQuery.data?.permissions ?? [];

  const toggle = (key: string) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setLocalPerms(next);
    saveMut.mutate([...next]);
  };

  const filtered = search
    ? allPermissions.filter(
        (p) =>
          p.key.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase())
      )
    : allPermissions;

  const grouped = filtered.reduce<
    Record<string, typeof allPermissions>
  >((acc, p) => {
    const cat = p.key.split(":")[0] ?? "other";
    (acc[cat] ??= []).push(p);
    return acc;
  }, {});

  if (permsQuery.isLoading || allPermsQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search permissions…"
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40"
        />
      </div>

      {saveMut.isError && (
        <div className="px-4 py-2 text-[12px] text-rose-400 bg-rose-500/[0.08] border border-rose-500/[0.12] rounded-lg">
          Failed to save permissions. Changes reverted.
        </div>
      )}

      <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.07] overflow-hidden">
        {Object.entries(grouped).map(([cat, perms]) => (
          <div key={cat}>
            <div className="px-4 py-2 bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                {cat}
              </p>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {perms.map((p) => {
                const checked = current.has(p.key);
                return (
                  <div
                    key={p.key}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-mono text-white/75">{p.key}</p>
                      {p.description && (
                        <p className="text-[11px] text-white/35 mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <Toggle
                      checked={checked}
                      onChange={() => !role.is_system && toggle(p.key)}
                      disabled={role.is_system}
                    />
                  </div>
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

      {role.is_system && (
        <p className="text-[12px] text-white/30 italic">
          System role permissions cannot be modified.
        </p>
      )}
    </div>
  );
}

// ── Manage Members tab ─────────────────────────────────────────────────────

function ManageMembersTab({ slug, role }: { slug: string; role: RoleDTO }) {
  const membersQuery = useQuery({
    queryKey: ["ns-members", slug],
    queryFn: () => listNamespaceMembers(slug),
  });

  const allMembers = membersQuery.data?.members ?? [];
  const members = allMembers.filter((m) => m.role_id === role.id);

  if (membersQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] py-10 text-center">
        <p className="text-[13px] text-white/30">No members with this role.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.07] overflow-hidden divide-y divide-white/[0.04]">
      {members.map((m) => (
        <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <span className="text-sm font-bold text-primary leading-none">
              {(m.display_name || m.email)[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white/80 truncate">
              {m.display_name || m.email}
            </p>
            <p className="text-[11px] text-white/35 truncate">{m.email}</p>
          </div>
          <span className="shrink-0 px-1.5 py-0.5 rounded border border-white/[0.07] bg-white/[0.04] text-[10px] font-semibold text-white/45">
            {m.role_name}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Role detail (right panel) ──────────────────────────────────────────────

type Tab = "display" | "permissions" | "members";

function RoleDetail({ slug, role }: { slug: string; role: RoleDTO }) {
  const [tab, setTab] = useState<Tab>("display");

  useEffect(() => {
    setTab("display");
  }, [role.id]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "display", label: "Display" },
    { id: "permissions", label: "Permissions" },
    { id: "members", label: "Manage Members" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">
          Edit Role — {role.name.toUpperCase()}
        </p>
        {role.is_system && (
          <span className="inline-flex mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary/70">
            System
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.07] pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 pb-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-primary text-white"
                : "border-transparent text-white/40 hover:text-white/70"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "display" && <DisplayTab slug={slug} role={role} />}
        {tab === "permissions" && <PermissionsTab slug={slug} role={role} />}
        {tab === "members" && <ManageMembersTab slug={slug} role={role} />}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function NamespaceRolesPage() {
  const { slug, environment } = useParams<{ slug: string; environment?: string }>();
  const rolesBase = environment ? `/${slug}/${environment}/settings/roles` : `/${slug}/settings/roles`;
  const [selectedRole, setSelectedRole] = useState<RoleDTO | null>(null);

  const rolesQuery = useQuery({
    queryKey: ["roles", slug],
    queryFn: () => listRoles(slug),
  });

  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data?.roles]);
  const systemRoles = roles.filter((r) => r.is_system);
  const customRoles = roles.filter((r) => !r.is_system);

  // Select first role once data loads
  useEffect(() => {
    if (roles.length > 0 && selectedRole === null) {
      setSelectedRole(roles[0]);
    }
  }, [roles, selectedRole]);

  // Keep selectedRole in sync if roles list changes (e.g. after delete/update)
  useEffect(() => {
    if (selectedRole && roles.length > 0) {
      const updated = roles.find((r) => r.id === selectedRole.id);
      if (updated) {
        setSelectedRole(updated);
      } else {
        // Role was deleted — select first available
        setSelectedRole(roles[0] ?? null);
      }
    }
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 shrink-0 flex flex-col border-r border-white/[0.07] bg-[#0a0a0a] h-full overflow-y-auto">
        <div className="px-3 pt-4 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
            Roles
          </p>
        </div>

        {rolesQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-white/30" />
          </div>
        ) : (
          <div className="flex-1 px-1.5 space-y-px">
            {systemRoles.length > 0 && (
              <>
                <div className="px-2 pt-1 pb-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                    System
                  </p>
                </div>
                {systemRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      selectedRole?.id === role.id
                        ? "bg-white/[0.05] text-white/90"
                        : "text-white/50 hover:bg-white/[0.03] hover:text-white/75"
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                    <span className="text-[13px] font-medium truncate">{role.name}</span>
                  </button>
                ))}
              </>
            )}

            {customRoles.length > 0 && (
              <>
                <div className="px-2 pt-3 pb-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/20">
                    Custom
                  </p>
                </div>
                {customRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      selectedRole?.id === role.id
                        ? "bg-white/[0.05] text-white/90"
                        : "text-white/50 hover:bg-white/[0.03] hover:text-white/75"
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-white/40" />
                    <span className="text-[13px] font-medium truncate">{role.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="mt-auto p-3">
          <Link
            href={`${rolesBase}/new`}
            className="flex items-center justify-center w-full h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[12px] font-semibold text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
          >
            + New role
          </Link>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {selectedRole ? (
          <RoleDetail slug={slug} role={selectedRole} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-[13px] text-white/30">Select a role</p>
          </div>
        )}
      </div>
    </div>
  );
}
