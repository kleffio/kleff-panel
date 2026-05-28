"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Building2, CheckCircle2, XCircle } from "lucide-react";
import { createNamespace, checkSlugAvailable } from "@/lib/api/namespaces";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { toast } from "sonner";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalLabel } from "@/components/ui/Modal";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

interface Props {
  open?: boolean;
  onClose: () => void;
}

export function CreateOrgModal({ open = true, onClose }: Props) {
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [debouncedSlug, setDebouncedSlug] = useState("");
  const router = useRouter();
  const qc = useQueryClient();

  const derivedSlug = slugOverride || slugify(name);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSlug(derivedSlug), 350);
    return () => clearTimeout(t);
  }, [derivedSlug]);

  const slugCheck = useQuery({
    queryKey: ["slug-check", debouncedSlug],
    queryFn: () => checkSlugAvailable(debouncedSlug),
    enabled: debouncedSlug.length > 0,
    staleTime: 10_000,
  });

  const slugTaken = slugCheck.data?.available === false;
  const slugChecking = debouncedSlug !== derivedSlug || slugCheck.isFetching;

  const mut = useMutation({
    mutationFn: () =>
      createNamespace({ name: name.trim(), slug: derivedSlug || undefined, type: "org" }),
    onSuccess: (ns) => {
      void qc.invalidateQueries({ queryKey: ["namespaces"] });
      toast.success(`Organization "${ns.name}" created`);
      router.push(`/${ns.slug}`);
      onClose();
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        toast.error("That slug is already taken — choose a different one");
      } else {
        toast.error("Failed to create organization");
      }
    },
  });

  const canSubmit = name.trim().length > 0 && !mut.isPending && !slugTaken && !slugChecking;

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} size="sm">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
            <Building2 className="size-4 text-blue-400" />
          </div>
          <div>
            <ModalTitle>New organization</ModalTitle>
            <ModalDescription>Shared namespace for a team</ModalDescription>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-1.5">
          <ModalLabel>Name</ModalLabel>
          <input
            autoFocus
            type="text"
            placeholder="Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) mut.mutate(); }}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <ModalLabel>
            URL slug <span className="font-normal normal-case tracking-normal text-white/20">(auto)</span>
          </ModalLabel>
          <input
            type="text"
            placeholder={derivedSlug || "acme-corp"}
            value={slugOverride}
            onChange={(e) => setSlugOverride(slugify(e.target.value))}
            className={`w-full rounded-xl border bg-white/[0.04] px-3 py-2 text-[13px] font-mono text-white/80 placeholder:text-white/20 outline-none focus:ring-1 transition-all ${
              slugTaken
                ? "border-rose-500/40 focus:border-rose-500/50 focus:ring-rose-500/20"
                : "border-white/[0.08] focus:border-primary/40 focus:ring-primary/20"
            }`}
          />
          {debouncedSlug.length > 0 && (
            <div className="flex items-center gap-1.5 min-h-[16px]">
              {slugChecking ? (
                <Loader2 className="size-3 animate-spin text-white/25" />
              ) : slugTaken ? (
                <>
                  <XCircle className="size-3 text-rose-400/70" />
                  <span className="text-[11px] text-rose-400/70">Slug already taken</span>
                </>
              ) : slugCheck.data?.available ? (
                <>
                  <CheckCircle2 className="size-3 text-emerald-400/70" />
                  <span className="text-[11px] text-emerald-400/70">Available</span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={onClose}
          className="h-9 px-4 rounded-lg text-[12px] font-semibold text-white/40 hover:text-white/65 transition-colors"
        >
          Cancel
        </button>
        <ShimmerButton onClick={() => mut.mutate()} disabled={!canSubmit} className="h-9 px-4">
          {mut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />}
          Create
        </ShimmerButton>
      </ModalFooter>
    </Modal>
  );
}
