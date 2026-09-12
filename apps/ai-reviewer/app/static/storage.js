const storageBytes = value => `${new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 2}).format(value / 1048576)} MB`;
const storageDate = value => new Intl.DateTimeFormat('vi-VN', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value * 1000));
let storageTimer, storageExpiryTimer;

function syncStorageState(data) {
  state.storageLocked = data.library_locked;
  clearTimeout(storageExpiryTimer);
  if (data.subscription.active) {
    const delay = Math.min(2147480000, Math.max(1000, (data.subscription.expires_at - data.server_time) * 1000 + 500));
    storageExpiryTimer = setTimeout(async () => {
      try { const latest = await api('/api/storage'); syncStorageState(latest); if (latest.library_locked) lockStorageView(); }
      catch (error) { toast(error.message, 'error'); }
    }, delay);
  }
}

function lockStorageView() {
  const alreadyLocked = state.storageLocked && state.currentView === 'storage';
  state.storageLocked = true; state.selectedPaper = null; state.papers = [];
  closeDrawer(); closeUpload();
  $('#drawer-body').innerHTML = ''; $('#paper-list').innerHTML = ''; $('#recent-papers').innerHTML = '';
  if (!alreadyLocked) showView('storage').catch(error => toast(error.message, 'error'));
}

function storageLocation(paper) {
  if (paper.storage_busy) return 'Đang chuyển file';
  if (paper.drive_pending || paper.storage_error) return 'Còn file local · chờ chuyển Drive';
  if (paper.drive_files && paper.local_files) return 'Local + Drive';
  return paper.drive_files ? 'Google Drive' : 'Local server';
}

