"""Local PDF measurements. Heuristics never certify publisher compliance."""
from __future__ import annotations

from collections import Counter
from io import BytesIO
import hashlib
import re
from pathlib import Path
from typing import Literal
from zipfile import ZipFile

import pdfplumber
from defusedxml import ElementTree
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class PageSize(StrictModel):
    width_mm: float = Field(ge=50, le=1000)
    height_mm: float = Field(ge=50, le=1000)


class Margins(StrictModel):
    top: float = Field(default=0, ge=0, le=150)
    bottom: float = Field(default=0, ge=0, le=150)
    left: float = Field(default=0, ge=0, le=150)
    right: float = Field(default=0, ge=0, le=150)


class FormatRules(StrictModel):
    page_sizes: list[PageSize] = Field(default_factory=list, max_length=6)
    tolerance_mm: float = Field(default=2, ge=0, le=10)
    max_pages: StrictInt | None = Field(default=None, ge=1, le=200)
    min_text_margins_mm: Margins | None = None
    body_font_pt: float | None = Field(default=None, ge=5, le=30)
    font_tolerance_pt: float = Field(default=0.5, ge=0, le=3)
    font_names: list[str] = Field(default_factory=list, max_length=12)
    columns: Literal[1, 2] | None = None
    required_sections: list[str] = Field(default_factory=list, max_length=20)
    manual_checks: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def bounded_strings(self):
        for items in (self.font_names, self.required_sections, self.manual_checks):
            if any(not s.strip() or len(s) > 500 or '\x00' in s for s in items):
                raise ValueError('Tên font, mục và tiêu chí phải có 1–500 ký tự, không chứa NUL')
        if not any((self.page_sizes, self.max_pages, self.min_text_margins_mm, self.body_font_pt,
                    self.font_names, self.columns, self.required_sections, self.manual_checks)):
            raise ValueError('Cần ít nhất một quy tắc hoặc mục kiểm tra thủ công')
        return self


IEEE_SOURCE = 'https://conferences.ieeeauthorcenter.ieee.org/write-your-paper/authoring-tools-and-templates/'
SPRINGER_SOURCE = 'https://link.springer.com/series/558/information-for-authors-and-editors'
PRESETS = [
    dict(name='IEEE Conference · A4', description='Cấu hình khởi đầu cho bản conference A4. Chỉnh theo template của hội nghị; chưa đặt giới hạn trang hoặc lề.', source_url=IEEE_SOURCE,
         rules=dict(page_sizes=[dict(width_mm=210, height_mm=297)], body_font_pt=10, columns=2,
                    required_sections=['Abstract', 'References'], manual_checks=['Đối chiếu font, lề, tiêu đề, tác giả, caption và tài liệu tham khảo với template của hội nghị.', 'Kiểm tra yêu cầu PDF eXpress nếu hội nghị sử dụng.'])),
    dict(name='IEEE Conference · US Letter', description='Cấu hình khởi đầu cho bản conference US Letter. Chỉnh theo template của hội nghị; chưa đặt giới hạn trang hoặc lề.', source_url=IEEE_SOURCE,
         rules=dict(page_sizes=[dict(width_mm=215.9, height_mm=279.4)], body_font_pt=10, columns=2,
                    required_sections=['Abstract', 'References'], manual_checks=['Đối chiếu font, lề, tiêu đề, tác giả, caption và tài liệu tham khảo với template của hội nghị.'])),
    dict(name='Springer · LNCS', description='Cấu hình khởi đầu cho proceedings LNCS, không áp dụng cho mọi tạp chí Springer. Khổ giấy và lề cần lấy từ template cụ thể.', source_url=SPRINGER_SOURCE,
         rules=dict(body_font_pt=10, columns=1, required_sections=['Abstract', 'References'],
                    manual_checks=['Kiểm tra khổ giấy, vùng in và font theo template Word hoặc LaTeX đã chọn.', 'Kiểm tra tiêu đề, tác giả, caption hình/bảng, trích dẫn và yêu cầu nguồn LaTeX/DOCX.'])),
]


MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
MAX_PAGES = 200
ENGINE_VERSION = '1.0'


