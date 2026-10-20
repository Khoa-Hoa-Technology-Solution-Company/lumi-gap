import { expect, it } from "vitest";
import { en } from "../locales/en";
import { vi } from "../locales/vi";
import { confirmationsEn, confirmationsVi } from "../locales/confirmations";

it("provides English and Vietnamese copy for every shared confirmation", () => {
  expect(Object.keys(confirmationsVi).sort()).toEqual(Object.keys(confirmationsEn).sort());
  for (const [key, english] of Object.entries(confirmationsEn)) {
    expect(en[key as keyof typeof en]).toBe(english);
    expect(vi[key as keyof typeof en]).toBe(confirmationsVi[key]);
    expect(confirmationsVi[key]).toBeTruthy();
    expect(confirmationsVi[key]).not.toBe(english);
  }
});
