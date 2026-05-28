"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  UserPlus,
  Loader2,
  MoreHorizontal,
  Trash2,
  Shield,
  ChevronDown,
  X,
  Copy,
  Check,
  Mail,
  Link2,
  AlertTriangle,
  Plus,
  Minus,
  Globe,
} from "lucide-react";
import {
  listNamespaceMembers,
  listRoles,
  listNamespaceInvites,
  createNamespaceInvite,
  revokeNamespaceInvite,
  updateNamespaceMemberRole,
  removeNamespaceMember,
  listOverrides,
  setOverride,
  deleteOverride,
  listPermissions,
  getNamespace,
  type NsMemberDTO,
} from "@/lib/api/namespaces";
import { useNamespacePermissions } from "@/features/namespaces/hooks/useNamespacePermissions";
import { SmartInviteInput } from "@/features/namespaces/components/SmartInviteInput";

// ── Helpers ────────────────────────────────────────────────────────────────

function AvatarPlaceholder({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const cls =
    size === "md" ? "size-9 text-sm rounded-xl" : "size-7 text-xs rounded-lg";
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-primary/10 border border-primary/20 ${cls}`}
    >
      <span className="font-black text-primary leading-none">{name[0]?.toUpperCase()}</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type MemberLike = { user_id: string; display_name: string; email: string };

// ── Permission override sheet ──────────────────────────────────────────────

function OverrideSheet({
  slug,
  member,
  onClose,
}: {
  slug: string;
  member: MemberLike;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const permsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
  });

  const overridesQuery = useQuery({
    queryKey: ["overrides", slug, member.user_id],
    queryFn: () => listOverrides(slug, member.user_id),
  });

  const setMut = useMutation({
    mutationFn: ({ key, effect }: { key: string; effect: "allow" | "deny" }) =>
      setOverride(slug, member.user_id, key, effect),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overrides", slug, member.user_id] }),
  });

  const delMut = useMutation({
    mutationFn: (key: string) => deleteOverride(slug, member.user_id, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overrides", slug, member.user_id] }),
  });

  const permissions = permsQuery.data?.permissions ?? [];
  const overrides = overridesQuery.data?.overrides ?? [];

  const overrideMap = new Map<string, "allow" | "deny">();
  overrides.forEach((o) => overrideMap.set(o.permission_key, o.effect));

  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    const cat = p.key.split(":")[0] ?? "other";
    (acc[cat] ??= []).push(p);
    return acc;
  }, {});

  const isLoading = permsQuery.isLoading || overridesQuery.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex w-[480px] flex-col bg-[#0f0f0f] border-l border-white/[0.07] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <AvatarPlaceholder name={member.display_name || member.email} />
            <div>
              <p className="text-sm font-semibold text-white">
                {member.display_name || member.email}
              </p>
              <p className="text-[11px] text-white/40">{member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/[0.07]">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
            Permission Overrides
          </p>
          <p className="text-[12px] text-white/40 mt-1">
            Overrides apply on top of this member&apos;s role and survive role changes.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-white/30" />
          </div>
        ) : (
          <div className="flex-1 divide-y divide-white/[0.04]">
            {Object.entries(grouped).map(([cat, perms]) => (
              <div key={cat} className="px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-3">
                  {cat}
                </p>
                <div className="space-y-1">
                  {perms.map((p) => {
                    const effect = overrideMap.get(p.key);
                    return (
                      <div
                        key={p.key}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-mono text-white/70">{p.key}</p>
                          <p className="text-[10px] text-white/35 truncate">{p.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() =>
                              effect === "allow"
                                ? delMut.mutate(p.key)
                                : setMut.mutate({ key: p.key, effect: "allow" })
                            }
                            className={`flex items-center gap-1 h-6 px-2 rounded text-[10px] font-semibold transition-all ${
                              effect === "allow"
                                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                                : "bg-white/[0.04] border border-white/[0.07] text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                          >
                            <Plus className="size-2.5" />
                            Allow
                          </button>
                          <button
                            onClick={() =>
                              effect === "deny"
                                ? delMut.mutate(p.key)
                                : setMut.mutate({ key: p.key, effect: "deny" })
                            }
                            className={`flex items-center gap-1 h-6 px-2 rounded text-[10px] font-semibold transition-all ${
                              effect === "deny"
                                ? "bg-rose-500/20 border border-rose-500/30 text-rose-400"
                                : "bg-white/[0.04] border border-white/[0.07] text-white/30 hover:text-rose-400 hover:bg-rose-500/10"
                            }`}
                          >
                            <Minus className="size-2.5" />
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom select ─────────────────────────────────────────────────────────

function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value && o.value !== "");
  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] focus:outline-none hover:border-white/[0.14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "text-white" : "text-white/30"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="size-3.5 text-white/30 shrink-0 ml-2" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center px-3 py-2.5 text-[13px] transition-colors hover:bg-white/[0.05] ${
                  o.value === value ? "text-primary" : "text-white/70"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compact role picker used inline in member rows
function RoleSelect({
  value,
  onChange,
  roles,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = roles.find((r) => r.id === value);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 h-7 pl-2.5 pr-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-semibold text-white/60 hover:border-white/[0.14] transition-colors disabled:opacity-50"
      >
        {selected?.name ?? "—"}
        <ChevronDown className="size-3 text-white/30" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[130px] rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onChange(r.id); setOpen(false); }}
                className={`flex w-full items-center px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.05] ${
                  r.id === value ? "text-primary" : "text-white/70"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Invite sheet ───────────────────────────────────────────────────────────

function InviteSheet({
  slug,
  nsType,
  onClose,
}: {
  slug: string;
  nsType: "user" | "org";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [days, setDays] = useState("7");
  const [maxUses, setMaxUses] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ["roles", slug],
    queryFn: () => listRoles(slug),
  });
  const roles = rolesQuery.data?.roles ?? [];

  const nsMut = useMutation({
    mutationFn: (payload: Parameters<typeof createNamespaceInvite>[1]) =>
      createNamespaceInvite(slug, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ns-invites", slug] });
      if (tab === "link" && data.token) {
        setGeneratedLink(`${window.location.origin}/ns-invite/${data.token}`);
      } else {
        onClose();
      }
    },
  });

  const isPending = nsMut.isPending;

  const handleSubmit = () => {
    const payload: any = {
      role_id: roleId || undefined,
      days: Number(days),
    };
    
    if (tab === "email") {
      if (!email.trim()) return;
      payload.email = email.trim();
    } else {
      if (maxUses) payload.max_uses = Number(maxUses);
    }

    nsMut.mutate(payload);
  };

  const copyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[460px] rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <p className="text-sm font-semibold text-white">Invite member</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-4">
          {/* Invite method tabs */}
          <div className="flex gap-1">
            {(["email", "link"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setGeneratedLink(null); }}
                className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold transition-all ${
                  tab === t
                    ? "bg-white/[0.08] text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {t === "email" ? <Mail className="size-3" /> : <Link2 className="size-3" />}
                {t === "email" ? "Email invite" : "Shareable link"}
              </button>
            ))}
          </div>

          {tab === "email" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-white/50">Email or username</label>
              <SmartInviteInput
                value={email}
                onChange={setEmail}
                placeholder="colleague@example.com or @username"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-white/50">Role (optional)</label>
            <CustomSelect
              value={roleId}
              onChange={setRoleId}
              options={[
                { value: "", label: "Default (Member)" },
                ...roles.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-white/50">Expires in (days)</label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                min="1"
                max="365"
                className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-primary/40"
              />
            </div>
            {tab === "link" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/50">Max uses (blank = ∞)</label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min="1"
                  placeholder="∞"
                  className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40"
                />
              </div>
            )}
          </div>

          {generatedLink && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-[11px] text-emerald-400 font-semibold">Link generated</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[11px] font-mono text-white/60 truncate">{generatedLink}</p>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 h-6 px-2 rounded bg-white/[0.06] text-[10px] font-semibold text-white/50 hover:text-white/80 transition-all shrink-0"
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pb-4">
            <button
              onClick={onClose}
              className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white/50 hover:text-white/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-[12px] font-semibold text-black hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {isPending && <Loader2 className="size-3 animate-spin" />}
              {tab === "email" ? "Send invite" : generatedLink ? "Generate new" : "Generate link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NS member row ──────────────────────────────────────────────────────────

function NsMemberRow({
  member,
  roles,
  slug,
  canManageRoles,
  canRemove,
  onOpenOverrides,
}: {
  member: NsMemberDTO;
  roles: Awaited<ReturnType<typeof listRoles>>["roles"];
  slug: string;
  canManageRoles: boolean;
  canRemove: boolean;
  onOpenOverrides: (m: MemberLike) => void;
}) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const roleMut = useMutation({
    mutationFn: (roleId: string) => updateNamespaceMemberRole(slug, member.user_id, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ns-members", slug] }),
  });

  const removeMut = useMutation({
    mutationFn: () => removeNamespaceMember(slug, member.user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ns-members", slug] }),
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <AvatarPlaceholder name={member.display_name || member.email} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/80 truncate">
          {member.display_name || member.email}
        </p>
        <p className="text-[11px] text-white/35 truncate">{member.email}</p>
      </div>
      <p className="text-[10px] text-white/25 shrink-0 hidden sm:block">
        Joined {formatDate(member.created_at)}
      </p>

      {member.role_name === "Owner" ? (
        <span className="flex items-center h-7 px-2.5 rounded-lg border border-primary/20 bg-primary/10 text-[11px] font-semibold text-primary/80 shrink-0">
          Owner
        </span>
      ) : canManageRoles ? (
        <div className="relative shrink-0">
          <RoleSelect
            value={member.role_id}
            onChange={(id) => roleMut.mutate(id)}
            roles={roles}
            disabled={roleMut.isPending}
          />
        </div>
      ) : (
        <span className="flex items-center h-7 px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-white/40 shrink-0">
          {member.role_name}
        </span>
      )}

      {member.role_name !== "Owner" && (canManageRoles || canRemove) && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-7 items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-all"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden">
                {canManageRoles && (
                  <button
                    onClick={() => { setMenuOpen(false); onOpenOverrides(member); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.05] transition-all"
                  >
                    <Shield className="size-3.5" />
                    Permission overrides
                  </button>
                )}
                {canManageRoles && canRemove && <div className="h-px bg-white/[0.06] mx-2" />}
                {canRemove && (
                  <button
                    onClick={() => { setMenuOpen(false); removeMut.mutate(); }}
                    disabled={removeMut.isPending}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                    Remove member
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function NamespaceMembersPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [overrideMember, setOverrideMember] = useState<MemberLike | null>(null);

  const { hasPermission } = useNamespacePermissions(slug);
  const canManageRoles = hasPermission("member:manage_roles");
  const canRemove = hasPermission("member:remove");
  const canInvite = hasPermission("member:invite");

  const nsQuery = useQuery({
    queryKey: ["namespace", slug],
    queryFn: () => getNamespace(slug),
  });
  const nsType = (nsQuery.data?.type ?? "user") as "user" | "org";

  const membersQuery = useQuery({
    queryKey: ["ns-members", slug],
    queryFn: () => listNamespaceMembers(slug),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles", slug],
    queryFn: () => listRoles(slug),
  });

  const invitesQuery = useQuery({
    queryKey: ["ns-invites", slug],
    queryFn: () => listNamespaceInvites(slug),
  });

  const revokeInviteMut = useMutation({
    mutationFn: (id: string) => revokeNamespaceInvite(slug, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ns-invites", slug] }),
  });

  const rawMembers = membersQuery.data?.members ?? [];
  const members = [...rawMembers].sort((a, b) => {
    if (a.role_name === "Owner") return -1;
    if (b.role_name === "Owner") return 1;
    return 0;
  });
  const roles = rolesQuery.data?.roles ?? [];
  const invites = invitesQuery.data?.invites ?? [];
  const pendingInvites = invites.filter((i) => !i.accepted_at);

  return (
    <>
      <div className="relative mx-auto max-w-4xl space-y-8 animate-in fade-in duration-300 px-4 sm:px-6 lg:px-8 pb-16 pt-6">
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/6 blur-[100px]" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={`/${slug}`}
              className="text-[12px] text-white/30 hover:text-white/60 transition-colors"
            >
              ← Back
            </Link>
            <h1 className="text-xl font-semibold text-white tracking-tight mt-1">Access</h1>
            <p className="text-[13px] text-white/40 mt-0.5">
              Manage who has access to this namespace and its projects.
            </p>
          </div>
          {canInvite && (
            <button
              onClick={() => setShowInviteSheet(true)}
              className="flex items-center gap-2 h-8 px-4 rounded-lg bg-primary text-[12px] font-semibold text-black hover:bg-primary/90 transition-all"
            >
              <UserPlus className="size-3.5" />
              Invite
            </button>
          )}
        </div>

        {/* Namespace access */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="size-3.5 text-white/30" />
            <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">
              Namespace Access
            </h2>
            <span className="text-[10px] text-white/25">Full access to all projects</span>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Users className="size-3.5 text-white/40" />
              <span className="text-[12px] font-semibold text-white/60">Members</span>
              {!membersQuery.isLoading && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white/[0.07] text-[10px] font-bold text-white/50">
                  {members.length}
                </span>
              )}
            </div>

            {membersQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-5 animate-spin text-white/30" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-white/30">No members yet.</div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {members.map((m) => (
                  <NsMemberRow
                    key={m.user_id}
                    member={m}
                    roles={roles}
                    slug={slug}
                    canManageRoles={canManageRoles}
                    canRemove={canRemove}
                    onOpenOverrides={setOverrideMember}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending NS invites */}
        {(invitesQuery.isLoading || pendingInvites.length > 0) && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-white/40" />
                <span className="text-[12px] font-semibold text-white/60">Pending invites</span>
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white/[0.07] text-[10px] font-bold text-white/50">
                  {pendingInvites.length}
                </span>
              </div>
            </div>

            {invitesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-4 animate-spin text-white/30" />
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0">
                      {inv.invited_email ? (
                        <Mail className="size-3.5 text-white/30" />
                      ) : (
                        <Link2 className="size-3.5 text-white/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-white/70 truncate">
                        {inv.invited_email ?? "Shareable link"}
                      </p>
                      <p className="text-[10px] text-white/35">
                        {inv.role_name && `Role: ${inv.role_name} · `}
                        Expires {formatDate(inv.expires_at)}
                        {inv.max_uses != null && ` · ${inv.use_count}/${inv.max_uses} uses`}
                      </p>
                    </div>
                    {inv.max_uses == null && !inv.invited_email && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded border border-white/[0.07] bg-white/[0.04] text-[10px] font-semibold text-white/40">
                        {inv.use_count} use{inv.use_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button
                      onClick={() => revokeInviteMut.mutate(inv.id)}
                      disabled={revokeInviteMut.isPending}
                      className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-semibold text-white/30 hover:text-rose-400 hover:bg-rose-500/10 border border-white/[0.07] transition-all shrink-0 disabled:opacity-50"
                    >
                      <AlertTriangle className="size-3" />
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showInviteSheet && (
        <InviteSheet
          slug={slug}
          nsType={nsType}
          onClose={() => setShowInviteSheet(false)}
        />
      )}

      {overrideMember && (
        <OverrideSheet
          slug={slug}
          member={overrideMember}
          onClose={() => setOverrideMember(null)}
        />
      )}
    </>
  );
}