def measure_pdf(source: Path | BytesIO) -> dict:
    pages = []
    total_chars = 0
    with pdfplumber.open(source) as pdf:
        if not 1 <= len(pdf.pages) <= MAX_PAGES:
            raise ValueError(f'Chỉ hỗ trợ PDF có 1–{MAX_PAGES} trang')
        for page in pdf.pages:
            chars = [c for c in page.chars if c['text'].strip()]
            total_chars += len(chars)
            if total_chars > 2_000_000:
                raise ValueError('PDF có quá nhiều ký tự để kiểm tra định dạng')
            sizes = Counter(round(c['size'], 1) for c in chars if 0 < c['size'] < 100)
            fonts = Counter(c['fontname'] for c in chars)
            common_size, count = sizes.most_common(1)[0] if sizes else (None, 0)
            common_font = fonts.most_common(1)[0][0] if fonts else None
            x0, y0, x1, y1 = page.bbox
            margins = None if not chars else dict(
                left=round((min(c['x0'] for c in chars) - x0) * 25.4 / 72, 2),
                right=round((x1 - max(c['x1'] for c in chars)) * 25.4 / 72, 2),
                top=round((min(c['top'] for c in chars) - y0) * 25.4 / 72, 2),
                bottom=round((y1 - max(c['bottom'] for c in chars)) * 25.4 / 72, 2))
            # A central whitespace strip in the middle of the page is only a clue.
            middle = [c for c in chars if y0 + page.height * .25 < c['top'] < y0 + page.height * .85]
            center = x0 + page.width / 2
            left = sum(c['x1'] < center - 4 for c in middle)
            right = sum(c['x0'] > center + 4 for c in middle)
            crossing = sum(c['x0'] < center + 4 and c['x1'] > center - 4 for c in middle)
            columns = (2 if crossing / len(middle) < .015 and min(left, right) > len(middle) * .2 else 1) if len(middle) >= 200 else None
            pages.append(dict(page=page.page_number, width_mm=round(page.width * 25.4 / 72, 2),
                              height_mm=round(page.height * 25.4 / 72, 2), char_count=len(chars),
                              dominant_font_pt=common_size, dominant_font=common_font,
                              dominant_font_share=round(count / len(chars), 3) if chars else 0,
                              text_margins_mm=margins, estimated_columns=columns,
                              text=(page.extract_text() or '')[:100000]))
            page.close()
    return dict(pages=pages, page_count=len(pages))


