import { describe, expect, it, vi } from "vitest";
import type { PublicAcademicProfile } from "@trend/shared-types";
import { buildLecturerMatch, containsEvidenceTerm, safeEvidenceLink } from "../lecturer-match-evidence.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() } }));
describe("explainable local lecturer evidence", () => {
  const requirements = { topics: ["Computer vision"], methodologies: ["Survey"], needs: "Study design and weekly feedback" };
  const application = { areas: ["Computer vision"], methodologies: ["Survey"], capabilities: ["Study design"] };
  const profile = { expertiseAreas: ["Computer vision"], researchInterests: [], researchKeywords: [], academicIdentityLinks: [], featuredWorks: [] } as unknown as PublicAcademicProfile;
  it("separates profile/application declarations from publication evidence without inventing works", () => {
    const evidence = buildLecturerMatch(requirements,application,profile);
    expect(evidence.topics).toEqual([{term:"Computer vision",source:"PROFILE_DECLARATION"},{term:"Computer vision",source:"APPLICATION_DECLARATION"}]);
    expect(evidence.methodologies).toEqual(["Survey"]); expect(evidence.mentoringNeeds).toEqual(["Study design"]);
    expect(evidence.publications).toEqual([]); expect(evidence.missing.join(" ")).toContain("authorship has not been established");
    expect(evidence).not.toHaveProperty("score");
  });
  it("keeps canonical featured metadata self-declared and ignores restricted artifacts", () => {
    const evidence = buildLecturerMatch(requirements,application,{...profile,featuredWorks:[
      {kind:"PAPER",title:"Computer vision for medicine",year:2025,source:"LUMIGAP",canonical:true,visibility:"PUBLIC",href:"https://doi.org/10.1000/test"},
      {kind:"PAPER",title:"Private computer vision evidence",source:"MANUAL",canonical:false,visibility:"RESTRICTED"},
      {kind:"PROJECT",title:"Computer vision project",source:"LUMIGAP",canonical:true,visibility:"PUBLIC"},
    ]});
    expect(evidence.publications).toHaveLength(1); expect(evidence.publications[0]?.attribution).toBe("SELF_DECLARED");
  });
  it("does not imply expertise in an unmatched field from a nearby title", () => {
    const evidence = buildLecturerMatch({...requirements,topics:["Computer vision","Medical imaging"]},application,profile,[{title:"Computer vision segmentation",source:"openalex",attribution:"LINKED_IDENTITY",matchedTerms:["Computer vision"]}]);
    expect(evidence.topics.some(topic=>topic.term==="Medical imaging")).toBe(false);
  });
  it("uses whole terms and accent normalization instead of substring or fuzzy author names", () => {
    expect(containsEvidenceTerm("A fair approach", "AI")).toBe(false);
    expect(containsEvidenceTerm("AI: a study", "AI")).toBe(true);
    expect(containsEvidenceTerm("Thiết kế nghiên cứu", "thiet ke")).toBe(true);
    expect(containsEvidenceTerm("C++ for research", "C++")).toBe(true);
  });
  it("handles absent private profiles without manufacturing profile evidence", () => {
    const evidence = buildLecturerMatch(requirements,application);
    expect(evidence.profileVisible).toBe(false);expect(evidence.identities).toEqual([]);
    expect(evidence.topics).toEqual([{term:"Computer vision",source:"APPLICATION_DECLARATION"}]);
  });
  it.each(["javascript:alert(1)","data:text/html,test","https://user:password@example.org/"])("rejects unsafe evidence link %s",value=>expect(safeEvidenceLink(value)).toBeUndefined());
});
