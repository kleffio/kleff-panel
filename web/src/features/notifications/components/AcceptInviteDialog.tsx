"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderGit2, AlertCircle } from "lucide-react";
import { Button, Badge } from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";
import { resolveProjectInvite, acceptProjectInvite } from "@/lib/api/projects";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody } from "@/components/ui/Modal";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  maintainer: "Maintainer",
  developer: "Developer",
  viewer: "Viewer",
};

interface Props {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted?: () => void;
}

export function AcceptInviteDialog({ token, open, onOpenChange, onAccepted }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-invite", token],
    queryFn: () => resolveProjectInvite(token),
    enabled: open && !!token,
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptProjectInvite(token),
    onSuccess: () => {
      toast.success(`Welcome to ${data?.project_name ?? "the environment"}!`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      onAccepted?.();
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to accept invite."),
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm">
      {isLoading ? (
        <>
          <ModalHeader onClose={() => onOpenChange(false)}>
            <ModalTitle>Environment invite</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          </ModalBody>
        </>
      ) : isError || !data ? (
        <>
          <ModalHeader onClose={() => onOpenChange(false)}>
            <ModalTitle>Invalid invite</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertCircle className="size-10 text-destructive" />
              <p className="text-sm font-medium text-white/70">
                This invite link is invalid or has expired.
              </p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </ModalBody>
        </>
      ) : (
        <>
          <ModalHeader onClose={() => onOpenChange(false)}>
            <ModalTitle>You&apos;ve been invited</ModalTitle>
            <ModalDescription>
              Join environment{" "}
              <span className="font-medium text-white/70">
                {data.project_name ?? data.project_id}
              </span>
            </ModalDescription>
          </ModalHeader>

          <ModalBody>
            <div className="flex flex-col items-center gap-3 text-center pt-1 pb-2">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/15">
                <FolderGit2 className="size-5 text-primary" />
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Environment</span>
                <span className="font-medium text-white/80">{data.project_name ?? data.project_id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Role</span>
                <Badge variant="outline">{ROLE_LABELS[data.role] ?? data.role}</Badge>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                className="w-full"
                onClick={() => acceptMut.mutate()}
                disabled={acceptMut.isPending}
              >
                {acceptMut.isPending && <Spinner size="xs" className="mr-1.5" />}
                {acceptMut.isPending ? "Joining…" : "Accept invite"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Decline
              </Button>
            </div>
          </ModalBody>
        </>
      )}
    </Modal>
  );
}