def analyze_format(path: Path, profile: dict) -> dict:
    rules = FormatRules.model_validate(profile['rules'])
    measurements = measure_pdf(path)
    findings = []

    def add(rule, status, page, evidence, expected, correction):
        findings.append(dict(rule=rule, status=status, page=page, evidence=evidence,
                             expected=expected, correction=correction))

    if rules.max_pages:
        n = measurements['page_count']
        add('Số trang', 'pass' if n <= rules.max_pages else 'fail', None, str(n),
            f'≤ {rules.max_pages} trang (tính toàn bộ PDF)', 'Điều chỉnh số trang theo giới hạn đã cấu hình.')
    for p in measurements['pages']:
        n = p['page']
        if rules.page_sizes:
            ok = any(abs(p['width_mm'] - s.width_mm) <= rules.tolerance_mm and abs(p['height_mm'] - s.height_mm) <= rules.tolerance_mm for s in rules.page_sizes)
            add('Khổ giấy', 'pass' if ok else 'fail', n, f"{p['width_mm']} × {p['height_mm']} mm",
                ' / '.join(f'{s.width_mm} × {s.height_mm} mm' for s in rules.page_sizes), 'Xuất PDF đúng khổ giấy; kiểm tra cả trang xoay.')
        if p['char_count'] < 100:
            add('Lớp văn bản', 'not_assessed', n, f"Chỉ đọc được {p['char_count']} ký tự.",
                'Văn bản PDF có thể trích xuất', 'Kiểm tra trang scan, trang hình hoặc trang trống bằng mắt. OCR chưa được hỗ trợ.')
        if rules.min_text_margins_mm:
            if p['text_margins_mm'] is None:
                add('Lề văn bản tối thiểu', 'not_assessed', n, 'Không có ký tự để đo.', str(rules.min_text_margins_mm.model_dump()), 'Kiểm tra trực quan.')
            else:
                bad = [side for side, minimum in rules.min_text_margins_mm.model_dump().items() if p['text_margins_mm'][side] + rules.tolerance_mm < minimum]
                add('Lề văn bản tối thiểu', 'warning' if bad else 'pass', n, str(p['text_margins_mm']),
                    str(rules.min_text_margins_mm.model_dump()), 'Đối chiếu các ký tự vượt lề, kể cả header/footer; phép đo không bao gồm hình và không suy ra lề nguồn Word/LaTeX.')
        reliable = p['char_count'] >= 100 and p['dominant_font_share'] >= .35
        if rules.body_font_pt:
            status = 'not_assessed' if not reliable else ('pass' if abs(p['dominant_font_pt'] - rules.body_font_pt) <= rules.font_tolerance_pt else 'warning')
            add('Cỡ chữ phổ biến', status, n, f"{p['dominant_font_pt']} pt; chiếm {p['dominant_font_share']:.0%} ký tự.",
                f'{rules.body_font_pt} ± {rules.font_tolerance_pt} pt', 'Đối chiếu font thân bài; trang tiêu đề, hình/bảng hoặc tài liệu tham khảo có thể dùng cỡ khác.')
        if rules.font_names:
            matches = any(name.lower() in (p['dominant_font'] or '').lower() for name in rules.font_names)
            add('Font phổ biến', 'not_assessed' if not reliable else 'pass' if matches else 'warning', n,
                p['dominant_font'] or 'Không đọc được', ', '.join(rules.font_names), 'Đối chiếu tên font PDF với font trong template; tên subset có thể khác.')
        if rules.columns:
            # Even a match stays advisory: whitespace cannot establish logical columns.
            add('Số cột (ước lượng)', 'not_assessed' if p['estimated_columns'] is None else 'warning', n,
                f"Ước lượng {p['estimated_columns']} cột." if p['estimated_columns'] else 'Không đủ văn bản.',
                f'{rules.columns} cột', 'Kiểm tra bố cục bằng mắt. Khoảng trắng giữa trang, bảng và hình có thể làm sai ước lượng.')
    for section in rules.required_sections:
        matches = [p['page'] for p in measurements['pages'] if section.casefold() in p['text'].casefold()]
        add('Mục bắt buộc: ' + section, 'warning' if matches else 'not_assessed', matches[0] if matches else None,
            f'Tìm thấy chuỗi tại trang {matches}.' if matches else 'Không tìm thấy chuỗi trong văn bản trích xuất.',
            section, 'Xác nhận đây là tiêu đề mục và nội dung đúng yêu cầu; tìm chuỗi chưa xác minh được cấu trúc.')
    for check in rules.manual_checks:
        add('Kiểm tra thủ công', 'not_assessed', None, 'Chưa kiểm tra tự động.', check, 'Đối chiếu PDF với hướng dẫn gốc.')
    for p in measurements['pages']:
        p.pop('text')
    counts = {status: sum(f['status'] == status for f in findings) for status in ('pass', 'fail', 'warning', 'not_assessed')}
    outcome = 'needs_changes' if counts['fail'] else 'needs_manual_review' if counts['warning'] or counts['not_assessed'] else 'checks_passed'
    return dict(engine_version=ENGINE_VERSION, manuscript_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                profile=profile, outcome=outcome, counts=counts, findings=findings, measurements=measurements,
                limitations=['Chỉ đánh giá các quy tắc đã cấu hình; không chứng nhận tuân thủ toàn bộ IEEE/Springer.',
                             'Không kiểm tra ngữ nghĩa caption, chất lượng ảnh, giãn dòng, font nhúng, PDF eXpress hay tài liệu nguồn.',
                             'Font, cột, lề văn bản và mục bắt buộc cần đối chiếu trực quan; chưa hỗ trợ OCR.'])


