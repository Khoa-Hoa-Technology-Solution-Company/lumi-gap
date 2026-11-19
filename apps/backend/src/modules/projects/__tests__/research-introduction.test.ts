import { describe, expect, it } from "vitest";
import { hasMeaningfulResearchText } from "@trend/shared-types";
describe("research introductions", () => {
  it.each(["Study clinical AI.", "Nhờ thầy góp ý phương pháp.", "NLP cho y tế", "癌症治疗研究", "Compare two methods of evaluating medical images."])("accepts concise meaningful content: %s", text => expect(hasMeaningfulResearchText(text)).toBe(true));
  it.each(["", "    ", "123456", "!!!!!!!!!!", "test", "aaaaaaaaaaa", "test test test test", "https://example.com", "Giới thiệu vấn đề, mục tiêu và hướng nghiên cứu. Không cần một abstract hoàn chỉnh.", "Introduce the research question, goal and direction. A polished abstract is not required."])("rejects an obvious empty/placeholder input: %s", text => expect(hasMeaningfulResearchText(text)).toBe(false));
});
