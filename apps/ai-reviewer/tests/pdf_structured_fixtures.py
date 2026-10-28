"""Synthetic document fixtures. All names, orders and measurements are fictional."""
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject

FIXTURES = Path(__file__).parent / "fixtures" / "pdf-structured"


def receipt_pdf(borderless=False):
    return (FIXTURES / ("receipt-borderless.pdf" if borderless else "receipt-ruled.pdf")).read_bytes()


def simple_document(kind="prose", pages=1, rows=18):
    writer = PdfWriter()
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    font_id = writer._add_object(font)
    bold = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica-Bold")})
    bold_id = writer._add_object(bold)
    for number in range(pages):
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_id, NameObject("/F2"): bold_id})})
        commands = []
        def text(value, x, y, size=11, face="F1"):
            value = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"BT /{face} {size} Tf {x} {y} Td ({value}) Tj ET")
        text(f"Research methods {number + 1}", 50, 735, 17, "F2")
        if kind == "merged":
            for y in [690, 660, 600, 570]:
                commands.append(f"50 {y} m 560 {y} l S")
            commands.append("220 630 m 560 630 l S")
            for x in [50, 390, 560]:
                commands.append(f"{x} 570 m {x} 690 l S")
            commands.append("220 570 m 220 660 l S")
            for value, x, y in [
                ("Research evidence", 58, 670), ("Amount", 400, 670),
                ("Shared group", 58, 640), ("Sample A", 230, 640), ("125.00", 450, 640),
                ("Sample B", 230, 610), ("250.00", 450, 610),
                ("Other group", 58, 580), ("Sample C", 230, 580), ("375.00", 450, 580),
            ]:
                text(value, x, y, 10)
        elif kind == "table":
            top, bottom = 690, 690 - (rows + 1) * 24
            for y in range(int(bottom), top + 1, 24):
                # Small gaps in each rule exercise line joining rather than a single rectangle.
                commands.extend([f"50 {y} m 296 {y} l S", f"298 {y} m 560 {y} l S"])
            for x in [50, 300, 430, 560]:
                commands.append(f"{x} {bottom} m {x} {top} l S")
            for value, x in [("Research sample", 58), ("Quantity", 310), ("Amount", 440)]:
                text(value, x, top - 16, 10, "F2")
            for row in range(rows):
                y = top - 40 - row * 24
                text(f"Sample {row + 1}", 58, y, 10)
                text(str(row + 1), 350, y, 10)
                text(f"{(row + 1) * 125}.00", 450, y, 10)
        elif kind == "columns":
            # Repeated left edges alone must not imply tabular data.
            for index in range(4):
                text(f"The left column explains study method {index + 1}.", 50, 690 - index * 19, 9)
                text(f"The right column discusses related literature {index + 1}.", 320, 690 - index * 19, 9)
        else:
            lines = [
                "This study preserves research evidence and exact numerical measurements.",
                "Participants compared methods across three independent source documents.",
                "The measured value is 92.5 percent; source key SAMPLE-2026-041 is unchanged.",
                "Long prose should remain an editable paragraph that wraps when it is revised.",
            ]
            for index, value in enumerate(lines):
                text(value, 50, 690 - index * 17)
            if kind == "list":
                text("Study objectives", 50, 580, 14, "F2")
                for index, value in enumerate(["1. Preserve source evidence", "2. Keep all numeric results", "3. Review every interpretation"]):
                    text(value, 60, 550 - index * 20)
            elif kind == "equation":
                text("E = mc^2", 255, 560, 13)
                text("Equation is printed source text; no symbolic reconstruction is assumed.", 50, 520)
            elif kind == "special":
                text("Source contains 50% & sample_1 #2 {group} $5 and \\input{evil}.", 50, 560)
            elif kind == "figure":
                image = DecodedStreamObject()
                image.set_data(bytes([25, 80, 150]) * 40 * 20)
                image.update({NameObject("/Type"): NameObject("/XObject"), NameObject("/Subtype"): NameObject("/Image"),
                              NameObject("/Width"): NumberObject(40),
                              NameObject("/Height"): NumberObject(20),
                              NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
                              NameObject("/BitsPerComponent"): NumberObject(8)})
                page["/Resources"][NameObject("/XObject")] = DictionaryObject({NameObject("/Figure"): writer._add_object(image)})
                commands.append("q 180 0 0 90 200 400 cm /Figure Do Q")
                text("Figure 1. Synthetic research illustration.", 190, 380, 9)
            text("Synthetic fixture: no real participant or experiment data.", 50, 75, 8)
        stream = DecodedStreamObject(); stream.set_data("\n".join(commands).encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    output = BytesIO(); writer.write(output)
    return output.getvalue()


def vietnamese_scan():
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 34)
    except OSError:
        # Windows does not ship DejaVu; Arial also covers Vietnamese.
        font = ImageFont.truetype("arial.ttf", 34)
    for index, line in enumerate(["PHIẾU KIỂM THỬ NGHIÊN CỨU", "Mã đơn: TEST-2026-041", "Số lượng: 3", "Tổng tiền: 1.275.000 VND", "Ghi chú: kiểm tra dữ liệu gốc."]):
        draw.text((85, 120 + index * 85), line, fill="black", font=font)
    output = BytesIO(); image.save(output, format="PDF", resolution=150)
    return output.getvalue()
