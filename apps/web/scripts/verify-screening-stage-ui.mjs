import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

await mkdir("scratch/stage-ui", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const width of [1280, 390]) for (const actor of ["a", "b"]) for (const state of ["waiting", "clarification", "full"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8096/__stages.html?actor=${actor}&state=${state}`);
    await page.getByRole("dialog").waitFor();
    if (state === "waiting") {
      await page.getByRole("heading", { name: "Qua vòng tiêu đề / tóm tắt · Chờ toàn văn" }).waitFor();
      await page.getByRole("button", { name: "Đã có toàn văn · Mở vòng 2" }).click();
      await page.getByText(/Chưa có toàn văn. Đính kèm PDF/).waitFor();
      assert.equal(await page.locator('input[type="file"]').count(), 1);
      assert.equal(await page.locator('input[name="review-choice"]').count(), 0);
    } else if (state === "clarification") {
      await page.getByRole("button", { name: "Cập nhật phiếu của tôi" }).click();
      await page.getByRole("heading", { name: "Cập nhật phiếu của tôi" }).waitFor();
      const current = page.getByRole("button", { name: actor === "a" ? /Chưa chắc chắn.*Hiện tại/ : /Phù hợp.*Hiện tại/ });
      assert.equal(await current.isDisabled(), false);
      await page.keyboard.press("Escape");
    } else {
      await page.getByText("Được chấp nhận", { exact: true }).first().waitFor();
      await page.getByText("Đã lưu trao đổi", { exact: true }).waitFor();
      assert.equal(await page.locator(".paper-discussion textarea").count(), 0);
    }
    assert.equal(await page.getByText("Trợ lý AI sàng lọc", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `scratch/stage-ui/${width}-${actor}-${state}.png`, fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ viewports: [1280, 390], reviewers: ["A", "B"], states: ["waiting", "clarification", "full"], browserErrors: errors }));
} finally { await browser.close(); }
