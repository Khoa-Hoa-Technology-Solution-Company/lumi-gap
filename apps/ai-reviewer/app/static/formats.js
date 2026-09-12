const formatState = {profiles: [], requests: new Map(), selections: new Map(), timer: null};
const formatLabels = {pass: 'Đạt phép kiểm tra', fail: 'Sai quy tắc', warning: 'Cần đối chiếu', not_assessed: 'Chưa đánh giá'};
const formatOutcomes = {needs_changes: 'Cần chỉnh sửa', needs_manual_review: 'Cần kiểm tra thêm', checks_passed: 'Các phép kiểm tra đều đạt'};

async function renderFormatProfiles(selectedId = null, clone = false) {
  const requestedView = state.currentView;
  const admin = state.user?.role === 'admin' && state.currentView === 'admin-formats';
  $('#formats-view').innerHTML = '<p class="account-muted" role="status">Đang tải chuẩn định dạng…</p>';
  const profiles = await api(admin ? '/api/admin/format-profiles' : '/api/format-profiles');
  if (state.currentView !== requestedView) return;
  formatState.profiles = profiles.filter(p => p.active);
  const selected = profiles.find(p => p.id === selectedId);
  const rules = selected?.rules || {page_sizes: [], tolerance_mm: 2, font_tolerance_pt: .5, manual_checks: ['Đối chiếu với hướng dẫn của nơi nộp bài.']};
  const root = $('#formats-view');
  root.innerHTML = `
    ${admin ? helpAdmin('admin-formats') : ''}
    <section class="format-intro"><div><p class="eyebrow">FORMAT STUDIO</p><h2>Đúng nội dung.<br><span>Chuẩn trình bày.</span></h2><p>Chọn cấu hình phù hợp với nơi nộp bài. Kiểm tra khổ giấy, cỡ chữ và bố cục PDF, với bằng chứng trên từng trang.</p></div><div class="format-intro-note"><strong>01 · Chọn chuẩn</strong><strong>02 · Mở bài trong thư viện</strong><strong>03 · Kiểm tra & chỉnh sửa</strong><small>Chạy tại máy chủ · Không trừ credit</small></div></section>
    <div class="section-heading"><div><p class="eyebrow">BỘ QUY TẮC</p><h2>Chuẩn định dạng</h2></div>${admin ? '<button id="new-format" class="button button-primary">＋ Tạo chuẩn</button>' : '<button class="button button-primary" data-format-library>Mở thư viện →</button>'}</div>
    <p class="account-muted">Các mẫu có sẵn là cấu hình khởi đầu theo biến thể. Kết quả chỉ bao phủ những quy tắc đã bật; luôn đối chiếu template của hội nghị hoặc tạp chí.</p>
    <div class="format-profile-grid">${profiles.map(p => `<article class="format-profile-card ${p.id === selectedId ? 'selected' : ''}"><div class="paper-card-top"><span class="file-type">${p.template_filename ? escapeHtml(p.template_filename.split('.').pop().toUpperCase()) : 'PRESET'}</span><span class="status-chip ${p.active ? 'reviewed' : 'pending'}">${p.active ? 'Đang bật' : 'Bản nháp / Đã tắt'}</span></div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p><div class="format-facts"><span>v${p.revision}</span><span>${p.rules.body_font_pt ? p.rules.body_font_pt + ' pt' : 'Cỡ chữ tùy chọn'}</span><span>${p.rules.columns ? p.rules.columns + ' cột' : 'Cột tùy chọn'}</span></div><div class="detail-actions"><button class="button button-ghost" data-format-select="${p.id}">${admin ? 'Quản lý' : 'Xem quy tắc'}</button>${admin ? `<button class="text-button" data-format-clone="${p.id}">Nhân bản</button>` : ''}</div></article>`).join('') || '<div class="empty-state">Chưa có chuẩn đang bật. Liên hệ quản trị viên để cấu hình.</div>'}</div>
    ${!admin && selected ? `<section class="panel account-section"><h3>${escapeHtml(selected.name)}</h3>${sourceLink(selected.source_url)}${formatRuleSummary(rules)}<button data-format-library class="button button-primary">Mở thư viện để kiểm tra</button></section>` : ''}
    ${admin ? `
    <section class="panel account-section"><div class="panel-heading"><div><p class="eyebrow">TEMPLATE CỦA BẠN</p><h3>Nạp template</h3></div><span class="panel-badge">Tối đa 10 MB</span></div><p class="account-muted">PDF · Word (.docx) · LaTeX (.tex) · JSON quy tắc. Tạo bản nháp để xem lại thông tin trước khi bật. File .doc cần lưu thành .docx.</p><form id="format-import" class="account-form"><div class="settings-grid"><label>Tên chuẩn<input name="name" maxlength="120" placeholder="Ví dụ: Hội nghị ABC 2027"></label><label>File template<input name="file" type="file" accept=".pdf,.docx,.tex,.json" required></label></div><button class="button button-secondary" type="submit">Nạp & tạo bản nháp</button></form></section>
    <section class="panel account-section" id="format-editor"><div class="panel-heading"><div><p class="eyebrow">CẤU HÌNH</p><h3>${selected && !clone ? 'Chỉnh sửa chuẩn · v' + selected.revision : 'Tạo chuẩn mới'}</h3></div></div>
    <form id="format-form" class="account-form">
      <div class="settings-grid"><label>Tên chuẩn<input name="name" required maxlength="120" value="${escapeHtml((selected?.name || '') + (clone ? ' · Bản sao' : ''))}"></label><label>Nguồn hướng dẫn<input name="source_url" type="url" maxlength="1500" placeholder="https://…" value="${escapeHtml(selected?.source_url || '')}"></label></div>
      <label>Mô tả và phạm vi áp dụng<textarea name="description" rows="3" maxlength="1000">${escapeHtml(selected?.description || '')}</textarea></label>
      <div class="settings-grid">
        <label>Khổ giấy chấp nhận (mm, mỗi dòng: rộng × cao)<textarea name="page_sizes" rows="2" placeholder="210 x 297">${(rules.page_sizes || []).map(s => s.width_mm + ' x ' + s.height_mm).join('\n')}</textarea></label>
        <label>Tối đa số trang (gồm toàn bộ PDF)<input name="max_pages" type="number" min="1" max="200" placeholder="Không giới hạn theo chuẩn" value="${rules.max_pages || ''}"></label>
        <label>Cỡ chữ thân bài (pt)<input name="body_font_pt" type="number" min="5" max="30" step="0.1" placeholder="Không kiểm tra" value="${rules.body_font_pt || ''}"></label>
        <label>Số cột (kiểm tra bằng ước lượng)<select name="columns"><option value="">Không kiểm tra</option value="1" ${rules.columns === 1 ? 'selected' : ''}>1 cột</option><option value="2" ${rules.columns === 2 ? 'selected' : ''}>2 cột</option></select></label>
        <label>Dung sai khổ giấy / lề (mm)<input name="tolerance_mm" type="number" min="0" max="10" step="0.1" value="${rules.tolerance_mm ?? 2}" required></label>
        <label>Dung sai cỡ chữ (pt)<input name="font_tolerance_pt" type="number" min="0" max="3" step="0.1" value="${rules.font_tolerance_pt ?? .5}" required></label>
      </div>
      <fieldset><legend>Lề văn bản tối thiểu (mm)</legend><p class="account-muted">Để trống cả bốn để bỏ qua. Đo từ ký tự gần mép nhất, gồm header/footer; không phải lề nguồn Word/LaTeX và không bao gồm hình.</p><div class="format-margin-grid">${[['top', 'Trên'], ['bottom', 'Dưới'], ['left', 'Trái'], ['right', 'Phải']].map(([key, label]) => `<label>${label}<input name="margin_${key}" type="number" min="0" max="150" step="0.1" value="${rules.min_text_margins_mm?.[key] ?? ''}"></label>`).join('')}</div></fieldset>
      <div class="settings-grid"><label>Tên font cho phép (mỗi dòng một tên)<textarea name="font_names" rows="3" placeholder="Times\nNimbusRom">${escapeHtml((rules.font_names || []).join('\n'))}</textarea></label><label>Mục cần tìm (mỗi dòng một tên)<textarea name="required_sections" rows="3" placeholder="Abstract\nReferences">${escapeHtml((rules.required_sections || []).join('\n'))}</textarea></label></div>
      <label>Checklist kiểm tra thủ công (mỗi dòng một yêu cầu)<textarea name="manual_checks" rows="4">${escapeHtml((rules.manual_checks || []).join('\n'))}</textarea></label>
      <label class="check-label"><input name="active" type="checkbox" ${(!selected || selected.active) ? 'checked' : ''}> Bật chuẩn này cho người dùng</label>
      ${selected?.template_filename && !clone ? `<p class="account-muted">Template: ${escapeHtml(selected.template_filename)} · <a href="/api/admin/format-profiles/${selected.id}/template">Tải file gốc</a></p>` : ''}
      <div class="detail-actions"><button class="button button-primary" type="submit">${selected && !clone ? 'Lưu phiên bản mới' : 'Tạo chuẩn'}</button>${selected ? `<a class="button button-ghost" href="/api/admin/format-profiles/${selected.id}/rules">Xuất quy tắc JSON</a>` : ''}</div>
      <p class="account-muted">Kết quả đã chạy giữ nguyên quy tắc và phiên bản cũ. Tắt chuẩn chỉ ngừng nhận kiểm tra mới.</p>
    </form></section>` : ''}`;
  $$('[data-format-library]', root).forEach(b => b.onclick = () => showView('papers'));
  $$('[data-format-select]', root).forEach(b => b.onclick = () => renderFormatProfiles(Number(b.dataset.formatSelect)).then(() => $('#format-editor')?.scrollIntoView({behavior: 'smooth'})).catch(e => toast(e.message, 'error')));
  $$('[data-format-clone]', root).forEach(b => b.onclick = () => renderFormatProfiles(Number(b.dataset.formatClone), true).then(() => $('#format-editor')?.scrollIntoView({behavior: 'smooth'})).catch(e => toast(e.message, 'error')));
  if (!admin) return;
  $('#new-format').onclick = () => renderFormatProfiles().then(() => $('#format-editor').scrollIntoView({behavior: 'smooth'})).catch(e => toast(e.message, 'error'));
  $('#format-import').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    await withBusy($('[type="submit"]', form), async () => {
      if (form.elements.file.files[0].size > 10 * 1024 * 1024) throw new Error('Template tối đa 10 MB');
      const profile = await api('/api/admin/format-profiles/import', {method: 'POST', body: new FormData(form)});
      await renderFormatProfiles(profile.id); $('#format-editor').scrollIntoView({behavior: 'smooth'});
      toast('Đã tạo bản nháp. Xem lại quy tắc và bật khi sẵn sàng.');
    });
  };
  $('#format-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, el = form.elements;
    await withBusy($('[type="submit"]', form), async () => {
      const lines = name => el[name].value.split('\n').map(s => s.trim()).filter(Boolean);
      const optional = name => el[name].value === '' ? null : Number(el[name].value);
      const sizes = lines('page_sizes').map(line => {
        const match = line.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
        if (!match) throw new Error('Khổ giấy: nhập rộng x cao, ví dụ 210 x 297');
        return {width_mm: Number(match[1]), height_mm: Number(match[2])};
      });
      const sides = ['top', 'bottom', 'left', 'right'];
      const margins = sides.every(s => el['margin_' + s].value === '') ? null : Object.fromEntries(sides.map(s => [s, optional('margin_' + s) ?? 0]));
      const body = {name: el.name.value, description: el.description.value, source_url: el.source_url.value, active: el.active.checked,
        revision: selected && !clone ? selected.revision : null,
        rules: {page_sizes: sizes, max_pages: optional('max_pages'), body_font_pt: optional('body_font_pt'), columns: optional('columns'),
          tolerance_mm: Number(el.tolerance_mm.value), font_tolerance_pt: Number(el.font_tolerance_pt.value), min_text_margins_mm: margins,
          font_names: lines('font_names'), required_sections: lines('required_sections'), manual_checks: lines('manual_checks')}};
      const editing = selected && !clone;
      const saved = await api(editing ? `/api/admin/format-profiles/${selected.id}` : '/api/admin/format-profiles', jsonRequest(editing ? 'PUT' : 'POST', body));
      await renderFormatProfiles(saved.id); toast('Đã lưu chuẩn định dạng.');
    });
  };
}

