"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, AlertCircle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";
import { resolveInvite, acceptInvite } from "@/lib/api/organizations";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => resolveInvite(token),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: () => {
      toast.success(`Welcome to ${data?.org_name ?? "the organization"}!`);
      router.push("/");
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to accept invite."),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm font-medium">This invite link is invalid or has expired.</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>
              Go home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm animate-in fade-in duration-300">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/15">
            <Users className="size-5 text-primary" />
          </div>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Join <span className="font-semibold text-foreground">{data.org_name}</span> as a team member.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Organization</span>
              <span className="font-medium">{data.org_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline">{ROLE_LABELS[data.role] ?? data.role}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invited by</span>
              <span className="font-medium">{data.invited_by}</span>
            </div>
          </div>

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
            onClick={() => router.push("/")}
          >
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
