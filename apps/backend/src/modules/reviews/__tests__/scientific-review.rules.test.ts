import { describe, expect, it } from "vitest";
import { scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";
import { validateScientificIntegrity } from "../scientific-review.rules.js";
const input = (): AcademicReviewInput => ({responses:[],overallAssessment:"STRONG",integrityChecks:Object.fromEntries(scientificIntegrityChecks.map(c=>[c.key,{status:"CHECKED" as const}]))});
describe("noncompensable scientific integrity",()=>{
  it("permits incomplete drafts and preserves legacy peer-review policy",()=>{
    expect(()=>validateScientificIntegrity({responses:[]},[],"MENTOR_GUIDANCE",false)).not.toThrow();
    expect(()=>validateScientificIntegrity({responses:[]},[],"DIRECT_INVITATION",true)).not.toThrow();
  });
  it("requires every applicable check and rejects fabricated checklist keys",()=>{
    expect(()=>validateScientificIntegrity({responses:[]},[],"MENTOR_GUIDANCE",true)).toThrow();
    const v=input(); v.integrityChecks!.invented={status:"CHECKED"};expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).toThrow();
  });
  it("allows N/A only when policy permits it",()=>{
    const v=input();v.integrityChecks!.ethics={status:"NOT_APPLICABLE"};expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).not.toThrow();
    v.integrityChecks!.authorship={status:"NOT_APPLICABLE"};expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).toThrow();
  });
  it("requires a substantive concern note and prevents readiness regardless of scores",()=>{
    const v=input();v.integrityChecks!.data={status:"CONCERN",note:"?"};expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).toThrow();
    v.integrityChecks!.data.note="Verify the provenance of the unavailable raw dataset.";
    expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).toThrow();
    v.overallAssessment="MAJOR_REVISION";expect(()=>validateScientificIntegrity(v,[],"MENTOR_GUIDANCE",true)).not.toThrow();
  });
});
