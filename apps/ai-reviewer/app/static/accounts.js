const money = value => new Intl.NumberFormat('vi-VN').format(value) + 'đ';
let publicConfig, loginNonce, walletTimer, topupRequest;
const scriptPromises = new Map();

function loadScript(src) {
  if (!scriptPromises.has(src)) scriptPromises.set(src, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.async = true;
    script.onload = resolve;
    script.onerror = () => { scriptPromises.delete(src); script.remove(); reject(new Error('Không tải được dịch vụ xác thực. Hãy kiểm tra kết nối và thử lại.')); };
    document.head.append(script);
  }));
  return scriptPromises.get(src);
}

async function captchaToken(action) {
  if (!publicConfig.captcha_enabled) return '';
  if (!publicConfig.turnstile_site_key) throw new Error('CAPTCHA chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
  await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  return new Promise((resolve, reject) => {
    const modal = document.createElement('div');
    modal.className = 'captcha-overlay';
    modal.innerHTML = '<section class="panel" role="dialog" aria-modal="true" aria-label="Xác minh bảo mật"><h2>Xác minh bảo mật</h2><p>Hoàn tất xác minh để tiếp tục.</p><div class="captcha-widget"></div><button class="button button-ghost">Hủy</button></section>';
    document.body.append(modal);
    const priorFocus = document.activeElement;
    let widget, settled = false;
    const finish = (token, error) => {
      if (settled) return; settled = true;
      if (widget !== undefined) turnstile.remove(widget);
      modal.remove(); priorFocus?.focus();
      error ? reject(new Error(error)) : resolve(token);
    };
    $('button', modal).onclick = () => finish('', 'Đã hủy xác minh');
    $('button', modal).focus();
    modal.onkeydown = event => { if (event.key === 'Escape') finish('', 'Đã hủy xác minh'); };
    widget = turnstile.render($('.captcha-widget', modal), {
      sitekey: publicConfig.turnstile_site_key, action,
      callback: token => finish(token),
      'error-callback': () => finish('', 'CAPTCHA gặp lỗi. Hãy thử lại.'),
      'expired-callback': () => finish('', 'CAPTCHA hết hạn. Hãy thử lại.'),
      'timeout-callback': () => finish('', 'Xác minh quá thời gian. Hãy thử lại.'),
    });
  });
}

function jsonRequest(method, body) {
  return {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)};
}

async function showLogin() {
  $('#auth-loading').classList.add('hidden');
  $('.app-shell').hidden = true;
  $('.app-shell').classList.add('hidden');
  $('#login-screen').hidden = false;
  $('#login-screen').classList.remove('hidden');
  const status = $('#login-status');
  if (!publicConfig.google_client_id) {
    status.textContent = 'Google Login chưa được cấu hình. Quản trị viên cần thêm GOOGLE_CLIENT_ID vào cấu hình máy chủ.';
    return;
  }
  if (publicConfig.captcha_enabled && !publicConfig.turnstile_site_key) {
    status.textContent = 'Quản trị viên cần cấu hình Cloudflare Turnstile trước khi mở đăng ký.';
    return;
  }
  try {
    loginNonce = (await api('/api/auth/challenge')).nonce;
    await loadScript('https://accounts.google.com/gsi/client');
    google.accounts.id.initialize({client_id: publicConfig.google_client_id, nonce: loginNonce,
      auto_select: false, callback: async result => {
        try {
          status.textContent = 'Đang xác minh tài khoản…';
          const captcha = await captchaToken('login');
          const session = await api('/api/auth/google', {
            ...jsonRequest('POST', {credential: result.credential, captcha_token: captcha}),
            headers: {'Content-Type': 'application/json', 'X-Login-Nonce': loginNonce},
          });
          state.user = session.user; state.csrf = session.csrf_token;
          await enterWorkspace();
        } catch (error) { status.textContent = error.message + ' Tải lại trang để thử lại.'; }
      },
    });
    google.accounts.id.renderButton($('#google-login'), {theme: 'outline', size: 'large', text: 'continue_with', locale: 'vi', width: 300});
    status.textContent = 'Lần đăng nhập đầu tiên sẽ tự động tạo tài khoản Liêm Research Paper.';
  } catch (error) { status.textContent = error.message; }
}