async function renderStorage() {
  clearTimeout(storageTimer);
  const data = await api('/api/storage');
  syncStorageState(data);
  $('#paper-nav-count').textContent = data.papers.length;
  const sub = data.subscription, expiring = new Set(data.expiry_candidates.map(p => p.id));
  const percent = Math.min(100, data.used_bytes / data.quota_bytes * 100);
  $('#storage-view').innerHTML = `
    ${data.library_locked ? `<section class="storage-error" role="alert"><h2>Thư viện đang bị khóa xem</h2><p>Gia hạn toàn bộ ${sub.units * 100} MB với <strong>${sub.renewal_cost} credit</strong>, hoặc xóa bớt bài để trở về ${storageBytes(data.base_bytes)}.</p><p>${sub.warning_sent_at ? `Nếu chưa xử lý, từ ${storageDate(sub.delete_after)} hệ thống sẽ xóa các bài cũ nhất cho đến khi về trong mức miễn phí.` : 'Email thông báo đang chờ gửi. Hệ thống chỉ tự xóa sau khi đã thông báo và đủ thời gian 7 ngày.'}</p><p>${expiring.size} bài hiện nằm trong danh sách dự kiến xóa bên dưới.</p></section>` : ''}
    <div class="account-grid">
      <section class="panel storage-summary"><p class="eyebrow">KHÔNG GIAN CỦA BẠN</p><h2>${storageBytes(data.used_bytes)} <small>/ ${storageBytes(data.quota_bytes)}</small></h2>
        <progress max="100" value="${percent}" aria-label="Dung lượng đã sử dụng"></progress>
        <p>${data.over_quota ? 'Đã vượt hạn mức. Xóa bớt bài hoặc mua thêm để tiếp tục upload và tạo review.' : `Còn ${storageBytes(data.available_bytes)} để upload.`}</p>
        <div class="storage-facts"><span>PDF <strong>${storageBytes(data.pdf_bytes)}</strong></span><span>Kết quả <strong>${storageBytes(data.artifact_bytes)}</strong></span><span>Đang upload <strong>${storageBytes(data.reserved_bytes)}</strong></span></div>
        <p class="account-muted">Miễn phí ${storageBytes(data.base_bytes)} · Gói còn hạn ${storageBytes(data.extra_bytes)}.<br>Mỗi PDF tối đa ${storageBytes(data.upload_max_bytes)}. Dung lượng tính cả file local và Drive.</p>
        <button class="button button-ghost" id="refresh-storage">Cập nhật dung lượng</button>
      </section>
      <section class="panel" id="storage-buy-panel"><p class="eyebrow">MỞ RỘNG LƯU TRỮ</p><h2>100 MB / 30 ngày</h2>
        <p><strong>${data.plan.price_credits} credit</strong> / 100 MB. Dung lượng mua thêm được cộng dồn vào một gói duy nhất.</p>
        <form class="account-form" id="storage-buy-form"><label>Số gói 100 MB<input name="units" type="number" min="1" max="100" value="1" step="1" required></label>
          <p id="storage-estimate" aria-live="polite"></p>
          <button class="button button-primary" ${data.plan.enabled ? '' : 'disabled'}>${data.plan.enabled ? 'Xem phí mua thêm' : 'Đang tạm đóng bán gói'}</button>
        </form>
        <p class="account-muted">Mua thêm giữa kỳ thu đủ đơn giá 30 ngày cho phần thêm, giữ nguyên ngày hết hạn chung${sub.active ? `: ${storageDate(sub.expires_at)}` : ''}. Khi gói đã hết hạn, mua thêm sẽ thanh toán gia hạn toàn bộ dung lượng cũ và mới.</p>
        <button class="text-button" id="storage-wallet">Nạp thêm credit →</button>
      </section>
    </div>
    <section class="panel account-section"><div class="panel-heading"><div><p class="eyebrow">DỌN DẸP THƯ VIỆN</p><h2>Bài báo & file kết quả</h2></div><button class="button button-ghost" id="storage-delete-selected" disabled>Xóa bài đã chọn</button></div>
      <p class="account-muted">Xóa vĩnh viễn PDF, mọi bản review, kết quả kiểm tra và file trong outputs/Drive. Lịch sử thanh toán vẫn giữ lại. Bài đang xử lý chưa thể xóa.</p>
      <div class="storage-paper-list">${data.papers.map(paper => `<article class="storage-paper" data-storage-paper="${paper.id}">
        <label class="storage-select"><input type="checkbox" data-select-paper="${paper.id}" aria-label="Chọn ${escapeHtml(paper.title)}" ${paper.job_busy || paper.storage_busy ? 'disabled' : ''}></label>
        <div class="storage-paper-title"><strong>${escapeHtml(paper.title)}</strong><small>${escapeHtml(paper.filename)} · ${formatDate(paper.uploaded_at)}</small><span class="status-chip">${paper.deletion_pending ? 'Chưa xóa hết file' : storageLocation(paper)}</span>${expiring.has(paper.id) ? '<small class="danger-text">Dự kiến xóa khi hết thời gian giữ dữ liệu</small>' : ''}</div>
        <strong class="storage-paper-size">${storageBytes(paper.used_bytes)}</strong>
        <div class="storage-paper-actions"><button class="text-button" data-storage-open="${paper.id}" ${paper.deletion_pending || data.library_locked ? 'disabled' : ''}>${data.library_locked ? 'Đã khóa xem' : 'Mở'}</button>
        ${data.drive_enabled && paper.local_files && !paper.deletion_pending ? `<button class="text-button" data-storage-drive="${paper.id}" ${paper.job_busy || paper.storage_busy ? 'disabled' : ''}>${paper.drive_pending ? 'Thử chuyển lại' : 'Chuyển lên Drive'}</button>` : ''}
        <button class="text-button danger-text" data-storage-delete="${paper.id}" ${paper.job_busy || paper.storage_busy ? 'disabled' : ''}>${paper.deletion_pending ? 'Thử xóa lại' : 'Xóa vĩnh viễn'}</button></div>
      </article>`).join('') || '<p class="account-muted">Chưa có bài báo trong tài khoản.</p>'}</div>
    </section>
    <section class="panel account-section"><h2>Gói dung lượng của bạn</h2>
      ${sub.units ? `<article class="storage-plan"><div><strong id="storage-total-paid">${sub.units * 100} MB mua thêm</strong><span class="status-chip ${sub.active ? 'reviewed' : ''}">${sub.active ? 'Còn hiệu lực' : 'Đã hết hạn'}</span></div><p>Ngày gia hạn chung: <strong>${storageDate(sub.expires_at)}</strong></p><p>Gia hạn toàn bộ dung lượng: <strong>${sub.renewal_cost} credit / 30 ngày</strong>.</p><button id="storage-renew" class="button button-primary" ${data.plan.enabled && !sub.cleanup_busy ? '' : 'disabled'}>Xem phí gia hạn toàn bộ</button></article>` : '<p class="account-muted">Bạn đang dùng dung lượng miễn phí.</p>'}
      <p class="account-muted">Hết hạn và vượt mức miễn phí sẽ khóa xem toàn bộ thư viện. Sau 7 ngày, các bài cũ vượt mức sẽ bị xóa vĩnh viễn, kèm thông báo email. Không tự trừ credit gia hạn.</p>
      <h3>Lịch sử mua & gia hạn</h3><div class="ledger-list">${data.purchases.map(plan => `<div><span>${plan.action === 'renew' ? 'Gia hạn toàn bộ' : plan.action === 'legacy' ? 'Giao dịch trước khi gộp gói' : 'Mua thêm'} ${storageBytes(plan.units * plan.unit_bytes)}<small>${storageDate(plan.starts_at)} · ${plan.unit_price} credit / 100 MB</small></span><strong>−${plan.cost} credit</strong></div>`).join('') || '<p class="account-muted">Chưa có giao dịch dung lượng.</p>'}</div>
    </section>
    <section class="panel account-section"><h2>Hạn mức tác vụ</h2><p>AI: ${data.limits.ai_per_minute} lần/phút, ${data.limits.ai_per_day} lần/ngày (UTC), tối đa ${data.limits.ai_concurrent} tác vụ đồng thời.</p><p class="account-muted">Áp dụng cả key cá nhân và key hệ thống. Lần chạy lỗi vẫn tính vào hạn mức chống spam; credit review lỗi được hoàn. Xóa bài không đặt lại hạn mức.</p></section>`;
  $('#refresh-storage').onclick = () => withBusy($('#refresh-storage'), renderStorage);
  $('#storage-wallet').onclick = () => showView('wallet');
  const buyForm = $('#storage-buy-form');
  const estimate = () => {
    const units = Number(buyForm.elements.units.value), total = sub.units + units;
    $('#storage-estimate').textContent = `Thêm ${units * 100} MB → tổng mua thêm ${total * 100} MB. Phí dự kiến lúc này: ${(sub.expired ? total : units) * data.plan.price_credits} credit. Gia hạn kỳ sau: ${total * data.plan.price_credits} credit.`;
  };
  buyForm.elements.units.oninput = estimate; estimate();
  buyForm.onsubmit = event => {
    event.preventDefault();
    withBusy($('button', buyForm), () => purchaseStorage('add', Number(buyForm.elements.units.value)));
  };
  if ($('#storage-renew')) $('#storage-renew').onclick = () => withBusy($('#storage-renew'), () => purchaseStorage('renew', 0));
  const selectButton = $('#storage-delete-selected');
  $$('[data-select-paper]').forEach(box => box.onchange = () => { selectButton.disabled = !$$('[data-select-paper]:checked').length; });
  selectButton.onclick = () => deleteStoragePapers(data.papers.filter(p => $(`[data-select-paper="${p.id}"]`)?.checked));
  $$('[data-storage-delete]').forEach(button => button.onclick = () => deleteStoragePapers(data.papers.filter(p => p.id === Number(button.dataset.storageDelete))));
  $$('[data-storage-open]').forEach(button => button.onclick = () => openPaper(Number(button.dataset.storageOpen)));
  $$('[data-storage-drive]').forEach(button => button.onclick = () => withBusy(button, async () => {
    await api(`/api/papers/${button.dataset.storageDrive}/storage/drive`, {method: 'POST'});
    toast('Đã yêu cầu chuyển file lên Drive.'); await renderStorage();
  }));
  if ((data.library_locked || data.papers.some(p => p.storage_busy)) && state.currentView === 'storage') {
    storageTimer = setTimeout(() => { if (state.currentView === 'storage') renderStorage().catch(error => toast(error.message, 'error')); }, data.library_locked ? 30000 : 5000);
  }
}

