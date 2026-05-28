"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Settings,
  Users,
  FolderOpen,
  Lock,
  Globe,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Share2,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import { useNamespacePermissions } from "@/features/namespaces/hooks/useNamespacePermissions";
import {
  getNamespace,
  listEnvironments,
  listNamespaceMembers,
  type EnvironmentDTO,
  type NamespaceDTO,
} from "@/lib/api/namespaces";
import { listWorkloads, type WorkloadDTO } from "@/lib/api/projects";
import { getPublicProfile } from "@/lib/api/profiles";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { cn } from "@kleffio/ui";


// ── Animated container ─────────────────────────────────────────────────────

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

// ── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", color ?? "bg-white/20")} />
      <span className="text-[11px] text-white/40">{value} {label}</span>
    </div>
  );
}

// ── Environment card ───────────────────────────────────────────────────────

function EnvCard({ env, ns }: { env: EnvironmentDTO; ns: NamespaceDTO }) {
  const workloadsQuery = useQuery({
    queryKey: ["workloads", ns.slug, env.slug],
    queryFn: () => listWorkloads(env.id, { namespaceSlug: ns.slug, environmentSlug: env.slug }),
    staleTime: 30_000,
  });

  const workloads: WorkloadDTO[] = workloadsQuery.data?.workloads ?? [];
  const running = workloads.filter((w) => w.state === "running").length;
  const failed  = workloads.filter((w) => w.state === "failed").length;
  const pending = workloads.filter((w) => w.state === "pending").length;
  const stopped = workloads.filter((w) => w.state === "stopped").length;
  const total   = workloads.length;
  const allGood = total > 0 && failed === 0 && pending === 0;

  return (
    <motion.div variants={item}>
      <Link
        href={`/${ns.slug}/${env.slug}`}
        className={cn(
          "group relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 backdrop-blur-sm",
          "bg-white/[0.03] hover:bg-white/[0.05]",
          allGood
            ? "border-emerald-500/[0.12] hover:border-emerald-500/25 hover:shadow-[0_0_0_1px_oklch(0.74_0.17_160_/_0.18),0_0_28px_oklch(0.74_0.17_160_/_0.07)]"
            : failed > 0
            ? "border-rose-500/[0.12] hover:border-rose-500/22 hover:shadow-[0_0_0_1px_oklch(0.63_0.20_25_/_0.18),0_0_28px_oklch(0.63_0.20_25_/_0.06)]"
            : "border-white/[0.07] hover:border-white/[0.13] hover:shadow-[0_0_0_1px_oklch(1_0_0_/_0.05),0_0_24px_oklch(0.80_0.17_90_/_0.05)]"
        )}
      >
        {/* Glass highlight line */}
        <div className={cn(
          "h-px w-full",
          allGood ? "bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"
          : failed > 0 ? "bg-gradient-to-r from-transparent via-rose-500/25 to-transparent"
          : "bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        )} />

        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                allGood
                  ? "bg-emerald-500/[0.08] border-emerald-500/[0.15] group-hover:bg-emerald-500/[0.13]"
                  : "bg-white/[0.035] border-white/[0.07] group-hover:bg-white/[0.06]"
              )}>
                {env.is_private
                  ? <Lock className={cn("size-3.5", allGood ? "text-emerald-400/80" : "text-white/30")} />
                  : <Globe className={cn("size-3.5", allGood ? "text-emerald-400/80" : "text-white/30")} />
                }
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white/80 group-hover:text-white/95 transition-colors truncate leading-tight">
                  {env.name}
                </p>
                <p className="text-[10px] font-mono text-white/22 truncate leading-tight mt-0.5">
                  {env.slug}
                </p>
              </div>
            </div>
            <ArrowRight className="size-3.5 shrink-0 mt-1 text-white/12 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
          </div>

          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            {workloadsQuery.isLoading ? (
              <Loader2 className="size-3 animate-spin text-white/20" />
            ) : total === 0 ? (
              <span className="text-[11px] italic text-white/22">No servers</span>
            ) : (
              <>
                {running > 0 && <StatPill label="running" value={running} color="bg-emerald-400" />}
                {pending > 0 && <StatPill label="starting" value={pending} color="bg-amber-400" />}
                {failed  > 0 && <StatPill label="failed"  value={failed}  color="bg-rose-400" />}
                {stopped > 0 && <StatPill label="stopped" value={stopped} color="bg-white/25" />}
              </>
            )}
          </div>
        </div>

      </Link>
    </motion.div>
  );
}

// ── Add card ───────────────────────────────────────────────────────────────

function AddEnvCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.div variants={item}>
      <button
        onClick={onClick}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.08] bg-transparent hover:border-primary/25 hover:bg-primary/[0.03] transition-all min-h-[120px] text-white/25 hover:text-primary/60 group"
      >
        <div className="flex size-8 items-center justify-center rounded-xl border border-dashed border-white/[0.12] group-hover:border-primary/25 transition-colors">
          <Plus className="size-4" />
        </div>
        <span className="text-[12px] font-medium">New {label}</span>
      </button>
    </motion.div>
  );
}

// ── Member row ─────────────────────────────────────────────────────────────

function MemberRow({ m }: { m: { user_id: string; display_name: string; email: string; role_name: string } }) {
  const initial = ((m.display_name || m.email)[0] ?? "?").toUpperCase();
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/15 text-[12px] font-black text-primary leading-none">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-white/75 truncate">{m.display_name || m.email}</p>
        <p className="text-[10px] text-white/30 truncate">{m.email}</p>
      </div>
      <span className="shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-white/40">
        {m.role_name}
      </span>
    </div>
  );
}

// ── Main Hub Page ──────────────────────────────────────────────────────────

export function NamespaceHubPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();
  const { hasPermission } = useNamespacePermissions(slug);

  const nsQuery = useQuery({ queryKey: ["namespace", slug], queryFn: () => getNamespace(slug) });
  const envsQuery = useQuery({
    queryKey: ["environments", slug],
    queryFn: () => listEnvironments(slug),
    enabled: !!nsQuery.data,
  });
  const isOrg = nsQuery.data?.type === "org";
  const membersQuery = useQuery({
    queryKey: ["ns-members", slug],
    queryFn: () => listNamespaceMembers(slug),
    enabled: !!nsQuery.data && isOrg && hasPermission("member:view"),
  });
  const profileQuery = useQuery({
    queryKey: ["public-profile", slug],
    queryFn: () => getPublicProfile(slug).catch(() => null),
    enabled: !!nsQuery.data && !isOrg,
    retry: false,
  });

  if (nsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/20" />
      </div>
    );
  }

  if (nsQuery.isError || !nsQuery.data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <FolderOpen className="size-10 text-white/20" />
        <p className="text-sm text-white/40">Namespace not found.</p>
        <Link href="/" className="text-xs text-primary hover:underline">← Home</Link>
      </div>
    );
  }

  const ns = nsQuery.data;
  const envs = envsQuery.data?.environments ?? [];
  const members = membersQuery.data?.members ?? [];
  const previewMembers = members.slice(0, 5);
  const publicProfile = profileQuery.data?.data;
  const initial = (ns.name[0] ?? "?").toUpperCase();

  return (
    <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20 overflow-hidden">

        {/* ── Ambient glow orbs ── */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[32rem] w-[40rem] -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(ellipse, oklch(0.80 0.17 90 / 0.05) 0%, transparent 70%)" }}
        />
        {isOrg && (
          <div className="pointer-events-none absolute top-0 right-0 -z-10 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full"
            style={{ background: "radial-gradient(ellipse, oklch(0.65 0.2 250 / 0.07) 0%, transparent 70%)" }}
          />
        )}

        {/* ── Hero header ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" as const }}
          className="flex items-center justify-between pt-8 pb-6"
        >
          <div className="flex items-center gap-4">
            {!isOrg && publicProfile?.avatar_url ? (
              <img
                src={publicProfile.avatar_url}
                alt={ns.name}
                className="size-12 shrink-0 rounded-2xl border border-white/[0.10] object-cover shadow-lg"
              />
            ) : (
              <div className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl border text-xl font-black shadow-lg",
                isOrg
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-[0_0_24px_oklch(0.65_0.2_250_/_0.12)]"
                  : "bg-primary/10 border-primary/20 text-primary shadow-[0_0_24px_oklch(0.80_0.17_90_/_0.12)]"
              )}>
                {initial}
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">
                {isOrg ? "Organization" : ns.slug}
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-white leading-tight">{ns.name}</h1>
              {(!isOrg && publicProfile?.bio) ? (
                <p className="text-[12px] text-white/35 mt-0.5">{publicProfile.bio}</p>
              ) : ns.description ? (
                <p className="text-[12px] text-white/35 mt-0.5">{ns.description}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOrg && hasPermission("member:view") && (
              <>
                <Link
                  href={`/${slug}/settings/members`}
                  className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
                >
                  <Users className="size-3.5" />
                  Members
                </Link>
                <Link
                  href={`/${slug}/settings/roles`}
                  className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
                >
                  <ShieldCheck className="size-3.5" />
                  Roles
                </Link>
              </>
            )}
            {hasPermission("namespace:manage") && (
              <Link
                href={`/${slug}/settings`}
                className="flex size-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/35 hover:text-white/65 hover:bg-white/[0.07] transition-all"
              >
                <Settings className="size-3.5" />
              </Link>
            )}
          </div>
        </motion.div>

        {/* ── Divider ── */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mb-6" />

        {/* ── Stats row ── */}
        {!envsQuery.isLoading && (
          <div className="flex items-center gap-6 mb-6 px-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white/80">{envs.length}</span>
              <span className="text-[11px] text-white/35 leading-tight">Projects</span>
            </div>
            {isOrg && hasPermission("member:view") && (
              <>
                <div className="h-6 w-px bg-white/[0.07]" />
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-white/80">{members.length}</span>
                  <span className="text-[11px] text-white/35 leading-tight">Members</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Environments / Projects ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Projects</h2>
              {envs.length > 0 && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/30">
                  {envs.length}
                </span>
              )}
            </div>
            {hasPermission("environment:create") && (
              <button
                onClick={() => router.push(`/${slug}/new`)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary/[0.08] border border-primary/[0.15] text-[11px] font-semibold text-primary/70 hover:text-primary hover:bg-primary/[0.14] transition-all"
              >
                <Plus className="size-3" />
                New project
              </button>
            )}
          </div>

          {envsQuery.isLoading ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-12 flex items-center justify-center">
              <Loader2 className="size-4 animate-spin text-white/25" />
            </div>
          ) : envsQuery.isError ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-amber-500/[0.12] bg-amber-500/[0.04] p-14 flex flex-col items-center justify-center gap-4 text-center"
            >
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-amber-500/[0.15] bg-amber-500/[0.07]">
                <ShieldAlert className="size-6 text-amber-400/60" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-white/50">No environments visible</p>
                <p className="text-[12px] text-white/30 mt-1 max-w-xs">
                  You haven&apos;t been invited to any environments yet. Ask the workspace owner to share an invite link with you.
                </p>
              </div>
              <Link
                href="/"
                className="flex items-center gap-1.5 text-[11px] text-amber-400/60 hover:text-amber-400/90 transition-colors"
              >
                ← Back to home
              </Link>
            </motion.div>
          ) : envs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-dashed border-white/[0.08] p-14 flex flex-col items-center justify-center gap-4 text-center"
            >
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                <Rocket className="size-6 text-primary/30" />
                <div className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{ background: "radial-gradient(circle at 30% 20%, oklch(0.80 0.17 90 / 0.08), transparent 70%)" }}
                />
              </div>
              <div>
                <p className="text-[14px] font-medium text-white/45">No projects yet</p>
                <p className="text-[12px] text-white/25 mt-1">Create one to start deploying servers.</p>
              </div>
              {hasPermission("environment:create") && (
                <ShimmerButton onClick={() => router.push(`/${slug}/new`)}>

                  <Plus className="size-3.5" />
                  Create project
                </ShimmerButton>
              )}
            </motion.div>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              {envs.map((env) => (
                <EnvCard key={env.id} env={env} ns={ns} />
              ))}
              {hasPermission("environment:create") && (
                <AddEnvCard label="project" onClick={() => router.push(`/${slug}/new`)} />
              )}
            </motion.div>
          )}
        </div>

        {/* ── Members section (org only, visible to those with member:view) ── */}
        {isOrg && hasPermission("member:view") && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-10 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Members</h2>
                {members.length > 0 && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/30">
                    {members.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasPermission("member:invite") && (
                  <Link
                    href={`/${slug}/settings/members`}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] text-primary/60 hover:text-primary transition-colors"
                  >
                    <Share2 className="size-3" />
                    Invite
                  </Link>
                )}
                {hasPermission("member:view") && (
                  <Link
                    href={`/${slug}/settings/members`}
                    className="text-[11px] text-white/30 hover:text-white/55 transition-colors"
                  >
                    Manage →
                  </Link>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              {membersQuery.isLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="size-4 animate-spin text-white/25" />
                </div>
              ) : previewMembers.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-center">
                  <Users className="size-6 text-white/15" />
                  <p className="text-[12px] text-white/30">No members yet.</p>
                  <Link href={`/${slug}/settings/members`} className="text-[11px] text-primary/60 hover:text-primary transition-colors">
                    Invite someone →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {previewMembers.map((m) => <MemberRow key={m.user_id} m={m} />)}
                  {members.length > 5 && (
                    <Link
                      href={`/${slug}/settings/members`}
                      className="block px-4 py-3 text-center text-[11px] text-primary/55 hover:text-primary transition-colors"
                    >
                      View all {members.length} members →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

  );
}
