const adminTitles = {
  'admin-dashboard': 'Doanh thu & credit', 'admin-users': 'Quản lý người dùng',
  'admin-payments': 'Giao dịch nạp tiền', 'admin-credits': 'Sổ credit', 'admin-activity': 'Nhật ký hoạt động',
  'admin-billing': 'Cấu hình thanh toán', 'admin-ai': 'Cấu hình AI', 'admin-auth': 'Đăng nhập & CAPTCHA',
  'admin-review-types': 'Loại review', 'admin-formats': 'Template định dạng',
  'admin-storage': 'Dung lượng & Drive', 'admin-limits': 'Giới hạn & chống spam', 'admin-email': 'Email thông báo',
};
const adminHelp = {
  'admin-dashboard': 'Chọn khoảng ngày UTC, tối đa 366 ngày. Tiền thu là tổng đơn PayOS đã thanh toán theo ngày thanh toán; đơn chờ/hủy không được tính. Credit đã dùng lấy từ sổ giao dịch, hoàn phí hiển thị riêng. Số dư và tài nguyên là số hiện tại của toàn hệ thống, không bị lọc theo ngày. Tiền thu từ nạp ví không phải lợi nhuận; chưa trừ chi phí AI/hạ tầng.',
  'admin-users': 'Tìm theo tên, email hoặc ID và lọc trạng thái. Mở từng user để xem tài nguyên, tổng nạp/sử dụng, lịch sử giao dịch và log. Vô hiệu hóa thu hồi phiên đăng nhập và chặn truy cập mới; kích hoạt lại yêu cầu đăng nhập lại. Job đã nhận vẫn hoàn tất, webhook thanh toán hợp lệ vẫn được xử lý. Vô hiệu hóa không dừng thời hạn gói dung lượng và chính sách tự dọn. Không thể tự khóa hoặc tự hạ quyền admin.',
  'admin-payments': 'Danh sách theo ngày tạo đơn (UTC). Chỉ đơn đã thanh toán mới tạo doanh thu và cộng credit. “Kiểm tra PayOS” đối soát với cổng thanh toán; không cộng tiền thủ công và không cộng trùng đơn đã xử lý. Mở user để đối chiếu sổ credit.',
  'admin-credits': 'Mỗi dòng là một biến động credit: nạp ví, phí review, mua/gia hạn dung lượng hoặc hoàn review lỗi. Giá trị dương cộng vào ví, âm trừ khỏi ví. Lịch sử được giữ khi xóa bài. Không quy đổi credit đã dùng thành doanh thu lần nữa vì tiền nạp đã được thống kê ở giao dịch PayOS.',
  'admin-activity': 'Log nghiệp vụ ghi từ lần nâng cấp này: đăng nhập, upload/xóa bài, tạo/chuyển trạng thái review và format, nạp/sử dụng credit, thay đổi quyền. Log giữ lại khi bài bị xóa; lịch sử trước nâng cấp tra ở sổ credit và giao dịch. Tab quản trị ghi người thao tác và tên cấu hình được sửa. Không ghi API key, mật khẩu hoặc nội dung bản thảo.',
  'admin-billing': 'Đặt giá VNĐ/credit và mức nạp tối thiểu (ít nhất 10.000đ, là bội số giá credit). Điền Client ID, API key và checksum key của PayOS; cấu hình webhook /api/payos/webhook trên domain HTTPS của ứng dụng. Đối soát hết đơn đang chờ trước khi đổi tài khoản PayOS. Giá mới chỉ áp dụng cho đơn mới. Key để trống giữ nguyên; đánh dấu xóa để gỡ.',
  'admin-ai': 'Nhập model và Gemini API key của hệ thống, bật nhận review bằng key hệ thống khi sẵn sàng. Phí review: hệ thống 10 credit, key cá nhân 3 credit. Giới hạn phút/ngày/đồng thời nằm ở menu Giới hạn & chống spam. Key để trống giữ nguyên. Thay model không thay đổi kết quả review đã lưu.',
  'admin-auth': 'Google Client ID phải khớp OAuth web client; authorized JavaScript origin trùng APP_BASE_URL. Turnstile cần cả site key và secret key trước khi bật CAPTCHA; domain phải có trong cấu hình Turnstile. APP_BASE_URL, HTTPS và admin đầu tiên được cấu hình bằng ENV. Không dùng API key Gemini vào ô Google Client ID.',
  'admin-review-types': 'Tạo hoặc nạp hướng dẫn Markdown UTF-8 tối đa 128 KB, đặt tên/mô tả rồi bật cho người dùng. Nội dung hướng dẫn quyết định tiêu chí review. Sửa tạo phiên bản mới; review cũ giữ bản hướng dẫn đã dùng. Tắt loại review để ngừng nhận lượt mới.',
  'admin-formats': 'Bắt đầu từ preset IEEE/Springer hoặc nạp PDF, Word .docx, LaTeX .tex, JSON tối đa 10 MB. File .doc cần đổi sang .docx. Template nhập tạo bản nháp; xem lại quy tắc khổ giấy, font, cột, số trang và mục kiểm tra thủ công trước khi bật. Template không tự bảo đảm mọi quy định của nơi nộp bài đều được kiểm tra.',
  'admin-storage': 'Mức miễn phí và giới hạn mỗi PDF độc lập. Giá là credit/100 MB/30 ngày; mua thêm thu đủ phí phần mới, giữ kỳ hạn chung, gia hạn trả tổng phí. Local giữ file trên server. Drive cần credentials hệ thống qua ENV và ID thư mục có quyền thêm/đọc/xóa: kiểm tra kết nối trước khi lưu. File được lưu local, upload/xác minh checksum rồi mới xóa local. Hết hạn + vượt mức miễn phí khóa toàn bộ thư viện và tự dọn bài cũ vượt mức sau 7 ngày, có email cảnh báo.',
  'admin-limits': 'Đặt số request/upload/AI mỗi phút, AI/format mỗi ngày UTC và số job đồng thời. Giới hạn theo user áp dụng cả admin và key cá nhân; lần chạy lỗi vẫn tính lượt chống spam. Xóa bài hoặc đăng xuất không đặt lại hạn mức. Hạ concurrency theo RAM/CPU thực tế; quota dung lượng quản lý riêng ở menu Dung lượng & Drive.',
  'admin-email': 'Nhập SMTP host, cổng, tài khoản, email gửi và mật khẩu; STARTTLS thường cổng 587, TLS thường 465. Bật email, lưu rồi gửi thử đến tài khoản admin đang đăng nhập. Cấu hình web ưu tiên ENV. Kiểm tra hộp thư/spam và trạng thái gửi. Chưa gửi được cảnh báo thì chưa tự xóa; gửi muộn vẫn cho user ít nhất 7 ngày. STORAGE_MAINTENANCE_ENABLED bật/tắt worker qua ENV.',
};
let adminGeneration = 0;
const adminState = {q: '', status: 'all', page: 1, selected: null};
const adminNumber = value => new Intl.NumberFormat('vi-VN').format(value || 0);
const adminDate = value => value ? formatDate(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ', 'T') + 'Z') : '—';
const adminCard = (label, value, note = '') => `<article class="panel admin-metric"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</article>`;
const adminTable = (heads, rows) => `<div class="comparison-scroll"><table class="comparison-table admin-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}">Chưa có dữ liệu phù hợp.</td></tr>`}</tbody></table></div>`;
const userLink = row => `<button class="text-button" data-admin-user="${row.user_id || row.owner_id || row.actor_id || row.id}">${escapeHtml(row.name || '')}<small>${escapeHtml(row.email || '')}</small></button>`;
function helpAdmin(name) {
  return `<details class="panel admin-help"><summary>Hướng dẫn · ${adminTitles[name]}</summary><p>${adminHelp[name]}</p></details>`;
}
function adminPager(data) {
  return `<div class="admin-pagination"><span>${adminNumber(data.total)} kết quả · Trang ${data.page}/${Math.max(1, Math.ceil(data.total / data.limit))}</span><button class="button button-ghost" data-admin-prev ${data.page <= 1 ? 'disabled' : ''}>Trước</button><button class="button button-ghost" data-admin-next ${data.page * data.limit >= data.total ? 'disabled' : ''}>Sau</button></div>`;
}
function wireAdminUsers(root) {
  $$('[data-admin-user]', root).forEach(button => button.onclick = async () => {
    adminState.selected = Number(button.dataset.adminUser);
    await showView('admin-users');
  });
}

async function renderAdmin(name = 'admin-dashboard') {
  const generation = ++adminGeneration;
  const root = $('#admin-view');
  root.innerHTML = helpAdmin(name) + '<p class="account-muted" id="admin-loading">Đang tải…</p>';
  const current = () => generation === adminGeneration && state.currentView === name;
  try {
    if (name === 'admin-dashboard') await renderAdminDashboard(root, current);
    else if (name === 'admin-users') await (adminState.selected ? renderAdminUser(root, current) : renderAdminUsers(root, current));
    else if (['admin-payments', 'admin-credits', 'admin-activity'].includes(name)) {
      const kind = {'admin-payments': 'orders', 'admin-credits': 'credits', 'admin-activity': 'activity'}[name];
      const panel = document.createElement('section'); panel.className = 'panel account-section'; root.append(panel);
      await adminReport(panel, kind);
    } else if (['admin-billing', 'admin-ai', 'admin-auth'].includes(name)) await renderAdminSettings(name.split('-')[1], root, current);
    else if (name === 'admin-review-types') {
      root.insertAdjacentHTML('beforeend', '<section id="review-types-admin" class="panel account-section"></section>');
      await renderReviewTypes();
    } else if (name === 'admin-storage' || name === 'admin-limits') await renderStorageAdmin(name.split('-')[1]);
    else if (name === 'admin-email') {
      const data = await api('/api/admin/storage/settings'); if (current()) renderStorageEmailAdmin(data);
    }
  } finally { if (current()) $('#admin-loading')?.remove(); }
}

async function renderAdminDashboard(root, current) {
  root.insertAdjacentHTML('beforeend', `<form id="admin-date-filter" class="panel admin-toolbar"><label>Từ ngày (UTC)<input name="start" type="date" required></label><label>Đến ngày (UTC)<input name="end" type="date" required></label><button class="button button-primary">Xem thống kê</button></form><div id="admin-statistics"></div>`);
  const form = $('#admin-date-filter');
  const end = new Date(), start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  form.elements.start.value = start.toISOString().slice(0, 10); form.elements.end.value = end.toISOString().slice(0, 10);
  async function load() {
    const data = await api('/api/admin/dashboard?' + new URLSearchParams(new FormData(form)));
    if (!current()) return;
    const f = data.financial, c = data.current, max = Math.max(1, ...data.daily.map(d => d.revenue_vnd));
    $('#admin-statistics').innerHTML = `<p class="account-muted">Theo ngày UTC: ${data.start} → ${data.end}. Số tiền thực thu từ nạp ví; không phải lợi nhuận.</p>
      <div class="admin-metrics">${adminCard('Tiền nạp đã thanh toán', money(f.revenue_vnd), `${f.paid_orders} đơn đã thanh toán`)}${adminCard('Credit nạp trong kỳ', adminNumber(f.topup_credits))}${adminCard('Credit đã trừ', adminNumber(f.spent_credits), `Review ${adminNumber(f.review_credits)} · Dung lượng ${adminNumber(f.storage_credits)}`)}${adminCard('Credit đã hoàn', adminNumber(f.refunded_credits), `Sử dụng ròng: ${adminNumber(f.net_spent_credits)}`)}</div>
      <section class="panel account-section"><h2>Tiền thu theo ngày</h2><svg class="admin-chart" viewBox="0 0 800 140" preserveAspectRatio="none" role="img" aria-label="Biểu đồ tiền thu từ đơn đã thanh toán theo ngày UTC">${data.daily.map((d, i) => { const h = 130 * d.revenue_vnd / max; return `<rect x="${i * 800 / data.daily.length}" y="${135-h}" width="${Math.max(1, 800/data.daily.length-2)}" height="${Math.max(1,h)}"><title>${d.day}: ${money(d.revenue_vnd)}</title></rect>`; }).join('')}</svg><div class="admin-scroll">${adminTable(['Ngày UTC', 'Tiền thu', 'Đơn trả', 'Credit nạp', 'Đã trừ', 'Đã hoàn'], data.daily.map(d => [d.day, money(d.revenue_vnd), d.paid_orders, adminNumber(d.topup_credits), adminNumber(d.spent_credits), adminNumber(d.refunded_credits)]))}</div></section>
      <h2 class="account-section">Toàn hệ thống · Hiện tại</h2><div class="admin-metrics">${adminCard('Tổng số dư credit', adminNumber(c.outstanding_credits), 'Gồm cả tài khoản vô hiệu hóa')}${adminCard('Tài khoản', adminNumber(c.users), `${c.active_users} đang hoạt động`)}${adminCard('Dung lượng được ghi nhận', storageBytes(c.used_bytes), `${c.papers} bài · Giữ chỗ upload ${storageBytes(c.uploads_reserved_bytes)}`)}${adminCard('Phân bố file', c.files.map(f => `${f.backend === 'drive' ? 'Drive' : 'Local'}: ${storageBytes(f.bytes)}`).join('<br>') || 'Chưa có file', 'Không gồm DB, backup và file tạm')}</div>
      <section class="panel account-section"><h2>Tác vụ còn trong thư viện</h2>${adminTable(['Loại', 'Trạng thái', 'Số lượng'], Object.entries(c.jobs).flatMap(([kind, rows]) => rows.map(r => [kind === 'reviews' ? 'Review AI' : 'Format', escapeHtml(r.status), r.count])))}</section>`;
  }
  form.onsubmit = event => { event.preventDefault(); withBusy($('button', form), load); };
  await load();
}

async function renderAdminUsers(root, current) {
  const params = new URLSearchParams({q: adminState.q, status: adminState.status, page: adminState.page});
  const data = await api('/api/admin/users?' + params); if (!current()) return;
  if (data.unassigned_papers) root.insertAdjacentHTML('beforeend', `<section class="panel account-section"><h2>Dữ liệu cũ chưa có chủ sở hữu</h2><p>${data.unassigned_papers} bài được nhập trước khi có tài khoản.</p><button id="claim-legacy" class="button button-ghost">Nhận vào thư viện của tôi</button></section>`);
  root.insertAdjacentHTML('beforeend', `<section class="panel account-section"><form id="admin-user-filter" class="admin-toolbar"><label>Tìm tài khoản<input name="q" maxlength="200" value="${escapeHtml(adminState.q)}" placeholder="Tên, email hoặc ID"></label><label>Trạng thái<select name="status"><option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="inactive">Vô hiệu hóa</option></select></label><button class="button button-primary">Tìm kiếm</button></form>
    ${adminTable(['Tài khoản', 'Quyền / trạng thái', 'Số dư', 'Tài nguyên', 'Đăng nhập gần nhất'], data.items.map(u => [userLink(u), `${u.role === 'admin' ? 'Admin' : 'User'}<br>${u.disabled ? 'Vô hiệu hóa' : 'Đang hoạt động'}`, `${adminNumber(u.credits)} credit`, `${u.papers} bài<br>${storageBytes(u.used_bytes)}`, adminDate(u.last_login)]))}${adminPager(data)}</section>`);
  const form = $('#admin-user-filter'); form.elements.status.value = adminState.status;
  form.onsubmit = event => { event.preventDefault(); Object.assign(adminState, {q: form.elements.q.value, status: form.elements.status.value, page: 1}); renderAdmin('admin-users').catch(e => toast(e.message, 'error')); };
  $('[data-admin-prev]', root).onclick = () => { adminState.page--; renderAdmin('admin-users').catch(e => toast(e.message, 'error')); };
  $('[data-admin-next]', root).onclick = () => { adminState.page++; renderAdmin('admin-users').catch(e => toast(e.message, 'error')); };
  wireAdminUsers(root);
  if ($('#claim-legacy')) $('#claim-legacy').onclick = () => withBusy($('#claim-legacy'), async () => {
    if (!confirm(`Nhận ${data.unassigned_papers} bài cũ vào tài khoản admin hiện tại?`)) return;
    const result = await api('/api/admin/claim-legacy', {method:'POST'});
    toast(`Đã nhận ${result.count} bài báo.`); await renderAdmin('admin-users');
  });
}

async function renderAdminUser(root, current) {
  const id = adminState.selected, data = await api(`/api/admin/users/${id}`); if (!current()) return;
  const u = data.user, f = data.financial, s = data.storage, sub = data.subscription;
  root.insertAdjacentHTML('beforeend', `<section class="panel account-section"><button id="admin-user-back" class="text-button">← Danh sách người dùng</button><h2>${escapeHtml(u.name)}</h2><p>${escapeHtml(u.email)} · #${u.id} · ${u.disabled ? 'Vô hiệu hóa' : 'Đang hoạt động'}</p><p class="account-muted">Tham gia ${adminDate(u.created_at)} · ${data.active_sessions} phiên còn hạn<br>${escapeHtml(u.affiliation)}</p>
    <form id="admin-user-access" class="admin-toolbar"><label>Quyền<select name="role"><option value="user">User</option><option value="admin">Admin</option></select></label><label>Trạng thái<select name="disabled"><option value="false">Active · Đang hoạt động</option><option value="true">Deactive · Vô hiệu hóa</option></select></label><button class="button button-primary" ${u.id === state.user.id ? 'disabled' : ''}>Lưu quyền & trạng thái</button></form></section>
    <div class="admin-metrics account-section">${adminCard('Số dư hiện tại', `${adminNumber(u.credits)} credit`)}${adminCard('Tổng tiền đã nạp', money(f.revenue_vnd), `${f.paid_orders} đơn đã thanh toán`)}${adminCard('Đã dùng / Đã hoàn', `${adminNumber(f.spent_credits)} / ${adminNumber(f.refunded_credits)}`, `Credit nạp ${adminNumber(f.topup_credits)}`)}${adminCard('Dung lượng', `${storageBytes(s.used_bytes)} / ${storageBytes(s.quota_bytes)}`, data.library_locked ? 'Thư viện đang khóa do hết hạn' : s.over_quota ? 'Đang vượt hạn mức' : 'Trong hạn mức')}</div>
    <section class="panel account-section"><h2>Tài nguyên & sử dụng</h2><p>PDF ${storageBytes(s.pdf_bytes)} · Kết quả ${storageBytes(s.artifact_bytes)} · Upload giữ chỗ ${storageBytes(s.reserved_bytes)}</p><p>Gói mua thêm: ${sub.units * 100} MB${sub.expires_at ? ` · ${sub.active ? 'Còn hạn' : 'Hết hạn'} ${storageDate(sub.expires_at)} · Gia hạn ${sub.renewal_cost} credit` : ''}</p>${adminTable(['Tác vụ hiện còn', 'Trạng thái', 'Số lượng'], Object.entries(data.jobs).flatMap(([kind, rows]) => rows.map(r => [kind === 'reviews' ? 'Review AI' : 'Format', escapeHtml(r.status), r.count])))}<details><summary>Bộ đếm chống spam gần đây (UTC)</summary>${adminTable(['Loại', 'Bắt đầu cửa sổ', 'Lượt'], data.budgets.map(b => [escapeHtml(b.action), new Date(b.window * 1000).toISOString(), b.count]))}</details></section>
    <section class="panel account-section"><div class="admin-tabs" role="group" aria-label="Thông tin người dùng"><button class="button button-ghost" data-user-report="papers">Bài & tài nguyên</button><button class="button button-ghost" data-user-report="orders">Nạp tiền</button><button class="button button-ghost" data-user-report="credits">Sử dụng credit</button><button class="button button-ghost" data-user-report="activity">Nhật ký</button></div><div id="admin-user-records"></div></section>`);
  $('#admin-user-back').onclick = () => { adminState.selected = null; renderAdmin('admin-users').catch(e => toast(e.message, 'error')); };
  const form = $('#admin-user-access'); form.elements.role.value = u.role; form.elements.disabled.value = String(Boolean(u.disabled));
  form.onsubmit = event => {
    event.preventDefault();
    if (!confirm(`Cập nhật ${u.email}: ${form.elements.role.value}, ${form.elements.disabled.value === 'true' ? 'vô hiệu hóa và thu hồi phiên đăng nhập' : 'đang hoạt động'}?`)) return;
    withBusy($('button', form), async () => { await api(`/api/admin/users/${id}`, jsonRequest('PATCH', {role: form.elements.role.value, disabled: form.elements.disabled.value === 'true'})); toast('Đã cập nhật tài khoản.'); await renderAdmin('admin-users'); });
  };
  $$('[data-user-report]', root).forEach(button => button.onclick = () => adminReport($('#admin-user-records'), button.dataset.userReport, id).catch(e => toast(e.message, 'error')));
  await adminReport($('#admin-user-records'), 'papers', id);
}

const activityLabels = {login:'Đăng nhập', paper_uploaded:'Upload bài', paper_deleted:'Xóa bài', review_created:'Tạo review', review_status:'Trạng thái review', format_created:'Tạo kiểm tra format', format_status:'Trạng thái format', credit:'Biến động credit', order_created:'Tạo đơn nạp', order_status:'Trạng thái đơn', access_changed:'Thay đổi quyền/trạng thái'};
async function adminReport(root, kind, userId = null) {
  const token = {}; root.reportToken = token;
  const title = {orders:'Giao dịch nạp tiền', credits:'Sổ credit', activity:'Nhật ký người dùng', audit:'Nhật ký quản trị', papers:'Bài & tài nguyên'}[kind];
  root.innerHTML = `<h2>${title}</h2>${!userId && ['activity', 'audit'].includes(kind) ? '<div class="admin-tabs"><button class="text-button" data-log-kind="activity">Người dùng</button><button class="text-button" data-log-kind="audit">Quản trị</button></div>' : ''}
    <form class="admin-toolbar" data-report-filter><label>Từ ngày UTC<input name="start" type="date"></label><label>Đến ngày UTC<input name="end" type="date"></label>${kind === 'orders' ? '<label>Trạng thái<select name="status"><option value="">Tất cả</option><option value="paid">Đã thanh toán</option><option value="pending">Chờ thanh toán</option><option value="creating">Đang tạo</option><option value="cancelled">Đã hủy</option><option value="expired">Hết hạn</option></select></label>' : ''}<button class="button button-ghost">Lọc</button></form><div data-report-content></div>`;
  let page = 1;
  const form = $('[data-report-filter]', root);
  async function load() {
    const params = new URLSearchParams(new FormData(form));
    [...params].forEach(([key, value]) => { if (!value) params.delete(key); });
    params.set('page', page); if (userId) params.set('user_id', userId);
    const data = await api(`/api/admin/reports/${kind}?${params}`);
    if (!root.isConnected || root.reportToken !== token) return;
    let heads, rows;
    if (kind === 'orders') {
      heads = ['Đơn / tài khoản', 'Số tiền', 'Credit', 'Trạng thái', 'Tạo / Thanh toán', 'Đối soát'];
      rows = data.items.map(r => [`#${r.id}<br>${userLink(r)}`, money(r.amount), adminNumber(r.credits), escapeHtml(r.status), `${adminDate(r.created_at)}<br>${adminDate(r.paid_at)}`, r.status !== 'paid' ? `<button class="text-button" data-admin-sync="${r.id}">Kiểm tra PayOS</button>` : 'Đã ghi nhận']);
    } else if (kind === 'credits') {
      heads = ['Tài khoản', 'Biến động', 'Loại', 'Tham chiếu', 'Ngày'];
      rows = data.items.map(r => [userLink(r), `${r.delta > 0 ? '+' : ''}${adminNumber(r.delta)}`, escapeHtml({topup:'Nạp',review:'Review',storage:'Dung lượng',refund:'Hoàn phí'}[r.kind] || r.kind), escapeHtml(r.reference), adminDate(r.created_at)]);
    } else if (kind === 'papers') {
      heads = ['Bài', 'Trạng thái', 'Dung lượng', 'Lưu trữ', 'Upload'];
      rows = data.items.map(r => [`#${r.id} · ${escapeHtml(r.title)}<small>${escapeHtml(r.filename)}</small>`, r.deletion_pending ? 'Đang xóa' : escapeHtml(r.status), storageBytes(r.file_size + r.artifact_bytes), r.drive_files ? 'Có file trên Drive' : 'Local', adminDate(r.uploaded_at)]);
    } else {
      heads = ['Tài khoản', 'Sự kiện', 'Đối tượng / Người thao tác', 'Chi tiết', 'Ngày UTC'];
      rows = data.items.map(r => [userLink(r), escapeHtml(activityLabels[r.action] || r.action), `${r.entity_id ? '#' + r.entity_id : '—'}${r.actor_id ? ' · Admin #' + r.actor_id : ''}`, `<code>${escapeHtml(r.detail)}</code>`, escapeHtml(r.created_at)]);
    }
    const content = $('[data-report-content]', root); content.innerHTML = adminTable(heads, rows) + adminPager(data);
    $('[data-admin-prev]', content).onclick = () => { page--; load().catch(e => toast(e.message, 'error')); };
    $('[data-admin-next]', content).onclick = () => { page++; load().catch(e => toast(e.message, 'error')); };
    $$('[data-admin-sync]', content).forEach(button => button.onclick = () => withBusy(button, async () => { await api(`/api/admin/orders/${button.dataset.adminSync}/sync`, {method:'POST'}); toast('Đã đối soát đơn nạp.'); await load(); }));
    wireAdminUsers(content);
  }
  form.onsubmit = event => { event.preventDefault(); page = 1; withBusy($('button', form), load); };
  $$('[data-log-kind]', root).forEach(button => button.onclick = () => adminReport(root, button.dataset.logKind).catch(e => toast(e.message, 'error')));
  await load();
}