function updateAccountBadge() {
  $('#account-name').textContent = state.user.name;
  $('#account-credit').textContent = `${state.user.credits} credit`;
  $('#admin-nav').classList.toggle('hidden', state.user.role !== 'admin');
}

async function refreshAccount() {
  const session = await api('/api/auth/me');
  state.user = session.user; state.csrf = session.csrf_token;
  updateAccountBadge();
}

async function enterWorkspace() {
  $('#login-screen').hidden = true;
  $('#login-screen').classList.add('hidden');
  $('#auth-loading').classList.remove('hidden');
  updateAccountBadge();
  await initialize();
  const params = new URLSearchParams(location.search);
  const payment = params.get('payment');
  const savedView = sessionStorage.getItem(`paperscope:view:${state.user.id}`) || 'dashboard';
  await showView(payment ? 'wallet' : params.get('view') === 'storage' ? 'storage' : savedView === 'admin' && state.user.role !== 'admin' ? 'dashboard' : savedView);
  $('#auth-loading').classList.add('hidden'); $('.app-shell').hidden = false; $('.app-shell').classList.remove('hidden');
  if (payment && /^\d+$/.test(payment)) {
    history.replaceState({}, '', '/');
    try {
      const order = await api(`/api/wallet/orders/${payment}/sync`, {method: 'POST'});
      toast(order.status === 'paid' ? 'Thanh toán thành công. Credit đã được cộng.' : 'Đơn chưa thanh toán. Bạn có thể kiểm tra lại trong ví.');
    } catch (error) { toast(error.message, 'error'); }
    await loadWallet();
  }
}

async function renderProfile() {
  await refreshAccount();
  const user = state.user;
  $('#profile-view').innerHTML = `
    <div class="account-grid">
      <section class="panel"><p class="eyebrow">TÀI KHOẢN CÁ NHÂN</p><h2>Hồ sơ của bạn</h2>
        <p class="account-muted">${escapeHtml(user.email)} · Đăng nhập bằng Google</p>
        <form id="profile-form" class="account-form">
          <label>Tên hiển thị<input name="name" required maxlength="120" value="${escapeHtml(user.name)}"></label>
          <label>Trường / tổ chức<input name="affiliation" maxlength="200" value="${escapeHtml(user.affiliation)}"></label>
          <label>Giới thiệu<textarea name="bio" maxlength="1000" rows="4">${escapeHtml(user.bio)}</textarea></label>
          <button class="button button-primary">Lưu hồ sơ</button>
        </form>
      </section>
      <section class="panel"><p class="eyebrow">GEMINI CÁ NHÂN</p><h2>API key của bạn</h2>
        <span class="status-chip ${user.has_gemini_key ? 'reviewed' : ''}">${user.has_gemini_key ? 'Đã lưu key' : 'Chưa có key'}</span>
        <p class="account-muted">Review bằng key cá nhân dùng ${publicConfig.personal_review_cost} credit Liêm Research Paper / lần. Chi phí và hạn mức Gemini thuộc tài khoản Google của bạn.</p>
        <a class="button button-ghost" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Tạo key trên Google AI Studio ↗</a>
        <form id="key-form" class="account-form">
          <label>${user.has_gemini_key ? 'Thay API key' : 'Lưu API key'}<input type="password" name="key" autocomplete="new-password" required minlength="20" maxlength="256" placeholder="Dán Gemini API key"></label>
          <small>Key được mã hóa khi lưu và không hiển thị lại. Key sẽ được sử dụng khi bạn chọn review bằng key cá nhân.</small>
          <button class="button button-primary">Lưu key</button>
        </form>
        ${user.has_gemini_key ? '<button id="remove-key" class="text-button danger-text">Xóa key đã lưu</button>' : ''}
      </section>
    </div>`;
  $('#profile-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    await withBusy($('button', form), async () => {
      state.user = await api('/api/profile', jsonRequest('PATCH', Object.fromEntries(new FormData(form))));
      updateAccountBadge(); toast('Đã lưu hồ sơ.');
    });
  };
  $('#key-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    await withBusy($('button', form), async () => {
      await api('/api/profile/gemini-key', jsonRequest('PUT', {key: form.elements.key.value.trim()}));
      form.reset(); toast('Đã lưu Gemini key.'); await renderProfile();
    });
  };
  if ($('#remove-key')) $('#remove-key').onclick = async () => withBusy($('#remove-key'), async () => {
    await api('/api/profile/gemini-key', {method: 'DELETE'}); await renderProfile(); toast('Đã xóa key.');
  });
}

