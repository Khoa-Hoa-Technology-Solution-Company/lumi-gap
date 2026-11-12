import type { ManuscriptAttributionCheckView } from "@trend/shared-types";

export function attributionReadinessItems(check: ManuscriptAttributionCheckView, t: (key: string) => string): string[] {
  const name = (id: string) => check.proposedAuthors.find(author => author.userId === id)?.displayName || check.proposedAuthors.find(author => author.userId === id)?.name || check.acknowledgements.find(person => person.userId === id)?.name || check.detectedContributors.find(person => person.userId === id)?.name || t("Contributor");
  const items: string[] = [];
  if (check.unreviewedContributorIds?.length) items.push(`${t("The project editor must review these contributors")}: ${check.unreviewedContributorIds.map(name).join(", ")}`);
  if (check.pendingAuthorIds?.length) items.push(`${t("Each author must approve their own version and attribution")}: ${check.pendingAuthorIds.map(name).join(", ")}`);
  if (check.pendingAcknowledgementIds?.length) items.push(`${t("Permission is pending from acknowledged contributors")}: ${check.pendingAcknowledgementIds.map(name).join(", ")}`);
  for (const concern of check.unresolvedDisputes ?? []) {
    const institutional = ["ATTRIBUTION_DISPUTE", "CONTRIBUTION_DISPUTE"].includes(concern.source);
    const screen = institutional ? "Seek institutional review through Research Integrity; no one can approve for the affected person."
      : concern.source === "ALLOCATION_REVISION" ? "Open Contribution Allocation to review the disputed revision."
      : concern.source.startsWith("WORK_") || concern.source === "CHANGED_CONTRIBUTION_EVIDENCE" ? "Open Research Contributions to correct the record or review the updated evidence."
      : "Review the author list and your individual decision in this attribution declaration.";
    items.push(`${t(institutional ? "Institutional review is required for this dispute" : "The affected contributor or evidence reviewer must resolve this concern")}${concern.userId ? `: ${name(concern.userId)}` : ""}. ${t(screen)} ${t("Recorded concern")}: ${t(concern.summary)}`);
  }
  for (const reason of check.blockingReasons) if (!/^\d+ (detected scope contributor|proposed author|unresolved contribution)/.test(reason) || !items.length) items.push(t(reason));
  return [...new Set(items)];
}
