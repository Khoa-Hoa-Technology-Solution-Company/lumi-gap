const state = {
  papers: [], dashboard: null, selectedPaper: null, status: "", search: "",
  poller: null, watchedReviews: new Set(), user: null, csrf: '',
  reviewRequests: new Map(),
  reviewTypes: [], reviewSelections: new Map(),
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function api(url, options = {}) {
  options = {...options, headers: {...options.headers, ...(state.csrf ? {'X-CSRF-Token': state.csrf} : {})}};
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { message = (await response.json()).detail || message; } catch (_) {}
    if (Array.isArray(message)) message = message.map(item => item.msg).join('; ');
    const error = new Error(typeof message === 'object' ? message.message || 'Yêu cầu không hợp lệ' : message);
    error.status = response.status; error.detail = message;
    error.retryAfter = Number(response.headers.get('Retry-After') || 0);
    if (error.retryAfter) error.message += ` Thử lại sau ${error.retryAfter} giây.`;
    if (error.detail?.code === 'storage_quota_exceeded') showStorageQuota(error);
    if (error.detail?.code === 'storage_expired') lockStorageView();
    if (response.status === 401 && state.user) location.reload();
    throw error;
  }
  return response.json();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

function statusLabel(status) {
  return ({pending:"Chờ review", reviewing:"Đang xử lý", reviewed:"Đã review", failed:"Lỗi"})[status] || status;
}

function strictnessLabel(strictness) {
  return ({balanced:"Balanced", strict:"Strict", lenient:"Lenient"})[strictness] || strictness || "Balanced";
}

function strictnessDescription(strictness) {
  return ({
    lenient: "Ngưỡng bằng chứng thấp hơn · khoan dung hơn với hạn chế có thể sửa · mức khó thấp nhất.",
    balanced: "Chuẩn reviewer hội nghị · cân bằng đóng góp và hạn chế · mức khó trung bình.",
    strict: "Yêu cầu bằng chứng, kiểm chứng và khả năng tái lập mạnh hơn · mức khó cao nhất.",
  })[strictness] || "";
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {day:"2-digit", month:"2-digit", year:"numeric"}).format(new Date(value));
}

function shortText(value, max = 110) {
  if (!value) return "Chưa xác định tác giả";
  return value.length > max ? value.slice(0, max).trim() + "…" : value;
}

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  $("#toast-region").append(node);
  setTimeout(() => node.remove(), 4200);
}

async function showView(name) {
  if (name === 'admin') name = 'admin-dashboard';
  if (!['dashboard', 'papers', 'formats', 'profile', 'wallet', 'storage', ...Object.keys(adminTitles)].includes(name)) name = 'dashboard';
  if (name.startsWith('admin-') && state.user?.role !== 'admin') name = 'dashboard';
  if (state.storageLocked && ['dashboard', 'papers'].includes(name)) name = 'storage';
  state.currentView = name;
  if (state.user) sessionStorage.setItem(`paperscope:view:${state.user.id}`, name);
  const viewId = name === 'admin-formats' ? 'formats-view' : name.startsWith('admin-') ? 'admin-view' : `${name}-view`;
  $$(".view").forEach(view => view.classList.toggle("active", view.id === viewId));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === name));
  $("#page-title").textContent = ({dashboard:'Tổng quan nghiên cứu', papers:'Thư viện bài báo', formats:'Chuẩn định dạng', profile:'Hồ sơ & API key', wallet:'Ví credit', storage:'Dung lượng & lưu trữ', ...adminTitles})[name];
  $(".sidebar").classList.remove("open");
  $('#mobile-menu').setAttribute('aria-expanded', 'false');
  $('#nav-backdrop').classList.remove('open');
  if (name === "papers") await loadPapers().catch(error => toast(error.message, 'error'));
  if (window.loadAccountView) await window.loadAccountView(name);
}

