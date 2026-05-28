"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Plus, Eye, EyeOff, Trash2, Pencil, X, Check, Loader2 } from "lucide-react";
import {
  listVariables,
  createVariable,
  updateVariable,
  deleteVariable,
  type VariableDTO,
} from "@/lib/api/variables";
import { cn } from "@kleffio/ui";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
};

// ── Inline edit row ────────────────────────────────────────────────────────────

function EditRow({
  variable,
  nsSlug,
  envSlug,
  onDone,
}: {
  variable: VariableDTO;
  nsSlug: string;
  envSlug: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [key, setKey] = useState(variable.key);
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(variable.is_secret);
  const [showVal, setShowVal] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      updateVariable(nsSlug, envSlug, variable.id, {
        key,
        ...(value !== "" ? { value } : {}),
        is_secret: isSecret,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variables", nsSlug, envSlug] });
      onDone();
    },
  });

  return (
    <tr className="bg-white/[0.03]">
      <td className="px-4 py-2">
        <input
          className="w-full bg-transparent text-[13px] font-mono text-white/80 border-b border-white/20 focus:border-primary/50 outline-none py-0.5"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="KEY"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type={showVal ? "text" : "password"}
            className="flex-1 bg-transparent text-[13px] font-mono text-white/80 border-b border-white/20 focus:border-primary/50 outline-none py-0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={variable.is_secret ? "leave blank to keep current" : "value"}
          />
          <button onClick={() => setShowVal((v) => !v)} className="text-white/25 hover:text-white/50">
            {showVal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        <button
          onClick={() => setIsSecret((s) => !s)}
          className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-colors", isSecret
            ? "border-amber-500/30 text-amber-400/70 bg-amber-500/10"
            : "border-white/10 text-white/30")}
        >
          {isSecret ? "secret" : "plain"}
        </button>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !key.trim()}
            className="flex items-center gap-1 h-6 px-2 rounded-md bg-primary/15 border border-primary/25 text-[11px] text-primary/80 hover:bg-primary/20 disabled:opacity-40 transition-all"
          >
            {mut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Save
          </button>
          <button onClick={onDone} className="text-white/25 hover:text-white/50">
            <X className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Variable row ───────────────────────────────────────────────────────────────

function VarRow({
  variable,
  nsSlug,
  envSlug,
}: {
  variable: VariableDTO;
  nsSlug: string;
  envSlug: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const delMut = useMutation({
    mutationFn: () => deleteVariable(nsSlug, envSlug, variable.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variables", nsSlug, envSlug] }),
  });

  if (editing) {
    return <EditRow variable={variable} nsSlug={nsSlug} envSlug={envSlug} onDone={() => setEditing(false)} />;
  }

  return (
    <motion.tr
      variants={item}
      className="group border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
    >
      <td className="px-4 py-3 font-mono text-[13px] text-white/80">{variable.key}</td>
      <td className="px-4 py-3 font-mono text-[13px] text-white/50">
        {variable.is_secret ? (
          <span className="text-white/20">••••••••</span>
        ) : (
          variable.value || <span className="text-white/20 italic">empty</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {variable.is_secret && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/25 text-amber-400/60 bg-amber-500/[0.08]">
            secret
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="text-white/25 hover:text-white/60 transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => delMut.mutate()}
            disabled={delMut.isPending}
            className="text-white/20 hover:text-rose-400/70 transition-colors"
          >
            {delMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

// ── Add variable row ───────────────────────────────────────────────────────────

function AddVariableRow({ nsSlug, envSlug, onDone }: { nsSlug: string; envSlug: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [showVal, setShowVal] = useState(false);

  const mut = useMutation({
    mutationFn: () => createVariable(nsSlug, envSlug, { key, value, is_secret: isSecret }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variables", nsSlug, envSlug] });
      onDone();
    },
  });

  return (
    <tr className="bg-primary/[0.04] border-b border-primary/10">
      <td className="px-4 py-2.5">
        <input
          autoFocus
          className="w-full bg-transparent text-[13px] font-mono text-white/80 border-b border-primary/30 focus:border-primary/60 outline-none py-0.5 placeholder:text-white/20"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="KEY"
          onKeyDown={(e) => e.key === "Enter" && key.trim() && mut.mutate()}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type={showVal ? "text" : "password"}
            className="flex-1 bg-transparent text-[13px] font-mono text-white/80 border-b border-primary/30 focus:border-primary/60 outline-none py-0.5 placeholder:text-white/20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => e.key === "Enter" && key.trim() && mut.mutate()}
          />
          <button onClick={() => setShowVal((v) => !v)} className="text-white/25 hover:text-white/50">
            {showVal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={() => setIsSecret((s) => !s)}
          className={cn("text-[11px] px-2 py-0.5 rounded-full border transition-colors", isSecret
            ? "border-amber-500/30 text-amber-400/70 bg-amber-500/10"
            : "border-white/10 text-white/30 hover:border-white/20")}
        >
          {isSecret ? "secret" : "plain"}
        </button>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !key.trim()}
            className="flex items-center gap-1 h-6 px-2 rounded-md bg-primary/15 border border-primary/25 text-[11px] text-primary/80 hover:bg-primary/20 disabled:opacity-40 transition-all interactive-glow"
          >
            {mut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add
          </button>
          <button onClick={onDone} className="text-white/25 hover:text-white/50">
            <X className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VariablesPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();
  const [adding, setAdding] = useState(false);

  const query = useQuery({
    queryKey: ["variables", slug, environment],
    queryFn: () => listVariables(slug, environment),
    staleTime: 30_000,
  });

  const variables = query.data?.variables ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white/90">Variables</h1>
          <p className="text-[13px] text-white/35 mt-0.5">Environment variables and secrets</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-medium text-primary/80 hover:bg-primary/15 hover:border-primary/30 transition-all interactive-glow"
          >
            <Plus className="size-3.5" />
            New variable
          </button>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-white/20" />
        </div>
      ) : variables.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <KeyRound className="size-5 text-white/20" />
          </div>
          <p className="text-sm font-medium text-white/40">No variables yet</p>
          <p className="text-[12px] text-white/25 mt-1">
            Add environment variables and secrets for this environment
          </p>
          <button
            onClick={() => setAdding(true)}
            className="mt-4 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] text-[12px] font-medium text-white/40 hover:text-white/60 hover:border-white/[0.13] transition-all"
          >
            <Plus className="size-3.5" />
            New variable
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-4 py-2.5 text-left label-dense w-1/3">Key</th>
                <th className="px-4 py-2.5 text-left label-dense">Value</th>
                <th className="px-4 py-2.5 text-center label-dense w-20">Type</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <motion.tbody variants={container} initial="hidden" animate="show">
              <AnimatePresence>
                {variables.map((v) => (
                  <VarRow key={v.id} variable={v} nsSlug={slug} envSlug={environment} />
                ))}
              </AnimatePresence>
              {adding && (
                <AddVariableRow
                  nsSlug={slug}
                  envSlug={environment}
                  onDone={() => setAdding(false)}
                />
              )}
            </motion.tbody>
          </table>
          {!adding && variables.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.04]">
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/55 transition-colors"
              >
                <Plus className="size-3.5" />
                Add variable
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
