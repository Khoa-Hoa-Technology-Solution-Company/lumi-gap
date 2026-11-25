import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 30_000 });

// Real component and CSS, disposable browser storage and fixture-only API methods.
// No database, credentials or actual invitation actions are used by this visual check.
const webRoot = resolve(import.meta.dirname, "..");
const cache = resolve(webRoot, ".cache");
const output = resolve(webRoot, "../../docs/audits/2026-11-18-support-viewer");
await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true });
await writeFile(resolve(cache, "invitation-layout.html"), `<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invitation layout QA</title></head><body><div id="root"></div><script type="module" src="/.cache/invitation-layout.tsx"></script></body></html>`);
await writeFile(resolve(cache, "invitation-layout.tsx"), `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {I18nProvider} from '../src/i18n';
import {useAuthStore} from '../src/stores/auth-store';
import {academicSupportApi} from '../src/features/projects/api/academic-support.api';
import {MentorshipInvitationViewer} from '../src/features/projects/components/mentorship-invitation-viewer';
import '../src/theme/globals.css';
localStorage.setItem('LumiGap.uiLanguage','vi'); localStorage.setItem('lumigap.uiLanguage','vi');
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).has('dark'));
useAuthStore.setState({user:{id:'qa-owner',systemRole:'USER',fullName:'Đại diện nhóm (QA)'},tokens:null});
academicSupportApi.requestDetail=async()=>({kind:'REQUEST',id:'qa-request',projectId:'qa-project',viewer:'SENDER',direction:'PROJECT_TO_LECTURER',status:'CANCELED_BY_PROJECT',mentorRole:'UNASSIGNED',legacyPreview:true,
  createdAt:'2026-11-18T10:00:00Z',updatedAt:'2026-11-18T10:00:00Z',
  project:{id:'qa-project',title:'Dự án kiểm tra bố cục (QA)',summary:('Nhóm nghiên cứu so sánh phương pháp đánh giá và đối chiếu kết quả thực nghiệm.\\n\\n').repeat(16),researchAreas:['Khoa học dữ liệu'],expertise:['Trí tuệ nhân tạo'],stage:'PLANNING',teamMemberCount:4,mentoringNeeds:''},
  mentorUser:{_id:'qa-mentor',fullName:'Giảng viên nhận lời mời (QA)'},requestedBy:{_id:'qa-owner',fullName:'Đại diện nhóm (QA)',institutionName:'Đơn vị thử nghiệm'},
  message:('Nhờ thầy cô góp ý phương pháp, thiết kế thực nghiệm và cách đối chiếu tài liệu.\\n\\n').repeat(12),
  attachments:[{id:'qa-file',fileName:'Tài liệu giới thiệu nghiên cứu (QA).pdf',mimeType:'application/pdf',byteSize:64512}],
  actions:{accept:false,decline:false,cancel:false,end:false,openProject:false}});
academicSupportApi.respond=async()=>{throw new Error('Visual QA cannot send invitation actions')};
academicSupportApi.attachment=async()=>{throw new Error('Visual QA cannot download project files')};
function Fixture(){const [open,setOpen]=useState(true);return <><main style={{height:2000,padding:24}}><h1>Trang nền kiểm tra bố cục (QA)</h1></main>{open?<MentorshipInvitationViewer projectId="qa-project" requestId="qa-request" currentProjectId="qa-project" onClose={()=>setOpen(false)}/>:<p role="status">QA dialog closed</p>}</>}
createRoot(document.getElementById('root')!).render(<MemoryRouter><I18nProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Fixture/></QueryClientProvider></I18nProvider></MemoryRouter>);
`);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
const errors = [];
let page;
try {
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/v1/**", route => route.abort());
  for (const [name, width, height, dark] of [["desktop", 1440, 900, false], ["short-desktop", 1280, 600, false], ["mobile", 390, 640, false], ["mobile-dark", 390, 640, true], ["landscape", 844, 390, false]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:8080/.cache/invitation-layout.html${dark ? "?dark" : ""}`, { waitUntil: "networkidle" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Giảng viên nhận lời mời (QA)");
    await expect(dialog.locator("footer button")).toBeVisible();
    // Wait for the existing dialog entrance animation before measuring its edges.
    await expect.poll(() => dialog.evaluate(element => element.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
    const metrics = await dialog.evaluate(element => {
      const doc = element.ownerDocument, win = doc.defaultView;
      const rect = element.getBoundingClientRect(), header = element.querySelector('.mentor-invitation-viewer-header').getBoundingClientRect();
      const body = element.querySelector('.mentor-invitation-viewer-body'), bodyRect = body.getBoundingClientRect();
      const footer = element.querySelector('footer').getBoundingClientRect(), close = element.querySelector('footer button'), closeRect = close.getBoundingClientRect();
      return {
        contained: rect.top >= 0 && rect.bottom <= win.innerHeight + 1 && rect.left >= 0 && rect.right <= win.innerWidth + 1,
        noHorizontalOverflow: element.scrollWidth <= element.clientWidth && body.scrollWidth <= body.clientWidth,
        contentScrolls: body.scrollHeight > body.clientHeight,
        fixedHeaderFooter: header.bottom <= bodyRect.top + 1 && bodyRect.bottom <= footer.top + 1 && footer.bottom <= rect.bottom + 1,
        closeClickable: doc.elementFromPoint(closeRect.x + closeRect.width / 2, closeRect.y + closeRect.height / 2)?.closest('button') === close,
        top: Math.round(rect.top), bottom: Math.round(rect.bottom), bodyHeight: body.clientHeight,
      };
    });
    for (const field of ["contained", "noHorizontalOverflow", "contentScrolls", "fixedHeaderFooter", "closeClickable"]) expect(metrics[field], `${name}: ${field}`).toBe(true);
    await dialog.locator('.mentor-invitation-viewer-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.locator('footer button')).toBeVisible();
    const body = dialog.locator('.mentor-invitation-viewer-body');
    await body.focus(); await body.press('Home');
    await page.screenshot({ path: resolve(output, `layout-${name}.png`), animations: "disabled" });
    await dialog.locator('footer button').click();
    await expect(dialog).toHaveCount(0); await expect(page.getByText('QA dialog closed', { exact: true })).toBeVisible();
    results.push({ name, width, height, ...metrics });
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(cache, "invitation-layout-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, cases: results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errors, url: page?.url(), body: page ? await page.locator('body').innerText() : '' }));
  throw error;
} finally { await browser.close(); }