async function withBusy(button, action) {
  button.disabled = true;
  try { await action(); } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; }
}

const orderLabels = {creating: 'Đang tạo / cần đối soát', pending: 'Chờ thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã hủy', expired: 'Hết hạn', failed: 'Tạo đơn bị từ chối'};
function ordersTable(orders, admin = false) {
  if (!orders.length) return '<p class="account-muted">Chưa có giao dịch nạp credit.</p>';
  return `<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Mã đơn</th>${admin ? '<th>User ID</th>' : ''}<th>Số tiền</th><th>Credit</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>${orders.map(order => `<tr>
    <td>${order.id}</td>${admin ? `<td>${order.user_id}</td>` : ''}<td>${money(order.amount)}</td><td>+${order.credits}</td>
    <td>${escapeHtml(orderLabels[order.status] || order.status)}</td><td>${formatDate(order.created_at + 'Z')}</td><td>
    ${order.status !== 'paid' ? `<button class="text-button" data-sync-order="${order.id}" data-admin="${admin}">Kiểm tra</button>` : ''}
    ${!admin && order.status === 'pending' && order.checkout_url.startsWith('https://pay.payos.vn/') ? `<a class="text-button" href="${escapeHtml(order.checkout_url)}" target="_blank" rel="noopener noreferrer">Thanh toán ↗</a>` : ''}
    </td></tr>`).join('')}</tbody></table></div>`;
}

function wireSync(root) {
  $$('[data-sync-order]', root).forEach(button => button.onclick = () => withBusy(button, async () => {
    const path = button.dataset.admin === 'true' ? 'admin' : 'wallet';
    const result = await api(`/api/${path}/orders/${button.dataset.syncOrder}/sync`, {method: 'POST'});
    toast(orderLabels[result.status] || result.status);
    path === 'admin' ? await renderAdmin(state.currentView) : await loadWallet();
  }));
}

async function renderWallet() {
  $('#wallet-view').innerHTML = `
    <div class="account-grid">
      <section class="wallet-hero"><p class="hero-kicker">VÍ LIÊM RESEARCH PAPER</p><h2><span id="wallet-balance">${state.user.credits}</span> <small>credit</small></h2>
        <p>10 credit = ${money(publicConfig.credit_price_vnd * 10)}.</p><p>Key hệ thống: ${publicConfig.system_review_cost} credit / lần.<br>Key cá nhân: ${publicConfig.personal_review_cost} credit / lần.</p><p>Review thất bại được hoàn credit tự động.</p></section>
      <section class="panel"><h2>Nạp credit qua PayOS</h2>
        <p class="account-muted">${money(publicConfig.credit_price_vnd)} / credit · Nạp tối thiểu ${money(publicConfig.minimum_topup_vnd)}.</p>
        <form id="topup-form" class="account-form"><label>Số tiền (VNĐ)<input name="amount" type="number" min="${publicConfig.minimum_topup_vnd}" max="50000000" step="${publicConfig.credit_price_vnd}" value="${publicConfig.minimum_topup_vnd}" required></label>
          <div class="amount-presets">${[1, 2, 4].map(n => `<button type="button" class="button button-ghost" data-amount="${publicConfig.minimum_topup_vnd * n}">${money(publicConfig.minimum_topup_vnd * n)}</button>`).join('')}</div>
          <p id="credit-estimate"></p><button class="button button-primary" type="submit" ${publicConfig.payos_ready ? '' : 'disabled'}>${publicConfig.payos_ready ? 'Tạo link thanh toán PayOS' : 'PayOS chưa được cấu hình'}</button>
        </form><p class="account-muted">Credit được cộng sau khi PayOS xác nhận giao dịch. Bạn có thể tiếp tục thanh toán hoặc kiểm tra trạng thái trong lịch sử bên dưới.</p>
      </section>
    </div>
    <section class="panel account-section"><h2>Lịch sử nạp credit</h2><div id="wallet-orders"></div></section>
    <section class="panel account-section"><h2>Biến động credit</h2><div id="wallet-ledger"></div></section>`;
  const form = $('#topup-form');
  const estimate = () => { $('#credit-estimate').textContent = `Nhận ${Math.floor(Number(form.elements.amount.value) / publicConfig.credit_price_vnd)} credit`; };
  form.elements.amount.oninput = estimate; estimate();
  $$('[data-amount]').forEach(button => button.onclick = () => { form.elements.amount.value = button.dataset.amount; estimate(); });
  form.onsubmit = async event => {
    event.preventDefault();
    await withBusy($('[type="submit"]', form), async () => {
      const amount = Number(form.elements.amount.value);
      if (!topupRequest || topupRequest.amount !== amount) topupRequest = {amount, request_id: crypto.randomUUID()};
      const captcha = await captchaToken('topup');
      try {
        const order = await api('/api/wallet/topup', jsonRequest('POST', {...topupRequest, captcha_token: captcha}));
        topupRequest = null;
        await loadWallet();
        if (order.status === 'pending' && order.checkout_url.startsWith('https://pay.payos.vn/')) location.assign(order.checkout_url);
      } catch (error) { await loadWallet(); throw error; }
    });
  };
  await loadWallet();
  clearInterval(walletTimer);
  if (state.currentView === 'wallet') walletTimer = setInterval(() => { if (!document.hidden) loadWallet().catch(() => clearInterval(walletTimer)); }, 5000);
}

