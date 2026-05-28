"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, Plus, Users, ArrowRight, Loader2 } from "lucide-react";
import { listNamespaces } from "@/lib/api/namespaces";
import { CreateOrgModal } from "@/features/namespaces/ui/CreateOrgModal";
import { ShimmerButton } from "@/components/ui/ShimmerButton";

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
};

export default function OrganizationsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const namespacesQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
  });

  const orgs = (namespacesQuery.data?.namespaces ?? []).filter((ns) => ns.type === "org");

  return (
    <>
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 pb-20 pt-8">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-64 w-[480px] -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(ellipse, oklch(0.80 0.17 90 / 0.05) 0%, transparent 70%)" }}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Organizations</h1>
            <p className="text-[12px] text-white/35 mt-1">
              Shared workspaces for teams. Each org has its own members, roles, and environments.
            </p>
          </div>
          <ShimmerButton onClick={() => setShowCreate(true)} className="h-8 px-3 text-[11px]">
            <Plus className="size-3.5" />
            New org
          </ShimmerButton>
        </div>

        {/* List */}
        {namespacesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-white/25" />
          </div>
        ) : orgs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-white/[0.08] px-8 py-20 text-center"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/8 shadow-[0_0_24px_oklch(0.65_0.2_250_/_0.10)]">
              <Building2 className="size-6 text-blue-400/70" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white/40">No organizations yet</p>
              <p className="text-[12px] text-white/25 mt-1">Create one to collaborate with a team.</p>
            </div>
            <ShimmerButton onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5" />
              Create your first org
            </ShimmerButton>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className="space-y-2"
          >
            {orgs.map((org) => (
              <motion.div key={org.id} variants={item}>
                <Link
                  href={`/${org.slug}`}
                  className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5 hover:bg-white/[0.045] hover:border-white/[0.14] hover:shadow-[0_0_28px_oklch(0.80_0.17_90_/_0.05)] transition-all duration-200"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-[15px] font-black text-blue-400 shadow-[0_0_16px_oklch(0.65_0.2_250_/_0.10)]">
                    {(org.name[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white/85 group-hover:text-white transition-colors truncate">
                      {org.name}
                    </p>
                    <p className="text-[10px] font-mono text-white/25 truncate mt-0.5">/{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="flex items-center gap-1 text-[10px] text-white/25">
                      <Users className="size-3" />
                    </span>
                    <ArrowRight className="size-3.5 text-white/15 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              </motion.div>
            ))}

            {/* Add card */}
            <motion.div variants={item}>
              <button
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/[0.07] px-4 py-3.5 text-white/25 hover:border-primary/25 hover:text-primary/60 hover:bg-primary/[0.03] transition-all group"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/[0.10] group-hover:border-primary/20 transition-colors">
                  <Plus className="size-4" />
                </div>
                <span className="text-[13px] font-medium">New organization</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>

      <CreateOrgModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
