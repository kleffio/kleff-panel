"use client";

import * as React from "react";
import {
  BellRing,
  Building2,
  ChevronRight,
  Cpu,
  HardDrive,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users2,
  Zap,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Progress,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@kleffio/ui";
import { useAdminDashboard } from "@/features/admin/hooks/useAdminDashboard";
import { roleOptions, requestTypeFilters, requestStatusFilters, incidentActions } from "@/features/admin/model/constants";
import { metricTone, memberStatusVariant, auditTone, requestStatusVariant } from "@/features/admin/lib/utils";
import type { OrgSettingsData } from "@/features/admin/server/loaders";

export function AdminDashboard({ initialData }: { initialData: OrgSettingsData }) {
  const {
    name, setName,
    ramLimit, setRamLimit,
    members,
    isPending,
    inviteEmail, setInviteEmail,
    inviteRole, setInviteRole,
    maintenanceMode, setMaintenanceMode,
    sessionLockdown, setSessionLockdown,
    auditWebhook, setAuditWebhook,
    pendingIncidentAction, setPendingIncidentAction,
    activeTab, setActiveTab,
    requestTypeFilter, setRequestTypeFilter,
    requestStatusFilter, setRequestStatusFilter,
    seatUsage, ramUsage,
    pendingRequestCount, filteredRequests,
    handleQuickAction, handleSave, handleInvite,
    handleMemberAction, handleRequestAction,
  } = useAdminDashboard(initialData);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{initialData.plan}</Badge>
            <Badge variant="secondary">{pendingRequestCount} approvals waiting</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Admin Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Run organization operations, manage access, and tune resource policy from one place.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              handleQuickAction(
                "Directory sync started",
                "Provisioning changes will settle in a few seconds."
              )
            }
          >
            <Sparkles />
            Sync Directory
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <UserPlus />
                Invite Admin
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Invite a new operator</SheetTitle>
                <SheetDescription>
                  Stage an admin, finance, or support invite using the shared button workflow.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4">
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="invite-email"
                  >
                    Email
                  </label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="operator@kleff.io"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Role</p>
                  <div className="flex flex-wrap gap-2">
                    {roleOptions.map((role) => (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant={inviteRole === role ? "default" : "outline"}
                        onClick={() => setInviteRole(role)}
                      >
                        {role}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setInviteEmail("")}>
                  Reset
                </Button>
                <Button onClick={handleInvite}>Send Invite</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Button
            onClick={handleSave}
            disabled={
              isPending ||
              (name === initialData.orgName && ramLimit === initialData.ramLimit)
            }
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Alert variant="warning">
        <BellRing className="size-4" />
        <AlertTitle>Access review needs attention</AlertTitle>
        <AlertDescription>
          Two operators still do not have MFA enabled, and one RAM increase request is waiting on
          approval.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Security score</CardDescription>
            <CardTitle className={`text-3xl ${metricTone(initialData.securityScore)}`}>
              {initialData.securityScore}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Session hardening, MFA coverage, and audit hooks are healthy.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Seat usage</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {initialData.seatsUsed}/{initialData.seatsTotal}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={seatUsage} />
            <p className="text-sm text-muted-foreground">
              Four seats remain before role provisioning slows down.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active environments</CardDescription>
            <CardTitle className="text-3xl text-foreground">
              {initialData.activeProjects}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Three deployments are currently consuming shared admin limits.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Approvals queue</CardDescription>
            <CardTitle className="text-3xl text-foreground">{pendingRequestCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" onClick={() => setActiveTab("requests")}>
              Review queue
              <ChevronRight />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-muted text-foreground">
                    <Building2 className="size-5" />
                  </div>
                  <div>
                    <CardTitle>Organization profile</CardTitle>
                    <CardDescription>
                      Core settings and billing contact for the workspace.
                    </CardDescription>
                  </div>
                </div>
                <CardAction>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      handleQuickAction(
                        "Profile snapshot captured",
                        "A secure change log entry has been created."
                      )
                    }
                  >
                    Snapshot
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="org-name">
                    Organization name
                  </label>
                  <Input
                    id="org-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="billing-email"
                  >
                    Billing email
                  </label>
                  <Input
                    id="billing-email"
                    type="email"
                    value={initialData.billingEmail}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Escalation owner</p>
                  <div className="flex h-8 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">
                    aida@kleff.io
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-muted text-foreground">
                    <Cpu className="size-5" />
                  </div>
                  <div>
                    <CardTitle>Capacity policy</CardTitle>
                    <CardDescription>
                      Shared memory ceiling and automation toggles.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">Max RAM limit</span>
                    <span className="text-muted-foreground">{ramLimit} GB</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="256"
                    step="8"
                    value={ramLimit}
                    onChange={(e) => setRamLimit(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <HardDrive className="size-4 text-muted-foreground" />
                        Current usage
                      </span>
                      <span className="text-muted-foreground">
                        {initialData.ramUsed} / {ramLimit} GB
                      </span>
                    </div>
                    <Progress value={ramUsage} />
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Maintenance mode</p>
                      <p className="text-xs text-muted-foreground">
                        Freeze deployments while policy changes roll out.
                      </p>
                    </div>
                    <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardHeader>
                <CardTitle>Pending invites</CardTitle>
                <CardDescription>
                  People who have been staged but have not accepted access yet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {initialData.pendingInvites.map((invite) => (
                  <div key={invite.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">{invite.sentAt}</p>
                      </div>
                      <Badge variant="outline">{invite.role}</Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          handleQuickAction(
                            "Invite resent",
                            `A fresh link was sent to ${invite.email}.`
                          )
                        }
                      >
                        Resend
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          handleQuickAction(
                            "Invite revoked",
                            `${invite.email} was removed from the queue.`
                          )
                        }
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit stream</CardTitle>
                <CardDescription>Recent admin actions and policy events.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {initialData.auditTrail.map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-lg border border-border border-l-4 p-3 ${auditTone(
                      event.severity
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                      </div>
                      <Badge
                        variant={event.severity === "critical" ? "destructive" : "outline"}
                      >
                        {event.severity}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{event.time}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team access</CardTitle>
              <CardDescription>
                Review roles, check MFA, and take action on individual operators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={memberStatusVariant(member.status)}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.mfaEnabled ? "Enabled" : "Missing"}</TableCell>
                      <TableCell className="text-muted-foreground">{member.lastSeen}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Actions for ${member.name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Member actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleMemberAction(member, "Review access")}
                            >
                              Review access
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleMemberAction(member, "Reset session")}
                            >
                              Reset session
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleMemberAction(member, "Suspend")}
                            >
                              Suspend
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Role coverage</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground">Owners</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">1</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground">Admins</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">2</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground">Finance + Support</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">2</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full justify-start"
                  onClick={() =>
                    handleQuickAction(
                      "Access review started",
                      "Quarterly review workspace opened."
                    )
                  }
                >
                  <Users2 />
                  Run access review
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    handleQuickAction(
                      "Session reset staged",
                      "All non-owner admin sessions will refresh."
                    )
                  }
                >
                  <Zap />
                  Refresh admin sessions
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() =>
                    handleQuickAction(
                      "Webhook test sent",
                      "Audit sink acknowledged the payload."
                    )
                  }
                >
                  <ShieldCheck />
                  Test audit webhook
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
              <CardDescription>
                Review admin requests with quick filters before approving or rejecting them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {requestTypeFilters.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={requestTypeFilter === f ? "default" : "outline"}
                      onClick={() => setRequestTypeFilter(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {requestStatusFilters.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={requestStatusFilter === f ? "secondary" : "outline"}
                      onClick={() => setRequestStatusFilter(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{request.title}</p>
                            <p className="text-xs text-muted-foreground">{request.detail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {request.requestedBy}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {request.submittedAt}
                        </TableCell>
                        <TableCell>
                          <Badge variant={requestStatusVariant(request.status)}>
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === "Pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRequestAction(request, "Rejected")}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRequestAction(request, "Approved")}
                              >
                                Approve
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Resolved</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No requests match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle>Security posture</CardTitle>
                <CardDescription>
                  Hardening toggles for admin and platform controls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Session lockdown</p>
                    <p className="text-xs text-muted-foreground">
                      Force step-up verification on sensitive changes.
                    </p>
                  </div>
                  <Switch checked={sessionLockdown} onCheckedChange={setSessionLockdown} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Block unverified finance access
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Require MFA before invoice or payout actions are visible.
                    </p>
                  </div>
                  <Switch
                    checked={true}
                    onCheckedChange={() =>
                      handleQuickAction(
                        "Policy confirmed",
                        "Finance scope already requires verified access."
                      )
                    }
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="audit-webhook"
                  >
                    Audit webhook
                  </label>
                  <Input
                    id="audit-webhook"
                    value={auditWebhook}
                    onChange={(e) => setAuditWebhook(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleQuickAction(
                          "Webhook verified",
                          "The endpoint responded with a signed acknowledgement."
                        )
                      }
                    >
                      Verify endpoint
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setAuditWebhook("https://hooks.kleff.io/audit/admin")
                      }
                    >
                      Restore default
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Incident controls</CardTitle>
                <CardDescription>
                  Fast actions when the admin plane needs to be tightened quickly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert variant="info">
                  <ShieldCheck className="size-4" />
                  <AlertTitle>Audit delivery is healthy</AlertTitle>
                  <AlertDescription>
                    Last signed event reached your sink 43 seconds ago.
                  </AlertDescription>
                </Alert>
                <div className="grid gap-2 sm:grid-cols-2">
                  {incidentActions.map((action) => (
                    <HoverCard key={action.buttonLabel} openDelay={120}>
                      <HoverCardTrigger asChild>
                        <Button
                          variant={action.tone}
                          onClick={() => setPendingIncidentAction(action)}
                        >
                          {action.buttonLabel}
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start">
                        <p className="font-medium text-foreground">{action.buttonLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {action.hoverDescription}
                        </p>
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                </div>
                <AlertDialog
                  open={pendingIncidentAction !== null}
                  onOpenChange={(open) => !open && setPendingIncidentAction(null)}
                >
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm incident action</AlertDialogTitle>
                      <AlertDialogDescription>
                        {pendingIncidentAction
                          ? `Only continue if you need to ${pendingIncidentAction.buttonLabel.toLowerCase()} right now.`
                          : ""}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant={
                          pendingIncidentAction?.tone === "destructive"
                            ? "destructive"
                            : "default"
                        }
                        onClick={() => {
                          if (!pendingIncidentAction) return;
                          handleQuickAction(
                            pendingIncidentAction.successLabel,
                            pendingIncidentAction.successDescription
                          );
                          setPendingIncidentAction(null);
                        }}
                      >
                        {pendingIncidentAction?.confirmLabel ?? "Confirm"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Policy recommendations</CardTitle>
              <CardDescription>
                Small changes that would improve operational resilience quickly.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">Require MFA for finance</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  One finance-scoped operator is still missing a second factor.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">Tighten RAM approvals</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current policy allows same-day changes without owner sign-off.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">Expand owner coverage</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A second owner would reduce incident escalation bottlenecks.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
