"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import { resolveNsInvite, acceptNsInvite } from "@/lib/api/namespaces";
import { isApiError } from "@/lib/api";

export function NsInviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const resolveQuery = useQuery({
    queryKey: ["ns-invite", token],
    queryFn: () => resolveNsInvite(token),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptNsInvite(token),
    onSuccess: async () => {
      const slug = resolveQuery.data?.namespace_slug ?? "";
      const envSlug = resolveQuery.data?.grant_environment_slug;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["namespaces"] }),
        qc.invalidateQueries({ queryKey: ["environments", slug] }),
        qc.invalidateQueries({ queryKey: ["ns-members", slug] }),
        qc.invalidateQueries({ queryKey: ["ns-invites", slug] }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
        qc.invalidateQueries({ queryKey: ["shared-projects"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["namespaces"] });
      router.push(envSlug ? `/${slug}/${envSlug}` : `/${slug}`);
    },
    onError: (err: unknown) => {
      // 410 = expired or already accepted; redirect only if resolve succeeded
      const status = isApiError(err) ? err.status : (err as { status?: number })?.status;
      if (status === 410) {
        const slug = resolveQuery.data?.namespace_slug ?? "";
        if (slug) router.push(`/${slug}`);
      }
    },
  });

  useEffect(() => {
    if (resolveQuery.data && !acceptMut.isPending && !acceptMut.isSuccess && !acceptMut.isError) {
      acceptMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveQuery.data]);

  if (resolveQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle className="size-6 text-rose-400" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-white">Invalid invite</p>
            <p className="text-[13px] text-white/40 mt-1">
              This invite link is expired, revoked, or has already been used.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const acceptError = acceptMut.error;
  const acceptErrStatus = isApiError(acceptError)
    ? acceptError.status
    : (acceptError as { status?: number } | null)?.status;

  if (acceptMut.isError && acceptErrStatus !== 410) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <AlertTriangle className="size-6 text-rose-400" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-white">Could not accept invite</p>
            <p className="text-[13px] text-white/40 mt-1">
              The invite may have expired or already been used.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center">
        <div className="h-96 w-96 rounded-full bg-primary/6 blur-[120px]" />
      </div>
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="size-6 animate-spin text-white/30" />
        <div>
          <p className="text-sm font-medium text-white/70">
            {resolveQuery.data?.namespace_name
              ? `Joining ${resolveQuery.data.namespace_name}…`
              : "Joining…"}
          </p>
          <p className="text-[12px] text-white/30 mt-0.5">Setting up your access</p>
        </div>
      </div>
    </div>
  );
}