async function purchaseStorage(action, units) {
  const key = `lrp:shared-storage:${state.user.id}:${action}:${units}`;
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(key)); } catch (_) { sessionStorage.removeItem(key); }
  if (!pending) {
    const quote = await api('/api/storage/quotes', jsonRequest('POST', {action, units}));
    pending = {quote, request_id: crypto.randomUUID()};
    sessionStorage.setItem(key, JSON.stringify(pending));
  }
  const q = pending.quote;
  if (!confirm(`${action === 'renew' ? 'Gia hạn toàn bộ' : 'Mua thêm'} dung lượng\nThanh toán: ${q.cost} credit\nTổng dung lượng mua thêm sau giao dịch: ${q.total_units * 100} MB\nNgày hết hạn chung: ${storageDate(q.expires_at)}\nPhí gia hạn kỳ tiếp theo theo giá hiện tại: ${q.renewal_cost} credit.\n\nMua thêm giữa kỳ thu đủ phí cho phần thêm và giữ ngày hết hạn chung. Xác nhận thanh toán?`)) return;
  try {
    await api('/api/storage/purchases', jsonRequest('POST', {quote_id: q.id, request_id: pending.request_id}));
    sessionStorage.removeItem(key);
    await refreshAccount(); await renderStorage();
    if (!state.storageLocked) await Promise.all([loadPapers(), loadDashboard()]);
    toast('Đã cập nhật gói dung lượng và ngày gia hạn chung.');
  } catch (error) {
    if (error.status === 409 || error.status === 422) sessionStorage.removeItem(key);
    throw error;
  }
}

