import { expect, it } from "vitest";
import { buildCreditStatement } from "@/features/projects/submission-readiness-model";
it("exports a draft instead of inventing author approval when consent is missing",()=>{
  expect(buildCreditStatement([{name:"Student",creditRoles:["INVESTIGATION"],confirmationStatus:"PENDING"}])).toContain("DRAFT: authorship confirmations are incomplete");
  expect(buildCreditStatement([])).toContain("DRAFT:");
});
it("distinguishes confirmed authorship order from approval of the final manuscript",()=>{
  const statement=buildCreditStatement([{name:"Student",creditRoles:["INVESTIGATION"],confirmationStatus:"CONFIRMED"}]);
  expect(statement).toContain("confirmed their authorship order");expect(statement).toContain("Approval of the final manuscript is a separate declaration");expect(statement).not.toContain("agreed to the published version");
});
