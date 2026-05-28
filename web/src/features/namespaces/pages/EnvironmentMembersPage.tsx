"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  Loader2,
  MoreHorizontal,
  Trash2,
  Lock,
  Globe,
  Mail,
  Link2,
  AlertTriangle,
  ChevronDown,
  UserPlus,
  X,
  Check,
  Copy,
} from "lucide-react";
import {
  listNamespaceMembers,
  listEnvironmentGrants,
  addEnvironmentGrant,
  removeEnvironmentGrant,
  setEnvironmentLimitedAccess,
  getEnvironment,
  listNamespaceInvites,
  revokeNamespaceInvite,
  createNamespaceInvite,
  type EnvAccessGrantDTO,
  type NsMemberDTO,
} from "@/lib/api/namespaces";
import { useNamespacePermissions } from "@/features/namespaces/hooks/useNamespacePermissions";
import { SmartInviteInput } from "@/features/namespaces/components/SmartInviteInput";

function AvatarPlaceholder({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const cls = size === "md" ? "size-9 text-sm rounded-xl" : "size-7 text-xs rounded-lg";
  return (
    <div className={`flex shrink-0 items-center justify-center bg-primary/10 border border-primary/20 ${cls}`}>
      <span className="font-black text-primary leading-none">{name[0]?.toUpperCase()}</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function InheritedMemberRow({ member }: { member: NsMemberDTO }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <AvatarPlaceholder name={member.display_name || member.email} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/60 truncate">{member.display_name || member.email}</p>
        <p className="text-[11px] text-white/25 truncate">{member.email}</p>
      </div>
      <span className={`shrink-0 flex items-center h-6 px-2.5 rounded-lg border text-[11px] font-semibold ${
        member.role_name === "Owner"
          ? "border-primary/20 bg-primary/10 text-primary/70"
          : "border-white/[0.08] bg-white/[0.03] text-white/40"
      }`}>
        {member.role_name}
      </span>
      <span className="shrink-0 text-[10px] text-white/20 hidden sm:block">via namespace</span>
    </div>
  );
}

function GrantRow({
  grant,
  slug,
  envSlug,
  canRemove,
}: {
  grant: EnvAccessGrantDTO;
  slug: string;
  envSlug: string;
  canRemove: boolean;
}) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const removeMut = useMutation({
    mutationFn: () => removeEnvironmentGrant(slug, envSlug, grant.user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["env-grants", slug, envSlug] }),
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <AvatarPlaceholder name={grant.display_name || grant.email} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/80 truncate">{grant.display_name || grant.email}</p>
        <p className="text-[11px] text-white/35 truncate">{grant.email}</p>
      </div>
      <p className="text-[10px] text-white/25 shrink-0 hidden sm:block">Granted {formatDate(grant.created_at)}</p>

      {canRemove && (
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
              <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); removeMut.mutate(); }}
                  disabled={removeMut.isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                  Remove access
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MemberSelect({
  value,
  onChange,
  members,
}: {
  value: string;
  onChange: (v: string) => void;
  members: NsMemberDTO[];
}) {
  const [open, setOpen] = useState(false);
  const selected = members.find((m) => m.user_id === value);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] text-white/60 hover:border-white/[0.14] transition-colors"
      >
        <span>{selected ? (selected.display_name || selected.email) : "Add member…"}</span>
        <ChevronDown className="size-3 text-white/30" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => { onChange(m.user_id); setOpen(false); }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-[12px] text-white/80">{m.display_name || m.email}</span>
                {m.display_name && <span className="text-[10px] text-white/35">{m.email}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectInviteSheet({
  slug,
  envId,
  envName,
  onClose,
}: {
  slug: string;
  envId: string;
  envName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"email" | "link">("email");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("7");
  const [maxUses, setMaxUses] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteMut = useMutation({
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

  const handleSubmit = () => {
    const payload: Parameters<typeof createNamespaceInvite>[1] = {
      days: Number(days),
      grant_environment_id: envId,
    };
    if (tab === "email") {
      if (!email.trim()) return;
      payload.email = email.trim();
    } else {
      if (maxUses) payload.max_uses = Number(maxUses);
    }
    inviteMut.mutate(payload);
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
      <div className="relative w-[440px] rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <p className="text-sm font-semibold text-white">Invite to project</p>
            <p className="text-[11px] text-white/35 mt-0.5">Access scoped to <span className="text-white/60">{envName}</span></p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">
          {generatedLink ? (
            <div className="space-y-3">
              <p className="text-[12px] text-white/50">Share this link — it grants access only to <span className="text-white/70">{envName}</span>.</p>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-2.5">
                <span className="flex-1 text-[12px] text-white/60 truncate font-mono">{generatedLink}</span>
                <button onClick={copyLink} className="shrink-0 flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80 transition-colors">
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <button onClick={onClose} className="w-full h-9 rounded-xl bg-white/[0.06] text-[13px] font-medium text-white/70 hover:bg-white/[0.10] transition-colors">Done</button>
            </div>
          ) : (
            <>
              <div className="flex gap-1">
                {(["email", "link"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold transition-all ${
                      tab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"
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

              {tab === "link" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/50">Max uses (optional)</label>
                  <input
                    type="number"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Unlimited"
                    min={1}
                    className="w-full h-9 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-primary/40 transition-colors"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/50">Expires in</label>
                <select
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full h-9 rounded-xl border border-white/[0.09] bg-[#0f0f0f] px-3 text-[13px] text-white/70 outline-none focus:border-primary/40 transition-colors"
                >
                  {[1, 3, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>{d} day{d !== 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSubmit}
                disabled={inviteMut.isPending || (tab === "email" && !email.trim())}
                className="w-full h-9 rounded-xl bg-primary text-[13px] font-semibold text-black hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {inviteMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {tab === "email" ? "Send invite" : "Generate link"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function EnvironmentMembersPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();
  const qc = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState("");
  const [showInviteSheet, setShowInviteSheet] = useState(false);

  const envQuery = useQuery({
    queryKey: ["environment", slug, environment],
    queryFn: () => getEnvironment(slug, environment),
  });

  const nsMembersQuery = useQuery({
    queryKey: ["ns-members", slug],
    queryFn: () => listNamespaceMembers(slug),
  });

  const grantsQuery = useQuery({
    queryKey: ["env-grants", slug, environment],
    queryFn: () => listEnvironmentGrants(slug, environment),
  });

  const invitesQuery = useQuery({
    queryKey: ["ns-invites", slug],
    queryFn: () => listNamespaceInvites(slug),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const updateEnvMut = useMutation({
    mutationFn: (limited: boolean) => setEnvironmentLimitedAccess(slug, environment, limited),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["env-grants", slug, environment] }),
  });

  const addGrantMut = useMutation({
    mutationFn: (userId: string) => addEnvironmentGrant(slug, environment, userId),
    onSuccess: () => {
      setSelectedUserId("");
      qc.invalidateQueries({ queryKey: ["env-grants", slug, environment] });
    },
  });

  const revokeInviteMut = useMutation({
    mutationFn: (id: string) => revokeNamespaceInvite(slug, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ns-invites", slug] }),
  });

  const { hasPermission } = useNamespacePermissions(slug, envQuery.data?.id);
  const canManageEnvironment = hasPermission("environment:manage");

  const env = envQuery.data;
  const envName = env?.name ?? environment;
  const isPrivate = grantsQuery.data?.limited_access ?? false;
  
  const nsMembers = (nsMembersQuery.data?.members ?? []).sort((a, b) => {
    if (a.role_name === "Owner") return -1;
    if (b.role_name === "Owner") return 1;
    return 0;
  });
  
  const grants = grantsQuery.data?.grants ?? [];
  
  // Filter out members who already have a grant, or are owners (owners always have access)
  const availableToGrant = nsMembers.filter(m => 
    m.role_name !== "Owner" && !grants.some(g => g.user_id === m.user_id)
  );

  const envInvites = (invitesQuery.data?.invites ?? []).filter(
    (i) => i.grant_environment_id === env?.id && !i.accepted_at
  );

  return (
    <>
      {showInviteSheet && env && (
        <ProjectInviteSheet
          slug={slug}
          envId={env.id}
          envName={envName}
          onClose={() => setShowInviteSheet(false)}
        />
      )}
      <div className="relative mx-auto max-w-4xl space-y-8 animate-in fade-in duration-300 px-4 sm:px-6 lg:px-8 pb-16 pt-6">
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/6 blur-[100px]" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/${slug}/${environment}`} className="text-[12px] text-white/30 hover:text-white/60 transition-colors">
              ← Back
            </Link>
            <h1 className="text-xl font-semibold text-white tracking-tight mt-1">Access</h1>
            <p className="text-[13px] text-white/40 mt-0.5">
              <span className="font-medium text-white/60">{envName}</span>
              {" · "}
              {isPrivate ? `${grants.length} explicit grant${grants.length !== 1 ? "s" : ""}` : "Open to all members"}
            </p>
          </div>
          {canManageEnvironment && env && (
            <button
              onClick={() => setShowInviteSheet(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-[13px] font-semibold text-black hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="size-3.5" />
              Invite
            </button>
          )}
        </div>

        {/* Limited Access Toggle */}
        {canManageEnvironment && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-white/90">Limited Access</p>
                <p className="text-[11px] text-white/40 mt-0.5 max-w-[80%]">
                  When enabled, only namespace members explicitly granted access can view this project.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isPrivate}
                  disabled={updateEnvMut.isPending}
                  onChange={(e) => updateEnvMut.mutate(e.target.checked)}
                />
                <div className="peer h-5 w-9 rounded-full bg-white/[0.1] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-disabled:opacity-50"></div>
              </label>
            </div>
          </div>
        )}

        {/* Project Access */}
        {isPrivate ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5 text-white/30" />
                <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">
                  Explicit Grants
                </h2>
                <span className="text-[10px] text-white/25">Scoped to this project only</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Users className="size-3.5 text-white/40" />
                  <span className="text-[12px] font-semibold text-white/60">Granted Members</span>
                  {!grantsQuery.isLoading && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white/[0.07] text-[10px] font-bold text-white/50">
                      {grants.length}
                    </span>
                  )}
                </div>
                {canManageEnvironment && availableToGrant.length > 0 && (
                  <div className="flex items-center gap-2">
                    <MemberSelect
                      value={selectedUserId}
                      onChange={setSelectedUserId}
                      members={availableToGrant}
                    />
                    <button
                      onClick={() => { addGrantMut.mutate(selectedUserId); }}
                      disabled={!selectedUserId || addGrantMut.isPending}
                      className="h-7 px-3 rounded-lg bg-white/10 text-[11px] font-medium text-white hover:bg-white/20 disabled:opacity-50 transition-colors"
                    >
                      {addGrantMut.isPending ? <Loader2 className="size-3 animate-spin" /> : "Add"}
                    </button>
                  </div>
                )}
              </div>

              {grantsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-white/30" />
                </div>
              ) : grants.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-white/30">
                  No explicit grants.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {grants.map((g) => (
                    <GrantRow
                      key={g.user_id}
                      grant={g}
                      slug={slug}
                      envSlug={environment}
                      canRemove={canManageEnvironment}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Inherited NS access */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-white/30" />
              <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">
                Namespace Access
              </h2>
              <span className="text-[10px] text-white/25">Inherited access</span>
            </div>
            <Link
              href={`/${slug}/settings/members`}
              className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
            >
              Manage →
            </Link>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015]">
            {nsMembersQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-white/30" />
              </div>
            ) : nsMembers.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-white/25">No namespace members.</div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {nsMembers.map((m) => (
                  <InheritedMemberRow key={m.user_id} member={m} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending invites */}
        {(invitesQuery.isLoading || envInvites.length > 0) && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-white/40" />
                <span className="text-[12px] font-semibold text-white/60">Pending project invites</span>
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-white/[0.07] text-[10px] font-bold text-white/50">
                  {envInvites.length}
                </span>
              </div>
            </div>

            {invitesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-4 animate-spin text-white/30" />
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {envInvites.map((inv) => (
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

    </>
  );
}