function paperCard(paper) {
  const decision = paper.recommendation || (paper.latest_review_id ? 'Đã có báo cáo' : 'Chưa có báo cáo');
  return `
    <article class="paper-card">
      <div class="paper-card-top"><span class="file-type">PDF · ${paper.page_count || "?"} TRANG</span><span class="status-chip ${paper.status}">${statusLabel(paper.status)}</span></div>
      <h3>${escapeHtml(paper.title)}</h3>
      <p class="authors">${escapeHtml(shortText(paper.authors))}</p>
      <div class="paper-meta"><span>${escapeHtml(paper.paper_type || "Other")}</span><span>${formatDate(paper.updated_at)}</span></div>
      <div class="paper-decision"><span>Kết quả review</span><strong>${escapeHtml(decision)}</strong></div>
      <button class="paper-open" data-paper-id="${paper.id}" aria-label="Mở ${escapeHtml(paper.title)}">Mở</button>
    </article>`;
}

function renderPapers() {
  $("#paper-list").innerHTML = state.papers.map(paperCard).join("");
  $("#recent-papers").innerHTML = state.papers.slice(0, 3).map(paperCard).join("");
  $("#library-count").textContent = `${state.papers.length} bài báo`;
  $("#paper-nav-count").textContent = state.dashboard?.counts?.total ?? state.papers.length;
  $("#paper-empty").classList.toggle("hidden", state.papers.length > 0);
  $$('[data-paper-id]').forEach(button => button.addEventListener("click", () => openPaper(Number(button.dataset.paperId))));
}

async function loadPapers() {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search);
  if (state.status) params.set("status", state.status);
  state.papers = await api(`/api/papers?${params}`);
  renderPapers();
}

function renderDashboard() {
  const counts = state.dashboard.counts;
  $("#metric-total").textContent = counts.total;
  $("#metric-reviewed").textContent = counts.reviewed;
  $("#metric-reviewing").textContent = counts.reviewing;
  $("#metric-pending").textContent = counts.pending;
  $("#paper-nav-count").textContent = counts.total;
  const labels = {
    scientific_quality: "Khoa học", originality: "Tính mới", quality_of_writing: "Trình bày",
    completeness_of_references: "Tài liệu",
  };
  $("#score-bars").innerHTML = Object.entries(labels).map(([key, label]) => {
    const value = state.dashboard.average_scores[key] || 0;
    return `<div class="score-item"><div class="score-track"><div class="score-fill" style="height:${value / 5 * 100}%"><span>${value || "—"}</span></div></div><small>${label}</small></div>`;
  }).join("");
  const recommendations = state.dashboard.recommendations;
  const max = Math.max(1, ...recommendations.map(item => item.count));
  const order = ["Strong Accept", "Accept", "Borderline", "Reject", "Strong Reject"];
  $("#recommendation-chart").innerHTML = order.map(label => {
    const item = recommendations.find(row => row.recommendation === label);
    const count = item?.count || 0;
    return `<div class="decision-row"><span>${label}</span><div class="decision-track"><div class="decision-fill" style="width:${count / max * 100}%"></div></div><strong>${count}</strong></div>`;
  }).join("");
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  renderDashboard();
}

