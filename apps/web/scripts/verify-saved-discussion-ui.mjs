import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

await mkdir("scratch/saved-discussion-ui", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const width of [1280, 390]) for (const actor of ["a", "b"]) for (const final of ["INCLUDED", "EXCLUDED"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8093/__discussion.html?actor=${actor}&final=${final}&mode=independent`);
    await page.locator('.paper-discussion [data-message-id]').first().waitFor();
    assert.equal(await page.locator('.paper-discussion [data-message-id]').count(), 5);
    assert.equal(await page.locator('.paper-discussion textarea').count(), 0);
    assert.equal(await page.locator('.screening-ai').count(), 0);
    assert.equal(await page.getByText('Trợ lý AI sàng lọc', { exact: true }).count(), 0);
    await page.getByText('Đã lưu trao đổi', { exact: true }).waitFor();
    assert.equal(await page.locator('.paper-discussion [data-own="true"]').count(), actor === 'a' ? 3 : 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.paper-discussion').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `scratch/saved-discussion-ui/${width}-${actor}-${final}.png`, fullPage: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ viewports: [1280, 390], actors: ['A', 'B'], finalStates: ['INCLUDED', 'EXCLUDED'], savedMessages: 5, composer: false, aiPanel: false, browserErrors: errors }));
} finally { await browser.close(); }