async function deleteStoragePapers(papers) {
  if (!papers.length || !confirm(`Xóa vĩnh viễn ${papers.length} bài (${storageBytes(papers.reduce((sum, p) => sum + p.used_bytes, 0))}) cùng mọi kết quả và file? Không thể khôi phục.\n\n${papers.slice(0, 5).map(p => p.title).join('\n')}`)) return;
  $$('button, input', $('#storage-view')).forEach(button => button.disabled = true);
  let deleted = 0, failures = [];
  for (const paper of papers) {
    try { await api(`/api/papers/${paper.id}`, {method: 'DELETE'}); deleted++; }
    catch (error) { failures.push(`${paper.title}: ${error.message}`); }
  }
  if (papers.some(p => p.id === state.selectedPaper?.id)) { closeDrawer(); state.selectedPaper = null; }
  await renderStorage();
  if (!state.storageLocked) await Promise.all([loadPapers(), loadDashboard()]);
  toast(`Đã xóa ${deleted}/${papers.length} bài.${failures.length ? ' Một số bài chưa xóa được; xem trạng thái và thử lại.' : ''}`, failures.length ? 'error' : 'success');
  if (failures.length) {
    const notice = document.createElement('p'); notice.className = 'storage-error'; notice.setAttribute('role', 'alert');
    notice.textContent = failures.join('\n'); $('#storage-view').prepend(notice);
  }
}

function showStorageQuota(error) {
  closeUpload();
  const dialog = $('#storage-quota-dialog');
  $('#storage-quota-message').textContent = `Đã dùng ${storageBytes(error.detail.used_bytes)} / ${storageBytes(error.detail.quota_bytes)}. Bạn muốn chọn bài cũ để xóa và giải phóng dung lượng?`;
  dialog.showModal();
  $('#quota-cleanup').onclick = async () => { dialog.close(); closeDrawer(); await showView('storage'); };
  $('#quota-buy').onclick = async () => { dialog.close(); closeDrawer(); await showView('storage'); $('#storage-buy-panel')?.scrollIntoView({behavior: 'smooth'}); };
  $('#quota-cancel').onclick = () => dialog.close();
}

