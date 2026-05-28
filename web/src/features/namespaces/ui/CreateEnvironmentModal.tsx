"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createEnvironment } from "@/lib/api/namespaces";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalLabel } from "@/components/ui/Modal";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Props {
  namespaceSlug: string;
  open: boolean;
  onClose: () => void;
}

export function CreateEnvironmentModal({ namespaceSlug, open, onClose }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      createEnvironment(namespaceSlug, {
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || undefined,
        is_private: isPrivate,
      }),
    onSuccess: (env) => {
      qc.invalidateQueries({ queryKey: ["environments", namespaceSlug] });
      onClose();
      router.push(`/${namespaceSlug}/${env.slug}`);
    },
  });

  function handleClose() {
    if (!createMut.isPending) onClose();
  }

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <ModalHeader onClose={handleClose}>
        <ModalTitle>New environment</ModalTitle>
        <ModalDescription>Create an isolated deployment environment.</ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-1.5">
          <ModalLabel>Name</ModalLabel>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMut.mutate(); }}
            placeholder="Production"
            className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <ModalLabel>
            Description <span className="normal-case text-white/25 tracking-normal font-normal">(optional)</span>
          </ModalLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe what lives here…"
            className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40 resize-none transition-colors"
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
            <span className="block text-[13px] font-medium text-white/80">Private</span>
            <span className="block text-[11px] text-white/30 mt-0.5">Only namespace members can view it.</span>
          </span>
        </label>

        {createMut.isError && (
          <p className="text-[12px] text-rose-400 bg-rose-500/[0.08] border border-rose-500/[0.15] rounded-lg px-3 py-2">
            Failed to create environment. The slug may already be taken.
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleClose}
          disabled={createMut.isPending}
          className="h-9 px-4 rounded-lg text-[12px] font-semibold text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || createMut.isPending}
          className="flex items-center gap-1.5 h-9 px-5 rounded-lg bg-primary text-[12px] font-semibold text-black hover:opacity-90 disabled:opacity-40 transition-all"
        >
          {createMut.isPending && <Loader2 className="size-3 animate-spin" />}
          Create environment
        </button>
      </ModalFooter>
    </Modal>
  );
}
