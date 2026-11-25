import { describe, expect, it } from "vitest";
import { IT_SCOPE, IT_SCOPE_APPLICATION_TOPICS, isInItScope, isItScopeSubfield, itScopeWorkClauses, scopeLayerOf } from "../trend.scope.js";

describe("IT scope layers", () => {
  it("keeps every layer-3 topic outside the layer 1-2 subfields, so the clauses stay disjoint", () => {
    const subfields = new Set(IT_SCOPE.map((subfield) => subfield.id));
    for (const topic of IT_SCOPE_APPLICATION_TOPICS) {
      expect(subfields.has(topic.subfieldId), topic.id).toBe(false);
      expect(topic.id).toMatch(/^T\d+$/);
    }
    expect(new Set(IT_SCOPE_APPLICATION_TOPICS.map((topic) => topic.id)).size).toBe(IT_SCOPE_APPLICATION_TOPICS.length);
  });

  it("covers the subfields, then the layer-3 topics, in OR chunks of at most 10", () => {
    const clauses = itScopeWorkClauses();
    const subfieldClauses = clauses.filter((clause) => clause.startsWith("primary_topic.subfield.id:"));
    const topicClauses = clauses.filter((clause) => clause.startsWith("primary_topic.id:"));
    expect(subfieldClauses.length + topicClauses.length).toBe(clauses.length);
    expect(topicClauses.flatMap((clause) => clause.split(":")[1]!.split("|"))).toEqual(IT_SCOPE_APPLICATION_TOPICS.map((topic) => topic.id));
    for (const clause of clauses) expect(clause.split(":")[1]!.split("|").length).toBeLessThanOrEqual(10);
  });

  it("puts a layer-3 topic in scope, but not the rest of its subfield", () => {
    const [topic] = IT_SCOPE_APPLICATION_TOPICS;
    expect(isInItScope(topic!.subfieldId, `https://openalex.org/${topic!.id.toLowerCase()}`)).toBe(true);
    expect(isInItScope(topic!.subfieldId, "T99999")).toBe(false);
    expect(isItScopeSubfield(topic!.subfieldId)).toBe(false);
    expect(isInItScope("https://openalex.org/subfields/1702")).toBe(true);
  });

  it("names the layer of a topic", () => {
    expect(scopeLayerOf("1702", "T10028")).toBe("core");
    expect(scopeLayerOf("2207", "T10001")).toBe("related");
    expect(scopeLayerOf(IT_SCOPE_APPLICATION_TOPICS[0]!.subfieldId, IT_SCOPE_APPLICATION_TOPICS[0]!.id)).toBe("application");
    expect(scopeLayerOf("2208", "T99999")).toBeUndefined();
  });
});