async function renderStorageAdmin(section = 'storage') {
  const data = await api('/api/admin/storage/settings'), policy = data.settings;
  if (state.currentView !== `admin-${section}`) return;
  const labels = {
    storage_base_mb: ['Dung lượng miễn phí mỗi user (MB)', 1, 102400], upload_max_mb: ['Upload tối đa mỗi PDF (MB)', 1, 200],
    storage_price_credits: ['Giá 100 MB / 30 ngày (credit)', 1, 1000000], requests_per_minute: ['API request / user / phút', 30, 10000],
    uploads_per_minute: ['Upload / user / phút', 1, 60], ai_per_minute: ['Review AI / user / phút', 1, 60],
    ai_per_day: ['Review AI / user / ngày UTC', 1, 10000], ai_concurrent: ['AI đồng thời / user', 1, 10],
    ai_global_concurrent: ['AI đồng thời toàn hệ thống', 1, 32], format_per_day: ['Kiểm tra format / user / ngày UTC', 1, 10000],
    format_global_concurrent: ['Kiểm tra format đồng thời toàn hệ thống', 1, 16],
  };
  Object.keys(labels).forEach(key => { if ((section === 'storage') !== ['storage_base_mb', 'upload_max_mb', 'storage_price_credits'].includes(key)) delete labels[key]; });
  const panel = document.createElement('section'); panel.className = 'panel account-section'; panel.id = 'storage-admin';
  panel.innerHTML = `<p class="eyebrow">${section === 'storage' ? 'DUNG LƯỢNG' : 'GIỚI HẠN TÁC VỤ'}</p><h2>${section === 'storage' ? 'Dung lượng & Google Drive' : 'Chống spam & giới hạn AI'}</h2>
    <form class="account-form" id="storage-settings-form"><div class="settings-grid">${Object.entries(labels).map(([name, [label, min, max]]) => `<label>${label}<input type="number" name="${name}" value="${policy[name]}" min="${min}" max="${max}" step="1" required></label>`).join('')}</div>
      <label class="check-label"><input name="storage_sales_enabled" type="checkbox" ${policy.storage_sales_enabled ? 'checked' : ''}> Cho phép mua thêm dung lượng</label>
      <div class="settings-grid"><label>Nơi lưu file mới<select name="storage_backend"><option value="local" ${policy.storage_backend === 'local' ? 'selected' : ''}>Local server</option><option value="drive" ${policy.storage_backend === 'drive' ? 'selected' : ''}>Google Drive hệ thống</option></select></label><label>ID thư mục Drive<input name="drive_folder_id" value="${escapeHtml(policy.drive_folder_id)}" maxlength="200" pattern="[A-Za-z0-9_-]*"></label></div>
      <p class="account-muted">Credentials Drive: ${data.drive_credentials_configured ? 'đã khai báo trên máy chủ' : 'chưa khai báo SYSTEM_DRIVE_CREDENTIALS_FILE'}. File chờ chuyển lại: ${data.pending_drive_files}.</p>
      <div class="storage-admin-actions"><button class="button button-primary">Lưu hạn mức & lưu trữ</button><button class="button button-ghost" type="button" id="storage-drive-test">Kiểm tra kết nối Drive</button></div>
      <p id="storage-drive-status" role="status"></p>
      <p class="account-muted">Giá mới áp dụng cho giao dịch mua thêm và gia hạn tiếp theo. Gói hết hạn sẽ khóa thư viện nếu vượt mức miễn phí; tự xóa bài cũ vượt mức sau 7 ngày và sau khi đã gửi email thông báo. Hạ hạn mức riêng lẻ không kích hoạt tự xóa nếu chưa có gói hết hạn. Đổi nơi lưu chỉ áp dụng cho file mới; file cũ vẫn truy xuất theo database. Hướng dẫn tại docs/storage-and-limits.md.</p>
    </form>`;
  $('#admin-view').append(panel);
  const form = $('#storage-settings-form');
  if (section === 'limits') {
    ['storage_sales_enabled', 'storage_backend', 'drive_folder_id'].forEach(key => form.elements[key].closest('label').remove());
    $('#storage-drive-test').remove();
    $$('.account-muted', panel).forEach(node => node.remove());
  }
  form.onsubmit = event => {
    event.preventDefault();
    withBusy($('button', form), async () => {
      const values = Object.fromEntries(new FormData(form));
      Object.keys(labels).forEach(key => values[key] = Number(values[key]));
      if (section === 'storage') values.storage_sales_enabled = form.elements.storage_sales_enabled.checked;
      await api(`/api/admin/storage/settings/${section}`, jsonRequest('PATCH', values));
      publicConfig = await api('/api/config'); toast('Đã lưu hạn mức, giá gói và nơi lưu file.');
    });
  };
  if ($('#storage-drive-test')) $('#storage-drive-test').onclick = () => withBusy($('#storage-drive-test'), async () => {
    const result = await api('/api/admin/storage/drive/test', jsonRequest('POST', {folder_id: form.elements.drive_folder_id.value}));
    $('#storage-drive-status').textContent = `Kết nối thành công: ${result.folder_name}`;
  });
}