function renderPaperDetail(paper) {
  const latestCompleted = paper.reviews.find(review => review.status === "completed");
  const running = paper.reviews.find(review => ["queued", "running"].includes(review.status));
  const completedReviews = paper.reviews.filter(review => review.status === "completed" && review.output_format !== 'markdown');
  const history = paper.reviews.length ? paper.reviews.map(review => `
    <article class="review-row">
      <div>
        <div class="review-title-line"><span class="strictness-chip ${escapeHtml(review.strictness)}">${escapeHtml(strictnessLabel(review.strictness))}</span><h4>${review.status === "completed" ? escapeHtml(review.recommendation || "Review") : `Review #${review.id}`}</h4></div>
        <p>${escapeHtml(review.review_type_name || 'Review hội nghị')} · v${review.review_type_revision || 1} · ${escapeHtml(review.model || "—")} · ${formatDate(review.completed_at || review.created_at)}</p>
        <p>${review.credit_cost || 0} credit${review.refunded ? ' · Đã hoàn credit' : ''}</p>
        ${review.status === "completed" && review.scores ? `<div class="review-score-preview"><span>Khoa học <b>${review.scores.scientific_quality || "—"}</b></span><span>Tính mới <b>${review.scores.originality || "—"}</b></span><span>Trình bày <b>${review.scores.quality_of_writing || "—"}</b></span></div>` : ""}
        ${review.error ? `<div class="error-box">${escapeHtml(review.error)}</div>` : ""}
      </div>
      ${review.status === "completed" ? `<button class="button button-ghost" data-view-review="${review.id}">Xem báo cáo</button>` : `<span class="status-chip reviewing">${escapeHtml(review.status)}</span>`}
    </article>`).join("") : `<p class="authors">Chưa có lịch sử review.</p>`;
  const comparison = completedReviews.length > 1 ? `
    <section class="review-comparison">
      <div class="panel-heading"><div><p class="eyebrow">COMPARE MODES</p><h3>So sánh các lần review</h3></div></div>
      <div class="comparison-scroll"><table class="comparison-table">
        <thead><tr><th>Chế độ</th><th>Khuyến nghị</th><th>Khoa học</th><th>Tính mới</th><th>Trình bày</th><th>Tài liệu</th><th></th></tr></thead>
        <tbody>${completedReviews.map(review => `<tr>
          <td><span class="strictness-chip ${escapeHtml(review.strictness)}">${escapeHtml(strictnessLabel(review.strictness))}</span></td>
          <td><strong>${escapeHtml(review.recommendation || "—")}</strong></td>
          <td>${review.scores?.scientific_quality || "—"}/5</td><td>${review.scores?.originality || "—"}/5</td>
          <td>${review.scores?.quality_of_writing || "—"}/5</td><td>${review.scores?.completeness_of_references || "—"}/5</td>
          <td><button class="text-button" data-view-review="${review.id}">Xem →</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </section>` : "";
  $("#detail-status").className = `status-chip ${paper.status}`;
  $("#detail-status").textContent = statusLabel(paper.status);
  $("#drawer-body").innerHTML = `
    <h2 class="profile-title">${escapeHtml(paper.title)}</h2>
    <p class="profile-authors">${escapeHtml(paper.authors || "Tác giả chưa được nhận diện")}</p>
    <div class="profile-facts">
      <span class="fact">${paper.page_count || "?"} trang</span><span class="fact">${(paper.file_size / 1024 / 1024).toFixed(2)} MB</span>
      <span class="fact">${escapeHtml(paper.paper_type || "Other")}</span><span class="fact">${escapeHtml(paper.filename)}</span>
    </div>
    <div class="abstract-card"><h4>Abstract</h4><p>${escapeHtml(paper.abstract || "Không trích xuất được abstract từ bản thảo.")}</p></div>
    <div class="detail-actions">
      <div class="review-config review-type-config"><label for="review-type-${paper.id}">Loại review</label><select id="review-type-${paper.id}">${state.reviewTypes.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}</select></div>
      <a class="button button-ghost" href="/api/papers/${paper.id}/file" target="_blank" rel="noopener">Mở PDF ↗</a>
      <div class="review-config"><label for="strictness-${paper.id}">Strictness</label><select id="strictness-${paper.id}"><option value="balanced">Balanced</option><option value="strict">Strict</option><option value="lenient">Lenient</option></select></div>
      <div class="review-config"><label for="billing-${paper.id}">Sử dụng</label><select id="billing-${paper.id}"><option value="system">Hệ thống · ${publicConfig.system_review_cost} credit</option><option value="personal" ${state.user?.has_gemini_key ? '' : 'disabled'}>Key cá nhân · ${publicConfig.personal_review_cost} credit</option></select></div>
      <button class="button button-primary" id="start-review" ${running || !state.reviewTypes.length ? "disabled" : ""}>${!state.reviewTypes.length ? 'Chưa có loại review khả dụng' : running ? "Đang review…" : latestCompleted ? "AI review lại" : "AI review"}</button>
    </div>
    <p class="strictness-note" id="strictness-note-${paper.id}"><strong>Balanced:</strong> ${strictnessDescription("balanced")}</p>
    <section id="paper-format-panel" class="paper-format-panel"><p class="account-muted">Đang tải chuẩn định dạng…</p></section>
    <div class="panel-heading"><div><p class="eyebrow">REVIEW HISTORY</p><h3>Lịch sử đánh giá</h3></div></div>
    <div class="review-history">${history}</div>
    ${comparison}
    <div id="report-slot"></div>`;
  $("#start-review").addEventListener("click", () => startReview(paper.id));
  const controls = ['strictness', 'billing', 'review-type'];
  const selection = state.reviewSelections.get(paper.id) || {};
  controls.forEach(key => {
    const control = $(`#${key}-${paper.id}`);
    if ([...control.options].some(option => option.value === selection[key] && !option.disabled)) control.value = selection[key];
    control.addEventListener('change', () => state.reviewSelections.set(paper.id,
      Object.fromEntries(controls.map(name => [name, $(`#${name}-${paper.id}`).value]))));
  });
  const chosenStrictness = $(`#strictness-${paper.id}`).value;
  $(`#strictness-note-${paper.id}`).textContent = `${strictnessLabel(chosenStrictness)}: ${strictnessDescription(chosenStrictness)}`;
  $(`#strictness-${paper.id}`).addEventListener("change", event => {
    $(`#strictness-note-${paper.id}`).innerHTML = `<strong>${escapeHtml(strictnessLabel(event.target.value))}:</strong> ${escapeHtml(strictnessDescription(event.target.value))}`;
  });
  $$('[data-view-review]').forEach(button => button.addEventListener("click", () => showReview(Number(button.dataset.viewReview))));
  loadFormatPanel(paper.id);
}

async function openPaper(id) {
  try {
    const paper = await api(`/api/papers/${id}`);
    state.selectedPaper = paper;
    renderPaperDetail(paper);
    $("#detail-drawer").classList.add("open");
    $("#detail-drawer").setAttribute("aria-hidden", "false");
    $("#drawer-backdrop").classList.add("open");
  } catch (error) { toast(error.message, "error"); }
}

function closeDrawer() {
  clearTimeout(formatState.timer);
  $("#detail-drawer").classList.remove("open");
  $("#detail-drawer").setAttribute("aria-hidden", "true");
  $("#drawer-backdrop").classList.remove("open");
}

async function startReview(paperId) {
  const strictness = $(`#strictness-${paperId}`).value;
  const form = new FormData(); form.append("strictness", strictness);
  form.append('billing_mode', $(`#billing-${paperId}`).value);
  form.append('review_type_id', $(`#review-type-${paperId}`).value);
  const requestKey = `${paperId}:${strictness}:${form.get('billing_mode')}:${form.get('review_type_id')}`;
  if (!state.reviewRequests.has(requestKey)) state.reviewRequests.set(requestKey, crypto.randomUUID());
  form.append('request_id', state.reviewRequests.get(requestKey));
  const button = $('#start-review'); button.disabled = true;
  try {
    const captcha = await captchaToken('review');
    const result = await api(`/api/papers/${paperId}/review`, {method:"POST", body:form, headers:{'X-Captcha-Token':captcha}});
    state.reviewRequests.delete(requestKey);
    toast("Đã đưa bài báo vào hàng đợi AI review.");
    await openPaper(paperId);
    state.watchedReviews.add(result.review_id);
    startWorkspacePolling();
    await Promise.all([loadDashboard(), loadPapers(), refreshAccount()]);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; }
}

function startWorkspacePolling() {
  if (state.poller) return;
  state.poller = setInterval(async () => {
    try {
      await Promise.all([loadDashboard(), loadPapers(), refreshAccount()]);
      for (const reviewId of [...state.watchedReviews]) {
        const review = await api(`/api/reviews/${reviewId}`);
        if (["completed", "failed"].includes(review.status)) {
          state.watchedReviews.delete(reviewId);
          toast(review.status === "completed" ? "AI review đã hoàn tất." : review.error, review.status === "completed" ? "success" : "error");
        }
      }
      const drawerOpen = $("#detail-drawer").classList.contains("open");
      if (drawerOpen && state.selectedPaper) {
        const paper = await api(`/api/papers/${state.selectedPaper.id}`);
        state.selectedPaper = paper;
        renderPaperDetail(paper);
      }
      if ((state.dashboard?.counts?.reviewing || 0) === 0 && state.watchedReviews.size === 0) {
        clearInterval(state.poller);
        state.poller = null;
      }
    } catch (_) {
      clearInterval(state.poller);
      state.poller = null;
    }
  }, 3000);
}

function markdownToHtml(markdown) {
  const safe = escapeHtml(markdown);
  const lines = safe.split("\n");
  let html = "", inList = '', inCode = false;
  const inline = text => text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = ''; } };
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => inline(cell.trim()));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeList(); html += inCode ? '</code></pre>' : '<pre><code>'; inCode = !inCode; continue;
    }
    if (inCode) { html += line + '\n'; continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
      closeList();
      html += `<div class="comparison-scroll"><table><thead><tr>${cells(line).map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>`;
      i += 2;
      for (; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) html += `<tr>${cells(lines[i]).map(cell => `<td>${cell}</td>`).join('')}</tr>`;
      i--; html += '</tbody></table></div>'; continue;
    }
    const list = line.match(/^\s*(\d+\.|[-*+])\s+(.+)/);
    if (list) {
      const kind = /^\d/.test(list[1]) ? 'ol' : 'ul';
      if (inList !== kind) { closeList(); html += `<${kind}>`; inList = kind; }
      html += `<li>${inline(list[2])}</li>`; continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if (/^&gt;/.test(line)) html += `<blockquote>${inline(line.replace(/^&gt;\s?/, ''))}</blockquote>`;
    else if (/^---+$/.test(line)) html += "<hr>";
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  closeList();
  if (inCode) html += '</code></pre>';
  return html;
}