function sourceLink(url) {
  // Only validated HTTP(S) links can be clickable; escape the attribute too.
  return /^https?:\/\//i.test(url || '') ? `<a class="text-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Hướng dẫn gốc ↗</a>` : '';
}

function formatRuleSummary(rules) {
  const entries = [];
  if (rules.page_sizes?.length) entries.push(['Khổ giấy', rules.page_sizes.map(s => `${s.width_mm} × ${s.height_mm} mm`).join(' hoặc ')]);
  if (rules.max_pages) entries.push(['Số trang tối đa', rules.max_pages + ' trang, gồm toàn bộ PDF']);
  if (rules.body_font_pt) entries.push(['Cỡ chữ phổ biến', `${rules.body_font_pt} ± ${rules.font_tolerance_pt} pt`]);
  if (rules.columns) entries.push(['Số cột', rules.columns + ' cột, ước lượng và đối chiếu bằng mắt']);
  if (rules.font_names?.length) entries.push(['Font cho phép', rules.font_names.join(', ')]);
  if (rules.min_text_margins_mm) entries.push(['Lề văn bản tối thiểu', [['top', 'Trên'], ['bottom', 'Dưới'], ['left', 'Trái'], ['right', 'Phải']].map(([k, label]) => `${label}: ${rules.min_text_margins_mm[k]} mm`).join(' · ')]);
  if (rules.required_sections?.length) entries.push(['Mục cần tìm', rules.required_sections.join(', ')]);
  entries.push(['Dung sai khổ giấy / lề', rules.tolerance_mm + ' mm']);
  return `<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Tiêu chí</th><th>Yêu cầu</th></tr></thead><tbody>${entries.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table></div>${rules.manual_checks?.length ? '<h4>Cần kiểm tra thủ công</h4><ul>' + rules.manual_checks.map(s => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>' : ''}`;
}