function renderStorageEmailAdmin(data) {
  const m = data.mail, status = data.maintenance;
  const panel = document.createElement('section'); panel.className = 'panel account-section'; panel.id = 'storage-email-admin';
  const input = (name, label, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(m[name])}" maxlength="253"></label>`;
  panel.innerHTML = `<p class="eyebrow">THÔNG BÁO GIA HẠN</p><h2>Email & xử lý dữ liệu hết hạn</h2>
    <p>Lịch xử lý tự động: <strong>${status.enabled ? 'Đang bật, kiểm tra mỗi phút' : 'Đang tắt trong ENV'}</strong>. Lần chạy gần nhất: ${status.last_run ? storageDate(status.last_run) : 'Chưa chạy'}.</p>
    <p>Email chờ gửi: ${status.mail_counts.pending || 0} · Đã gửi: ${status.mail_counts.sent || 0} · Cần kiểm tra SMTP: ${status.mail_failures}.</p>
    <form id="storage-email-form" class="account-form"><label class="check-label"><input type="checkbox" name="smtp_enabled" ${m.smtp_enabled ? 'checked' : ''}> Bật email thông báo dung lượng</label>
      <div class="settings-grid">${input('smtp_host', 'SMTP host')}${input('smtp_port', 'SMTP port', 'number')}${input('smtp_username', 'Tài khoản SMTP')}${input('smtp_from', 'Email gửi', 'email')}
        <label>Bảo mật kết nối<select name="smtp_security"><option value="starttls" ${m.smtp_security === 'starttls' ? 'selected' : ''}>STARTTLS (thường cổng 587)</option><option value="ssl" ${m.smtp_security === 'ssl' ? 'selected' : ''}>TLS (thường cổng 465)</option><option value="none" ${m.smtp_security === 'none' ? 'selected' : ''}>SMTP relay nội bộ, không TLS</option></select></label>
        <label>Mật khẩu SMTP<input name="smtp_password" type="password" autocomplete="new-password" maxlength="1024" placeholder="${m.smtp_password_configured ? 'Đã lưu; để trống để giữ nguyên' : 'Chưa cấu hình'}"><span class="check-label"><input type="checkbox" name="clear_password"> Xóa mật khẩu đã lưu</span></label></div>
      <div class="storage-admin-actions"><button class="button button-primary">Lưu cấu hình email</button><button type="button" id="storage-test-email" class="button button-ghost">Gửi email thử tới tài khoản admin này</button></div>
      <p id="storage-email-status" role="status"></p><p class="account-muted">Email nhắc trước 3 ngày, khi hết hạn và trước lúc xóa. Nội dung ghi tổng phí gia hạn và credit còn thiếu. SMTP lỗi sẽ được thử lại; chưa gửi thông báo thì chưa tự xóa. File chỉ bị xóa sau hạn giữ dữ liệu và khi tài khoản vẫn vượt dung lượng miễn phí.</p>
    </form>`;
  $('#admin-view').append(panel);
  const form = $('#storage-email-form');
  form.elements.smtp_port.min = 1; form.elements.smtp_port.max = 65535;
  form.onsubmit = event => {
    event.preventDefault();
    withBusy($('button', form), async () => {
      const values = Object.fromEntries(new FormData(form));
      values.smtp_port = Number(values.smtp_port); values.smtp_enabled = form.elements.smtp_enabled.checked;
      if (!values.smtp_password && !form.elements.clear_password.checked) delete values.smtp_password;
      if (form.elements.clear_password.checked) values.smtp_password = '';
      delete values.clear_password;
      await api('/api/admin/storage/email', jsonRequest('PUT', values));
      form.elements.smtp_password.value = ''; toast('Đã lưu SMTP. Có thể gửi email thử tới chính bạn.');
    });
  };
  $('#storage-test-email').onclick = () => withBusy($('#storage-test-email'), async () => {
    const result = await api('/api/admin/storage/email/test', {method: 'POST'});
    $('#storage-email-status').textContent = `SMTP đã nhận email gửi tới ${result.recipient}. Kiểm tra hộp thư và thư rác.`;
  });
}
