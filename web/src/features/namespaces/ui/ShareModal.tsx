"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Link2,
  Copy,
  Check,
  Loader2,
  Send,
  Users,
  Info,
} from "lucide-react";
import {
  createNamespaceInvite,
  listRoles,
  type RoleDTO,
} from "@/lib/api/namespaces";
import { cn } from "@kleffio/ui";
import { toast } from "sonner";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalLabel } from "@/components/ui/Modal";

type Tab = "email" | "link";

function buildInviteUrl(token: string): string {
  return `${window.location.origin}/ns-invite/${token}`;
}

export function ShareModal({
  namespaceSlug,
  environmentSlug,
  environmentId,
  environmentName,
  open,
  onClose,
}: {
  namespaceSlug: string;
  environmentSlug: string;
  environmentId: string;
  environmentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ["roles", namespaceSlug],
    queryFn: () => listRoles(namespaceSlug),
  });
  const roles: RoleDTO[] = rolesQuery.data?.roles ?? [];

  const emailMut = useMutation({
    mutationFn: () =>
      createNamespaceInvite(namespaceSlug, {
        email: email.trim(),
        role_id: roleId || undefined,
        days: 7,
        grant_environment_id: environmentId,
      }),
    onSuccess: () => {
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
    },
    onError: () => toast.error("Failed to send invite"),
  });

  const linkMut = useMutation({
    mutationFn: () =>
      createNamespaceInvite(namespaceSlug, {
        role_id: roleId || undefined,
        max_uses: 10,
        days: 7,
        grant_environment_id: environmentId,
      }),
    onSuccess: (data) => {
      setGeneratedLink(buildInviteUrl(data.token));
    },
    onError: () => toast.error("Failed to generate link"),
  });

  function copyLink() {
    if (!generatedLink) return;
    void navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ModalHeader onClose={onClose}>
        <ModalTitle>Invite to {environmentName}</ModalTitle>
        <ModalDescription>Share access to this environment</ModalDescription>
      </ModalHeader>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4">
        {(["email", "link"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
              tab === t
                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
            )}
          >
            {t === "email" ? <Mail className="size-3.5" /> : <Link2 className="size-3.5" />}
            {t === "email" ? "Email invite" : "Share link"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-3 bg-white/[0.01]">
        {/* Role picker */}
        {roles.length > 0 && (
          <div className="space-y-1.5">
            <ModalLabel>Role</ModalLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setRoleId("")}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                  roleId === ""
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/60 hover:border-white/[0.12]"
                )}
              >
                Default
              </button>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRoleId(r.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                    roleId === r.id
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/60 hover:border-white/[0.12]"
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "email" && (
          <div className="space-y-2">
            <ModalLabel>Email address</ModalLabel>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValidEmail && !emailMut.isPending) {
                    emailMut.mutate();
                  }
                }}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              />
              <button
                onClick={() => emailMut.mutate()}
                disabled={!isValidEmail || emailMut.isPending}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-[12px] font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_16px_oklch(0.80_0.17_90_/_0.2)]"
              >
                {emailMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send
              </button>
            </div>
            <p className="text-[10px] text-white/20">Expires in 7 days · 1 use</p>
          </div>
        )}

        {tab === "link" && (
          <div className="space-y-2">
            {generatedLink ? (
              <>
                <ModalLabel>Invite link</ModalLabel>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-mono text-white/50 truncate select-all">
                    {generatedLink}
                  </div>
                  <button
                    onClick={copyLink}
                    className={cn(
                      "flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-semibold transition-all",
                      copied
                        ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400"
                        : "bg-primary text-black hover:opacity-90 shadow-[0_0_16px_oklch(0.80_0.17_90_/_0.2)]"
                    )}
                  >
                    {copied ? (
                      <><Check className="size-3.5" /> Copied</>
                    ) : (
                      <><Copy className="size-3.5" /> Copy</>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-white/20">Expires in 7 days · up to 10 uses</p>
                <button
                  onClick={() => { setGeneratedLink(null); linkMut.reset(); }}
                  className="text-[11px] text-white/30 hover:text-white/55 transition-colors"
                >
                  Generate new link
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-white/40">
                  Generate a link anyone can use to join this environment. Valid for 7 days, up to 10 uses.
                </p>
                <button
                  onClick={() => linkMut.mutate()}
                  disabled={linkMut.isPending}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-[12px] font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-40 shadow-[0_0_16px_oklch(0.80_0.17_90_/_0.2)]"
                >
                  {linkMut.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  Generate link
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Scope note */}
      <div className="mx-6 mb-3 flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/[0.06] px-3 py-2.5">
        <Info className="size-3.5 text-primary/70 shrink-0 mt-px" />
        <p className="text-[11px] text-primary/70 leading-relaxed">
          This invite only grants access to servers inside{" "}
          <span className="font-semibold text-primary/90">{environmentName}</span>.
        </p>
      </div>

      {/* Footer link */}
      <div className="px-6 pb-5 pt-1">
        <a
          href={`/${namespaceSlug}/${environmentSlug}/access`}
          className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/50 transition-colors"
        >
          <Users className="size-3.5" />
          Manage all members & access
        </a>
      </div>
    </Modal>
  );
}
