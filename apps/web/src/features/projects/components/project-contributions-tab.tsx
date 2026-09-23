import { useMemo, useState } from "react";
import type {
  IProjectMember,
  ProjectContributionActor,
  ProjectContributionProposal,
  ProjectContributionRole,
} from "@trend/shared-types";
import { Check, Clock3, FileCheck2, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectContributions,
  useProposeProjectContribution,
  useResolveProjectContribution,
} from "../hooks/use-projects";

const roleLabels: Record<ProjectContributionRole, string> = {
  SUPERVISION: "Supervision",
  METHODOLOGY: "Methodology",
  VALIDATION: "Validation",
  SOFTWARE: "Software",
  CONCEPTUALIZATION: "Conceptualization",
  WRITING_ORIGINAL_DRAFT: "Writing - original draft",
  WRITING_REVIEW_EDITING: "Writing - review and editing",
  PROJECT_ADMINISTRATION: "Project administration",
  OTHER: "Other",
};

const roles = Object.keys(roleLabels) as ProjectContributionRole[];
const actorId = (actor: string | ProjectContributionActor) => typeof actor === "string" ? actor : actor._id;
const actorName = (actor: string | ProjectContributionActor) => typeof actor === "string" ? actor : actor.fullName || actor.email || actor._id;
const memberActor = (member: IProjectMember) => typeof member.targetId === "string" ? undefined : member.targetId;
const memberId = (member: IProjectMember) => typeof member.targetId === "string" ? member.targetId : member.targetId._id;

function statusBadge(status: ProjectContributionProposal["status"]) {
  if (status === "CONFIRMED") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">Verified</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending confirmation</Badge>;
}

export function ProjectContributionsTab({
  projectId,
  ownerId,
  members,
  currentUserId,
}: {
  projectId: string;
  ownerId: string;
  members: IProjectMember[];
  currentUserId?: string;
}) {
  const { data = [], isLoading, isError, refetch } = useProjectContributions(projectId);
  const propose = useProposeProjectContribution(projectId);
  const confirm = useResolveProjectContribution(projectId, "confirm");
  const reject = useResolveProjectContribution(projectId, "reject");
  const [open, setOpen] = useState(false);
  const [contributorId, setContributorId] = useState(currentUserId ?? "");
  const [selectedRoles, setSelectedRoles] = useState<ProjectContributionRole[]>([]);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const ownerIds = useMemo(() => new Set([ownerId, ...members.filter((member) => member.role === "owner").map(memberId)]), [members, ownerId]);

  const reset = () => {
    setContributorId(currentUserId ?? "");
    setSelectedRoles([]);
    setDescription("");
    setEvidence("");
  };

  const submitProposal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contributorId || selectedRoles.length === 0) return;
    try {
      await propose.mutateAsync({ contributorId, roles: selectedRoles, description, evidence: evidence || undefined });
      toast.success("Contribution proposal created");
      setOpen(false);
      reset();
    } catch {
      toast.error("Could not create the contribution proposal");
    }
  };

  const canResolve = (proposal: ProjectContributionProposal) => {
    if (!currentUserId || proposal.status !== "PENDING_CONFIRMATION" || actorId(proposal.proposedBy) === currentUserId) return false;
    return proposal.confirmationRequiredFrom === "OWNER"
      ? ownerIds.has(currentUserId)
      : actorId(proposal.contributorId) === currentUserId;
  };

  const resolve = async (proposalId: string, action: "confirm" | "reject") => {
    try {
      await (action === "confirm" ? confirm : reject).mutateAsync({ proposalId });
      toast.success(action === "confirm" ? "Contribution confirmed" : "Contribution rejected");
    } catch {
      toast.error("Could not resolve this contribution proposal");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Research contributions</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Record CRediT-aligned work with explicit confirmation from the contributor or a project owner.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Propose contribution</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Propose project contribution</DialogTitle>
              <DialogDescription>The proposal is not verified until the required counterparty confirms it.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitProposal} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="contribution-member">Contributor</Label>
                <select
                  id="contribution-member"
                  value={contributorId}
                  onChange={(event) => setContributorId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                >
                  <option value="">Select a project member</option>
                  {members.map((member) => <option key={memberId(member)} value={memberId(member)}>{memberActor(member)?.fullName || memberActor(member)?.email || memberId(member)}</option>)}
                </select>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Contribution roles</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label key={role} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))}
                        className="h-4 w-4 rounded border-input"
                      />
                      {roleLabels[role]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="contribution-description">Description</Label>
                <textarea id="contribution-description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={5000} required className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <p className="text-xs text-muted-foreground">Describe the actual work performed. Confirmation does not grant authorship.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contribution-evidence">Evidence or reference (optional)</Label>
                <Input id="contribution-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={5000} placeholder="Revision, artifact, meeting record, or other traceable evidence" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={propose.isPending || !contributorId || selectedRoles.length === 0 || description.trim().length < 20}>{propose.isPending ? "Creating..." : "Create proposal"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">Could not load project contributions. <Button variant="link" className="h-auto p-0 text-destructive underline" onClick={() => refetch()}>Try again</Button></div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No contribution records yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Propose roles when project work is traceable enough for another involved party to confirm.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((proposal) => (
            <article key={proposal._id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{actorName(proposal.contributorId)}</h3>
                    {statusBadge(proposal.status)}
                    {proposal.status === "CONFIRMED" ? <ShieldCheck className="h-4 w-4 text-emerald-600" aria-label="Verified by LumiGap project confirmation" /> : <Clock3 className="h-4 w-4 text-amber-600" aria-label="Awaiting confirmation" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{proposal.roles.map((role) => <Badge key={role} variant="outline">{roleLabels[role]}</Badge>)}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{proposal.description}</p>
                  {proposal.evidence ? <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">Evidence:</span> {proposal.evidence}</p> : null}
                  <p className="mt-3 text-xs text-muted-foreground">Proposed by {actorName(proposal.proposedBy)}. {proposal.confirmationRequiredFrom === "OWNER" ? "Project owner confirmation required." : "Contributor confirmation required."}</p>
                </div>
                {canResolve(proposal) ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" disabled={confirm.isPending || reject.isPending} onClick={() => resolve(proposal._id, "reject")}><X className="mr-1.5 h-4 w-4" />Reject</Button>
                    <Button size="sm" disabled={confirm.isPending || reject.isPending} onClick={() => resolve(proposal._id, "confirm")}><Check className="mr-1.5 h-4 w-4" />Confirm</Button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