def infer_template(filename: str, content: bytes) -> tuple[dict, list[str]]:
    if not content or len(content) > MAX_TEMPLATE_BYTES:
        raise ValueError('Template phải có nội dung và tối đa 10 MB')
    suffix = Path(filename).suffix.lower()
    notes = ['Cấu hình nhập vào là bản nháp. Đối chiếu hướng dẫn của nơi nộp trước khi bật.']
    if suffix == '.json':
        import json
        value = json.loads(content)
        return FormatRules.model_validate(value.get('rules', value)).model_dump(), notes
    if suffix == '.pdf':
        measured = measure_pdf(BytesIO(content))
        pages = measured['pages']
        sizes = Counter((p['width_mm'], p['height_mm']) for p in pages)
        common = sizes.most_common(6)
        fonts = Counter()
        for p in pages:
            if p['char_count'] >= 100 and p['dominant_font_pt']:
                fonts[p['dominant_font_pt']] += p['char_count']
        font = fonts.most_common(1)[0][0] if fonts else None
        rules = dict(page_sizes=[dict(width_mm=w, height_mm=h) for (w, h), _ in common],
                     body_font_pt=font if font and 5 <= font <= 30 else None)
        notes.append('PDF: lấy khổ trang và cỡ chữ phổ biến. Không suy ra lề, số trang tối đa hoặc quy tắc bắt buộc từ nội dung ví dụ.')
    elif suffix == '.tex':
        text = content.decode('utf-8-sig')
        # Read declarations only. Never execute TeX, includes, shell escape or macros.
        text = re.sub(r'(?<!\\)%[^\n]*', '', text)
        declaration = re.search(r'\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}', text)
        if not declaration:
            raise ValueError('LaTeX cần khai báo documentclass')
        options = (declaration[1] or '').split(',')
        options = [o.strip() for o in options]
        rules = {}
        if 'a4paper' in options:
            rules['page_sizes'] = [dict(width_mm=210, height_mm=297)]
        elif 'letterpaper' in options:
            rules['page_sizes'] = [dict(width_mm=215.9, height_mm=279.4)]
        for option in options:
            if re.fullmatch(r'(10|11|12)pt', option):
                rules['body_font_pt'] = float(option[:-2])
        if 'twocolumn' in options or 'onecolumn' in options:
            rules['columns'] = 2 if 'twocolumn' in options else 1
        dimensions = {}
        for key, number, unit in re.findall(r'\b(paperwidth|paperheight)\s*=\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|pt)\b', text):
            dimensions[key] = float(number) * {'mm': 1, 'cm': 10, 'in': 25.4, 'pt': 25.4 / 72.27}[unit]
        if len(dimensions) == 2:
            rules['page_sizes'] = [dict(width_mm=dimensions['paperwidth'], height_mm=dimensions['paperheight'])]
        notes.append(f'LaTeX class: {declaration[2][:100]}. Chỉ đọc khai báo trực tiếp, không biên dịch hoặc đọc file input/include/class/style.')
        notes.append('Kiểm tra lại giá trị từ macro, geometry và class. Có thể tải PDF đã biên dịch làm một template mới để đo bố cục.')
    elif suffix == '.docx':
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        attr = lambda el, key: el.get('{' + ns['w'] + '}' + key) if el is not None else None
        with ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(i.file_size for i in entries) > 40 * 1024 * 1024:
                raise ValueError('DOCX giải nén vượt giới hạn')
            if any('vbaProject' in i.filename for i in entries):
                raise ValueError('Không hỗ trợ template chứa macro')
            doc = ElementTree.fromstring(archive.read('word/document.xml'))
            sections = doc.findall('.//w:sectPr', ns)
            if not sections:
                raise ValueError('DOCX không khai báo khổ trang')
            first = sections[0]
            size = first.find('w:pgSz', ns)
            rules = dict(page_sizes=[dict(width_mm=round(int(attr(size, 'w')) * 25.4 / 1440, 2),
                                          height_mm=round(int(attr(size, 'h')) * 25.4 / 1440, 2))])
            columns = first.find('w:cols', ns)
            num = int(attr(columns, 'num') or 1)
            if num in (1, 2):
                rules['columns'] = num
            if 'word/styles.xml' in archive.namelist():
                styles = ElementTree.fromstring(archive.read('word/styles.xml'))
                normal = styles.find('.//w:style[@w:styleId="Normal"]/w:rPr/w:sz', ns)
                if normal is None:
                    normal = styles.find('.//w:docDefaults/w:rPrDefault/w:rPr/w:sz', ns)
                if normal is not None:
                    rules['body_font_pt'] = int(attr(normal, 'val')) / 2
        notes.append('DOCX: đọc khổ trang và cột của section đầu, cỡ chữ Normal/default nếu có. Không chạy macro hoặc chuyển đổi tài liệu.')
        notes.append(f'Có {len(sections)} section; kiểm tra các section khác và font kế thừa. Lề nguồn DOCX không dùng làm lề ký tự PDF.')
    else:
        raise ValueError('Hỗ trợ template PDF, DOCX, TEX hoặc JSON quy tắc')
    rules['manual_checks'] = notes
    return FormatRules.model_validate(rules).model_dump(), notes


def report_markdown(result: dict) -> str:
    profile = result['profile']
    labels = dict(pass_='Đạt phép kiểm tra', fail='Sai quy tắc', warning='Cần đối chiếu', not_assessed='Chưa đánh giá')
    rev = profile.get('revision', '1.0')
    lines = ['# Báo cáo kiểm tra định dạng', '', f"Chuẩn: {profile['name']} · v{rev}", '',
             f"Kết quả: {result['outcome']}", '', f"SHA-256 PDF: `{result['manuscript_sha256']}`", '',
             '## Phạm vi', '', *['- ' + s for s in result['limitations']], '', '## Kết quả chi tiết', '']
    for f in result['findings']:
        lines.extend([f"### {f['rule']} — {labels.get(f['status'], labels['pass_'])}", '',
                      f"Vị trí: {'Trang ' + str(f['page']) if f['page'] else 'Toàn bài'}", '',
                      'Đo được: ' + f['evidence'], '', 'Yêu cầu: ' + f['expected'], '', 'Cách xử lý: ' + f['correction'], ''])
    return '\n'.join(lines)