async function loadFormatPanel(paperId) {
  clearTimeout(formatState.timer);
  const root = $('#paper-format-panel');
  if (!root) return;
  try {
    const [profiles, checks] = await Promise.all([api('/api/format-profiles'), api(`/api/papers/${paperId}/format-checks`)]);
    if (!root.isConnected || state.selectedPaper?.id !== paperId) return;
    const running = checks.some(c => ['queued', 'running'].includes(c.status));
    root.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">FORMAT CHECK</p><h3>Kiểm tra định dạng</h3></div><span class="panel-badge">Miễn phí</span></div>
      <p class="account-muted">Đối chiếu PDF với chuẩn hoặc template đã cấu hình. Báo cáo gồm số đo từng trang và mục cần kiểm tra thêm.</p>
      <div class="format-check-controls"><label>Chuẩn định dạng<select id="paper-format-select">${profiles.map(p => `<option value="${p.id}" ${formatState.selections.get(paperId) === p.id ? 'selected' : ''}>${escapeHtml(p.name)} · v${p.revision}</option>`).join('')}</select></label><button id="run-format-check" class="button button-secondary" ${running || !profiles.length ? 'disabled' : ''}>${running ? 'Đang kiểm tra…' : 'Kiểm tra định dạng'}</button></div>
      ${!profiles.length ? '<p>Chưa có chuẩn khả dụng. Quản trị viên cần bật chuẩn trong mục Chuẩn định dạng.</p>' : ''}
      <div class="format-history">${checks.map(c => `<article class="review-row"><div><strong>${escapeHtml(c.profile.name)} · v${c.profile.revision}</strong><p>${formatDate(c.created_at)} · ${c.status === 'completed' ? 'Hoàn tất' : c.status === 'failed' ? 'Thất bại' : 'Đang xử lý'}</p>${c.error ? `<p class="error-box">${escapeHtml(c.error)}</p>` : ''}</div>${c.status === 'completed' ? `<button class="text-button" data-format-report="${c.id}">Xem kết quả →</button>` : ''}</article>`).join('') || '<p class="account-muted">Chưa có kiểm tra định dạng cho bài này.</p>'}</div><div id="format-report-slot" aria-live="polite"></div>`;
    const select = $('#paper-format-select');
    select.onchange = () => formatState.selections.set(paperId, Number(select.value));
    $('#run-format-check').onclick = () => withBusy($('#run-format-check'), async () => {
      const profileId = Number(select.value), key = `${paperId}:${profileId}`;
      if (!formatState.requests.has(key)) formatState.requests.set(key, crypto.randomUUID());
      const captcha = await captchaToken('review');
      await api(`/api/papers/${paperId}/format-checks`, jsonRequest('POST', {profile_id: profileId, request_id: formatState.requests.get(key), captcha_token: captcha}));
      formatState.requests.delete(key); formatState.selections.set(paperId, profileId);
      toast('Đã nhận kiểm tra định dạng. Không trừ credit.'); await loadFormatPanel(paperId);
    });
    $$('[data-format-report]', root).forEach(b => b.onclick = () => showFormatReport(Number(b.dataset.formatReport)).catch(e => toast(e.message, 'error')));
    if (running) formatState.timer = setTimeout(() => { if ($('#detail-drawer').classList.contains('open')) loadFormatPanel(paperId); }, 2000);
  } catch (error) {
    if (root.isConnected) {
      root.innerHTML = `<p class="error-box">${escapeHtml(error.message)}</p><button class="button button-ghost">Tải lại kiểm tra định dạng</button>`;
      $('button', root).onclick = () => loadFormatPanel(paperId);
    }
  }
}

async function showFormatReport(id) {
  const slot = $('#format-report-slot');
  const check = await api(`/api/format-checks/${id}`);
  if (!slot?.isConnected) return;
  const result = check.result;
  if (!result) throw new Error('Báo cáo chưa sẵn sàng');
  slot.innerHTML = `<section class="format-report"><p class="eyebrow">KẾT QUẢ · ${escapeHtml(check.profile.name)} · v${check.profile.revision}</p><h3>${formatOutcomes[result.outcome]}</h3>
    <div class="format-counts">${Object.entries(result.counts).map(([s, n]) => `<span class="format-status ${s}"><strong>${n}</strong> ${formatLabels[s]}</span>`).join('')}</div>
    <div class="detail-actions"><a class="button button-ghost" href="/api/format-checks/${id}/report">Tải Markdown</a><a class="button button-ghost" href="/api/format-checks/${id}/report?kind=json">Tải dữ liệu JSON</a></div>
    <div class="format-limitations">${result.limitations.map(s => `<p>${escapeHtml(s)}</p>`).join('')}</div>
    <label class="format-filter">Hiển thị<select id="format-result-filter"><option value="all">Tất cả kết quả</option><option value="attention" selected>Cần xử lý / đối chiếu</option><option value="pass">Đã đạt phép kiểm tra</option></select></label><div id="format-findings"></div></section>`;
  const render = () => {
    const filter = $('#format-result-filter').value;
    const findings = result.findings.filter(f => filter === 'all' || (filter === 'pass' ? f.status === 'pass' : f.status !== 'pass'));
    $('#format-findings').innerHTML = findings.map(f => `<article class="format-finding"><div class="paper-card-top"><span class="format-status ${f.status}">${formatLabels[f.status]}</span><span class="file-type">${f.page ? 'TRANG ' + f.page : 'TOÀN BÀI'}</span></div><h4>${escapeHtml(f.rule)}</h4><dl><dt>Đo được</dt><dd>${escapeHtml(f.evidence)}</dd><dt>Yêu cầu</dt><dd>${escapeHtml(f.expected)}</dd><dt>Cách xử lý</dt><dd>${escapeHtml(f.correction)}</dd></dl></article>`).join('') || '<p class="account-muted">Không có kết quả trong bộ lọc này.</p>';
  };
  $('#format-result-filter').onchange = render; render(); slot.scrollIntoView({behavior: 'smooth', block: 'start'});
}
