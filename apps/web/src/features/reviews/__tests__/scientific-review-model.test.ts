import { describe, expect, it } from "vitest";
import { rubricCoverage, rubricDetailedMetrics, internalAssessmentLabel } from "../scientific-review-model";
const criteria = [
  {id:"a",key:"method",title:"Methods",order:0,required:true,weight:20,allowNotApplicable:false,levels:[{id:"m4",label:"Good",score:4,position:0}]},
  {id:"b",key:"data",title:"Data",order:1,required:true,weight:10,allowNotApplicable:true,levels:[{id:"d2",label:"Weak",score:2,position:0}]},
];
describe("scientific rubric indicators",()=>{
  it("starts unassessed, never at a preselected high score or zero",()=>expect(rubricCoverage(criteria,{})).toEqual({score:null,coverage:0,count:0}));
  it("shows partial coverage without treating unassessed criteria as zero",()=>expect(rubricCoverage(criteria,{method:{performanceLevelId:"m4"}})).toEqual({score:4,coverage:67,count:1}));
  it("normalizes applicable weights and excludes permitted N/A",()=>{
    expect(rubricCoverage(criteria,{method:{performanceLevelId:"m4"},data:{performanceLevelId:"d2"}}).score).toBeCloseTo(10/3);
    expect(rubricCoverage(criteria,{method:{performanceLevelId:"m4"},data:{notApplicable:true}})).toEqual({score:4,coverage:100,count:1});
    expect(rubricCoverage(criteria,{method:{notApplicable:true},data:{performanceLevelId:"d2"}}).coverage).toBe(33);
  });
  it("separates criteria count progress from weighted progress and flags provisional scores", () => {
    const empty = rubricDetailedMetrics(criteria, {});
    expect(empty).toMatchObject({ score: null, weightCoveragePct: 0, countCoveragePct: 0, isProvisional: false, isComplete: false });

    const partial = rubricDetailedMetrics(criteria, { method: { performanceLevelId: "m4" } });
    expect(partial).toMatchObject({ score: 4, weightCoveragePct: 67, countCoveragePct: 50, assessedCount: 1, applicableCount: 2, isProvisional: true, isComplete: false });

    const complete = rubricDetailedMetrics(criteria, { method: { performanceLevelId: "m4" }, data: { performanceLevelId: "d2" } });
    expect(complete.isProvisional).toBe(false);
    expect(complete.isComplete).toBe(true);
    expect(complete.weightCoveragePct).toBe(100);
    expect(complete.countCoveragePct).toBe(100);
  });
  it("describes readiness as internal, never publication acceptance",()=>expect(internalAssessmentLabel("STRONG")).toBe("Ready to advance internally"));
});