function splitBilingualReport(markdown) {
  const partBMarker = "# Part B — Đánh giá tiếng Việt";
  const partBIndex = markdown.indexOf(partBMarker);
  if (partBIndex < 0) {
    return { en: markdown, vi: "# Part B — Đánh giá tiếng Việt\n\nChưa có nội dung tiếng Việt trong báo cáo này." };
  }
  const english = markdown.slice(0, partBIndex).trim();
  const vietnamese = markdown.slice(partBIndex).trim();
  return { en: english, vi: vietnamese };
}

async function showReview(reviewId) {
  try {
    const review = await api(`/api/reviews/${reviewId}`);
    if (review.output_format === 'markdown') {
      $('#report-slot').innerHTML = `<section class="report-view"><div class="report-toolbar"><strong>${escapeHtml(review.review_type_name)} · Báo cáo #${review.id}</strong><button class="button button-ghost" id="copy-custom-report">Sao chép báo cáo</button></div><article class="report-markdown">${markdownToHtml(review.report_markdown)}</article></section>`;
      $('#copy-custom-report').onclick = async () => { await navigator.clipboard.writeText(review.report_markdown); toast('Đã sao chép báo cáo.'); };
      $('#report-slot').scrollIntoView({behavior: 'smooth'});
      return;
    }
    const reportParts = splitBilingualReport(review.report_markdown);
    $("#report-slot").innerHTML = `
      <section class="report-view">
        <div class="report-toolbar">
          <div class="report-identity"><span class="strictness-chip ${escapeHtml(review.strictness)}">${escapeHtml(strictnessLabel(review.strictness))}</span><strong>Báo cáo #${review.id} · ${escapeHtml(review.recommendation || "—")}</strong></div>
          <button class="button button-ghost" id="copy-report">Sao chép English</button>
        </div>
        <div class="language-tabs" role="tablist" aria-label="Ngôn ngữ báo cáo">
          <button class="language-tab active" role="tab" aria-selected="true" data-report-language="en"><span>EN</span> English Review</button>
          <button class="language-tab" role="tab" aria-selected="false" data-report-language="vi"><span>VI</span> Đánh giá tiếng Việt</button>
        </div>
        <article class="report-markdown language-panel active" role="tabpanel" data-language-panel="en">${markdownToHtml(reportParts.en)}</article>
        <article class="report-markdown language-panel" role="tabpanel" data-language-panel="vi">${markdownToHtml(reportParts.vi)}</article>
      </section>`;
    let activeLanguage = "en";
    const copyButton = $("#copy-report");
    $$('[data-report-language]').forEach(button => button.addEventListener("click", () => {
      activeLanguage = button.dataset.reportLanguage;
      $$('[data-report-language]').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      $$('[data-language-panel]').forEach(panel => panel.classList.toggle("active", panel.dataset.languagePanel === activeLanguage));
      copyButton.textContent = activeLanguage === "en" ? "Sao chép English" : "Sao chép Tiếng Việt";
    }));
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(reportParts[activeLanguage]);
      toast(activeLanguage === "en" ? "Đã sao chép bản tiếng Anh." : "Đã sao chép bản tiếng Việt.");
    });
    $("#report-slot").scrollIntoView({behavior:"smooth"});
  } catch (error) { toast(error.message, "error"); }
}