async function loadWallet() {
  const wallet = await api('/api/wallet');
  state.user.credits = wallet.credits; updateAccountBadge();
  if (!$('#wallet-balance')) return;
  $('#wallet-balance').textContent = wallet.credits;
  $('#wallet-orders').innerHTML = ordersTable(wallet.orders);
  wireSync($('#wallet-orders'));
  const labels = {topup: 'Nạp PayOS', review: 'Phí review', refund: 'Hoàn credit review', storage: 'Mua gói dung lượng'};
  $('#wallet-ledger').innerHTML = wallet.ledger.length ? `<div class="ledger-list">${wallet.ledger.map(row => `<div><span>${escapeHtml(labels[row.kind] || row.kind)}<small>${escapeHtml(row.reference)} · ${formatDate(row.created_at + 'Z')}</small></span><strong class="${row.delta > 0 ? 'credit-positive' : ''}">${row.delta > 0 ? '+' : ''}${row.delta}</strong></div>`).join('')}</div>` : '<p class="account-muted">Chưa có biến động credit.</p>';
}


window.loadAccountView = async name => {
  clearInterval(walletTimer);
  try {
    if (name === 'profile') await renderProfile();
    if (name === 'wallet') await renderWallet();
    if (name.startsWith('admin-') && name !== 'admin-formats') await renderAdmin(name);
    if (name === 'formats' || name === 'admin-formats') await renderFormatProfiles();
    if (name === 'storage') await renderStorage();
  } catch (error) { toast(error.message, 'error'); }
};

$('#logout').onclick = () => withBusy($('#logout'), async () => {
  await api('/api/auth/logout', {method: 'POST'}); location.reload();
});

async function bootstrapAccounts() {
  $('#auth-loading').classList.remove('hidden');
  $('#retry-bootstrap').classList.add('hidden');
  $('#auth-loading-message').textContent = 'Đang mở Liêm Research Paper…';
  try {
    const [config, session] = await Promise.all([api('/api/config'), api('/api/auth/me').catch(error => {
      if (error.status === 401) return null;
      throw error;
    })]);
    publicConfig = config;
    if (session) { state.user = session.user; state.csrf = session.csrf_token; }
    state.user ? await enterWorkspace() : await showLogin();
  } catch (error) {
    $('#auth-loading-message').textContent = `Chưa kết nối được Liêm Research Paper: ${error.message}`;
    $('#retry-bootstrap').classList.remove('hidden');
  }
}
$('#retry-bootstrap').onclick = bootstrapAccounts;
bootstrapAccounts();
