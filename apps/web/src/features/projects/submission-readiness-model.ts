import type { AuthorshipRegistryItem } from "@trend/shared-types";

export function buildCreditStatement(authors: Pick<AuthorshipRegistryItem, "name" | "creditRoles" | "confirmationStatus">[]) {
  const lines = authors.map(author => `**${author.name}**: ${author.creditRoles.join(", ") || "Contributor"}.`);
  const consent = authors.length > 0 && authors.every(author => author.confirmationStatus === "CONFIRMED")
    ? "All listed authors have confirmed their authorship order in LumiGap. Approval of the final manuscript is a separate declaration."
    : "DRAFT: authorship confirmations are incomplete. This statement does not assert approval of the manuscript.";
  return `### CRediT Authorship Contribution Statement\n\n${lines.join("\n")}\n\n${consent}`;
}