async function renderAdminSettings(section, root, current) {
  const s = await api('/api/admin/settings'); if (!current()) return;
  const input = (name, label, type = 'text', required = true) => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(s[name])}" ${required ? 'required' : ''}></label>`;
  const secret = (name, label) => `<label>${label}<input name="${name}" type="password" autocomplete="new-password" placeholder="${s[name + '_configured'] ? 'Đã cấu hình; trống để giữ nguyên' : 'Chưa cấu hình'}"><span class="check-label"><input type="checkbox" name="clear_${name}"> Xóa key đã lưu</span></label>`;
  const check = (name, label) => `<label class="check-label"><input type="checkbox" name="${name}" ${s[name] ? 'checked' : ''}> ${label}</label>`;
  const fields = {
    billing: input('credit_price_vnd','Giá 1 credit (VNĐ)','number') + input('minimum_topup_vnd','Nạp tối thiểu (VNĐ)','number') + input('payos_client_id','PayOS Client ID','text',false) + secret('payos_api_key','PayOS API key') + secret('payos_checksum_key','PayOS checksum key'),
    ai: input('gemini_model','Gemini model') + secret('gemini_api_key','Gemini key hệ thống') + check('system_reviews_enabled','Cho phép review bằng key hệ thống'),
    auth: input('google_client_id','Google Client ID') + input('turnstile_site_key','Turnstile site key','text',false) + secret('turnstile_secret_key','Turnstile secret key') + check('captcha_enabled','Bật CAPTCHA'),
  };
  root.insertAdjacentHTML('beforeend', `<section class="panel account-section"><h2>${adminTitles['admin-' + section]}</h2><form id="settings-form" class="account-form"><div class="settings-grid">${fields[section]}</div><button class="button button-primary">Lưu cấu hình</button></form></section>`);
  const form = $('#settings-form');
  if (section === 'billing') { form.elements.credit_price_vnd.min = 1; form.elements.minimum_topup_vnd.min = 10000; }
  form.onsubmit = event => {
    event.preventDefault();
    withBusy($('button', form), async () => {
      const values = Object.fromEntries(new FormData(form));
      ['credit_price_vnd','minimum_topup_vnd'].forEach(key => { if (key in values) values[key] = Number(values[key]); });
      ['system_reviews_enabled','captcha_enabled'].forEach(key => { if (form.elements[key]) values[key] = form.elements[key].checked; });
      ['gemini_api_key','payos_api_key','payos_checksum_key','turnstile_secret_key'].forEach(key => {
        if (!form.elements[key]) return;
        if (form.elements['clear_' + key].checked) values[key] = ''; else if (!values[key]) delete values[key];
        delete values['clear_' + key];
      });
      await api(`/api/admin/settings/${section}`, jsonRequest('PATCH', values));
      publicConfig = await api('/api/config'); toast('Đã lưu cấu hình.'); await renderAdmin('admin-' + section);
    });
  };
}
