async function loadReviewTypes() {
  state.reviewTypes = await api('/api/review-types');
}

async function renderReviewTypes(selectedId = null) {
  const types = await api('/api/admin/review-types');
  if (state.currentView !== 'admin-review-types' || !$('#review-types-admin')) return;
  const selected = types.find(item => item.id === selectedId);
  $('#review-types-admin').innerHTML = `
    <div class="panel-heading"><div><p class="eyebrow">TIÊU CHÍ & MẪU ĐÁNH GIÁ</p><h2>Loại review</h2></div><button id="new-review-type" class="button button-secondary">＋ Thêm loại review</button></div>
    <p class="account-muted">Review hội nghị dùng phiếu song ngữ hiện tại. Loại mới dùng nội dung, ngôn ngữ và bố cục trong file Markdown của bạn. Tắt một loại để ngừng nhận review mới; lịch sử đã chạy vẫn được giữ.</p>
    <div class="review-type-list">${types.map(item => `<button type="button" class="review-type-card ${item.id === selectedId ? 'selected' : ''}" data-edit-review-type="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small><span>${item.output_format === 'conference' ? 'Phiếu hội nghị' : 'Markdown'} · v${item.revision} · ${item.active ? 'Đang bật' : 'Đã tắt'}</span></button>`).join('')}</div>
    <form id="review-type-form" class="account-form">
      <h3>${selected ? `Chỉnh sửa: ${escapeHtml(selected.name)}` : 'Tạo loại review mới'}</h3>
      <div class="settings-grid"><label>Tên loại review<input name="name" required maxlength="120" value="${escapeHtml(selected?.name || '')}" placeholder="Ví dụ: Review bài báo tạp chí"></label>
      <label>Mô tả ngắn<input name="description" maxlength="500" value="${escapeHtml(selected?.description || '')}" placeholder="Giúp người dùng chọn đúng loại đánh giá"></label></div>
      <label>Nạp nội dung từ file .md (UTF-8, tối đa 128 KB)<input type="file" id="review-type-file" accept=".md,text/markdown"></label>
      <label>Hướng dẫn review (Markdown)<textarea name="instructions" rows="16" required spellcheck="false" placeholder="# Mục tiêu đánh giá&#10;Nêu tiêu chí, mức độ đánh giá, ngôn ngữ và các phần cần có trong báo cáo.">${escapeHtml(selected?.instructions || '')}</textarea></label>
      <label class="check-label"><input type="checkbox" name="active" ${!selected || selected.active ? 'checked' : ''}> Cho phép người dùng chọn loại review này</label>
      <div class="detail-actions"><button type="submit" class="button button-primary">${selected ? 'Lưu phiên bản mới' : 'Tạo loại review'}</button>
      ${selected ? `<a class="button button-ghost" href="/api/admin/review-types/${selected.id}/file">Tải file .md</a>` : ''}</div>
    </form>`;
  $('#new-review-type').onclick = () => renderReviewTypes().catch(error => toast(error.message, 'error'));
  $$('[data-edit-review-type]').forEach(button => button.onclick = () => renderReviewTypes(Number(button.dataset.editReviewType)).catch(error => toast(error.message, 'error')));
  const form = $('#review-type-form');
  $('#review-type-file').onchange = async event => {
    const file = event.currentTarget.files[0];
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.md')) throw new Error('Chỉ hỗ trợ file .md');
      if (file.size > 131072) throw new Error('File Markdown tối đa 128 KB');
      const content = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      if (!content.trim() || content.includes('\0')) throw new Error('File Markdown không được trống hoặc chứa ký tự NUL');
      form.elements.instructions.value = content;
      if (!form.elements.name.value) form.elements.name.value = file.name.replace(/\.md$/i, '').slice(0, 120);
      toast(`Đã đọc ${file.name}. Bấm lưu để áp dụng.`);
    } catch (error) { toast(error.message, 'error'); }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    await withBusy($('[type="submit"]', form), async () => {
      const body = {name: form.elements.name.value, description: form.elements.description.value,
        instructions: form.elements.instructions.value, active: form.elements.active.checked};
      const result = await api(selected ? `/api/admin/review-types/${selected.id}` : '/api/admin/review-types',
        jsonRequest(selected ? 'PUT' : 'POST', body));
      await loadReviewTypes(); await renderReviewTypes(result.id);
      toast('Đã lưu loại review.');
    });
  };
}
