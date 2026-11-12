import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const output = fileURLToPath(new URL("../scratch/tasks-ui/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const [name, width, height] of [["desktop", 1280, 1000], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:8094/__tasks.html");
    await page.getByRole("link", { name: "Benchmarking retrieval-augmented generation for medicine" }).waitFor();
    assert.equal(await page.getByRole("tab", { name: /Cần xử lý\s*4/ }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByRole("heading", { name: /Đang đánh giá/ }).count(), 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${name} pending overflows`);
    await page.screenshot({ path: `${output}/${name}-pending.png`, fullPage: true });
    await page.getByRole("tab", { name: /Đã đánh giá\s*3/ }).click();
    await page.getByText("Đánh giá của tôi").first().waitFor();
    assert.equal(await page.getByText("Quyết định sau phân xử", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} history overflows`);
    await page.screenshot({ path: `${output}/${name}-reviewed.png`, fullPage: true });
    await page.goto("http://127.0.0.1:8094/__tasks.html?screeningTab=reviewed&screeningHistory=DECIDED");
    await page.getByText("Opening the black box of AI-Medicine", { exact: false }).first().waitFor();
    assert.equal(await page.locator("article").count(), 1);
    await page.reload();
    await page.getByText("Opening the black box of AI-Medicine", { exact: false }).first().waitFor();
    assert.equal(await page.getByRole("tab", { name: /Đã đánh giá\s*3/ }).getAttribute("aria-selected"), "true");
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ viewports: [1280, 390], states: ["pending groups", "reviewed history", "decided filter", "direct URL and reload"], overflow: false, errors, screenshots: output }));
} finally { await browser.close(); }