function openUpload() {
  $('#upload-limit-label').textContent = `Tối đa ${publicConfig.upload_max_mb || 50} MB / PDF · Tổng dung lượng theo hạn mức tài khoản`;
  $("#upload-modal").classList.add("open"); $("#upload-modal").setAttribute("aria-hidden", "false");
}
function closeUpload() { $("#upload-modal").classList.remove("open"); $("#upload-modal").setAttribute("aria-hidden", "true"); }

async function handleUpload(event) {
  event.preventDefault();
  const button = $("#upload-submit");
  const uploadForm = event.currentTarget;
  button.disabled = true; button.textContent = "Đang phân tích PDF…";
  try {
    const form = new FormData(uploadForm);
    const captcha = await captchaToken('upload');
    const paper = await api("/api/papers", {method:"POST", body:form, headers:{'X-Captcha-Token':captcha}});
    closeUpload(); uploadForm.reset(); $("#file-label").textContent = "Kéo PDF vào đây hoặc bấm để chọn";
    state.search = "";
    state.status = "";
    $("#paper-search").value = "";
    $$("#status-filters button").forEach(item => item.classList.toggle("active", item.dataset.status === ""));
    showView("papers");
    toast("Đã upload và tạo profile bài báo.");
    await Promise.all([loadDashboard(), loadPapers()]);
    await openPaper(paper.id);
  } catch (error) { toast(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Upload & tạo profile"; }
}

async function initialize() {
  try {
    const [health, usage] = await Promise.all([api('/api/health'), api('/api/storage'), loadReviewTypes()]);
    syncStorageState(usage);
    if (!usage.library_locked) await Promise.all([loadDashboard(), loadPapers()]);
    $("#ai-dot").classList.toggle("online", health.ai_configured);
    $("#ai-label").textContent = health.ai_configured ? "AI sẵn sàng" : "Chưa có API key";
    $("#ai-model").textContent = `${health.provider} · ${health.model}`;
    if ((state.dashboard?.counts?.reviewing || 0) > 0) startWorkspacePolling();
  } catch (error) { toast(`Không thể khởi tạo: ${error.message}`, "error"); }
}

$$('.nav-item').forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-go-papers]').forEach(button => button.addEventListener("click", () => showView("papers")));
function toggleMobileNav(open) {
  $('.sidebar').classList.toggle('open', open);
  $('#nav-backdrop').classList.toggle('open', open);
  $('#mobile-menu').setAttribute('aria-expanded', String(open));
  if (open) $('.sidebar .nav-item').focus();
  else $('#mobile-menu').focus();
}
$('#mobile-menu').addEventListener('click', () => toggleMobileNav(!$('.sidebar').classList.contains('open')));
$('#nav-backdrop').addEventListener('click', () => toggleMobileNav(false));
$("#open-upload").addEventListener("click", openUpload);
$$('[data-close-modal]').forEach(button => button.addEventListener("click", closeUpload));
$("#upload-modal").addEventListener("click", event => { if (event.target === event.currentTarget) closeUpload(); });
$("#close-drawer").addEventListener("click", closeDrawer);
$("#drawer-backdrop").addEventListener("click", closeDrawer);
$("#upload-form").addEventListener("submit", handleUpload);
$("#pdf-file").addEventListener("change", event => { $("#file-label").textContent = event.target.files[0]?.name || "Kéo PDF vào đây hoặc bấm để chọn"; });
const dropzone = $("#dropzone");
["dragenter", "dragover"].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
dropzone.addEventListener("drop", event => { const input = $("#pdf-file"); input.files = event.dataTransfer.files; $("#file-label").textContent = input.files[0]?.name || "Chọn PDF"; });
let searchTimer;
$("#paper-search").addEventListener("input", event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = event.target.value.trim(); loadPapers(); }, 250); });
$$('#status-filters button').forEach(button => button.addEventListener("click", () => { $$('#status-filters button').forEach(item => item.classList.remove("active")); button.classList.add("active"); state.status = button.dataset.status; loadPapers(); }));
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeUpload(); closeDrawer(); if ($('.sidebar').classList.contains('open')) toggleMobileNav(false); } });
