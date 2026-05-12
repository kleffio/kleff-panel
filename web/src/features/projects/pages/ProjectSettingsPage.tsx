"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2, UserMinus, Shield, Users } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from "@kleffio/ui";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth";
import {
  listProjectMembers,
  listProjectInvites,
  createProjectInvite,
  revokeProjectInvite,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectMemberDTO,
  type ProjectInviteDTO,
} from "@/lib/api/projects";

interface ProjectSettingsPageProps {
  projectID: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  maintainer: "Maintainer",
  developer: "Developer",
  viewer: "Viewer",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  maintainer: "secondary",
  developer: "outline",
  viewer: "outline",
};

function MemberRow({
  member,
  currentUserID,
  canManage,
  projectID,
  onRemoved,
  onRoleChanged,
}: {
  member: ProjectMemberDTO;
  currentUserID: string;
  canManage: boolean;
  projectID: string;
  onRemoved: () => void;
  onRoleChanged: () => void;
}) {
  const removeMut = useMutation({
    mutationFn: () => removeProjectMember(projectID, member.user_id),
    onSuccess: () => {
      toast.success("Member removed.");
      onRemoved();
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to remove member."),
  });

  const roleMut = useMutation({
    mutationFn: (role: string) => updateProjectMemberRole(projectID, member.user_id, role),
    onSuccess: () => {
      toast.success("Role updated.");
      onRoleChanged();
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to update role."),
  });

  const isSelf = member.user_id === currentUserID;
  const displayName = member.display_name || member.email || member.user_id;

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
        {displayName[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        {member.email && member.email !== displayName && (
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        )}
      </div>
      <Badge variant={ROLE_VARIANTS[member.role] ?? "outline"}>
        {ROLE_LABELS[member.role] ?? member.role}
      </Badge>
      {canManage && !isSelf && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Select
            value={member.role}
            onValueChange={(role) => roleMut.mutate(role)}
            disabled={roleMut.isPending}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="developer">Developer</SelectItem>
              <SelectItem value="maintainer">Maintainer</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            disabled={removeMut.isPending}
            onClick={() => removeMut.mutate()}
          >
            {removeMut.isPending ? <Spinner size="xs" /> : <UserMinus className="size-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  projectID,
  onRevoked,
}: {
  invite: ProjectInviteDTO;
  canManage: boolean;
  projectID: string;
  onRevoked: () => void;
}) {
  const revokeMut = useMutation({
    mutationFn: () => revokeProjectInvite(projectID, invite.id),
    onSuccess: () => {
      toast.success("Invite revoked.");
      onRevoked();
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to revoke invite."),
  });

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/50 border border-dashed border-muted-foreground/30">
        <span className="text-xs text-muted-foreground">?</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{invite.invited_email}</p>
        <p className="text-xs text-muted-foreground">
          Pending · expires {new Date(invite.expires_at).toLocaleDateString()}
        </p>
      </div>
      <Badge variant="outline" className="text-muted-foreground">
        {ROLE_LABELS[invite.role] ?? invite.role}
      </Badge>
      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
          disabled={revokeMut.isPending}
          onClick={() => revokeMut.mutate()}
        >
          {revokeMut.isPending ? <Spinner size="xs" /> : <Trash2 className="size-3.5" />}
        </Button>
      )}
    </div>
  );
}

export function ProjectSettingsPage({ projectID }: ProjectSettingsPageProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const currentUserID = (auth.user?.profile?.sub as string | undefined) ?? "";

  const membersKey = ["projects", projectID, "members"] as const;
  const invitesKey = ["projects", projectID, "invites"] as const;

  const { data: membersData, isLoading: membersLoading, isError: membersError } = useQuery({
    queryKey: membersKey,
    queryFn: () => listProjectMembers(projectID),
    enabled: !!projectID,
    retry: false,
  });

  const { data: invitesData, isLoading: invitesLoading } = useQuery({
    queryKey: invitesKey,
    queryFn: () => listProjectInvites(projectID),
    enabled: !!projectID,
  });

  const members = membersData?.members ?? [];
  const invites = invitesData?.invites ?? [];

  const currentMember = members.find((m) => m.user_id === currentUserID);
  const canManage =
    currentMember?.role === "owner" ||
    currentMember?.role === "maintainer";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: () => createProjectInvite(projectID, { email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: invitesKey });
      setInviteEmail("");
      if (res.token) setPendingToken(res.token);
      toast.success("Invite created.");
    },
    onError: (err: Error) => toast.error(err.message ?? "Failed to create invite."),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMut.mutate();
  }

  const inviteURL = pendingToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/project-invite/${pendingToken}`
    : null;

  function copyInviteURL() {
    if (inviteURL) {
      navigator.clipboard.writeText(inviteURL);
      toast.success("Invite link copied.");
    }
  }

  return (
    <div className="max-w-2xl space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage who has access to this environment.
        </p>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Members
          </CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : membersError ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Failed to load members.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  currentUserID={currentUserID}
                  canManage={canManage}
                  projectID={projectID}
                  onRemoved={() => queryClient.invalidateQueries({ queryKey: membersKey })}
                  onRoleChanged={() => queryClient.invalidateQueries({ queryKey: membersKey })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite form (owners + maintainers only) */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4" />
              Invite someone
            </CardTitle>
            <CardDescription>
              Send an invite link to add a new environment member.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleInvite} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger id="invite-role" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="maintainer">Maintainer</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={!inviteEmail.trim() || inviteMut.isPending}>
                {inviteMut.isPending ? <Spinner size="xs" className="mr-1.5" /> : null}
                {inviteMut.isPending ? "Creating…" : "Create invite"}
              </Button>
            </form>

            {pendingToken && inviteURL && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Share this link — it expires in 7 days and can only be viewed once.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={inviteURL}
                    className="font-mono text-xs h-7"
                  />
                  <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={copyInviteURL}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground px-1"
                  onClick={() => setPendingToken(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending invites */}
      {canManage && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>{invites.length} pending</CardDescription>
          </CardHeader>
          <CardContent>
            {invitesLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {invites.map((inv) => (
                  <InviteRow
                    key={inv.id}
                    invite={inv}
                    canManage={canManage}
                    projectID={projectID}
                    onRevoked={() => queryClient.invalidateQueries({ queryKey: invitesKey })}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
