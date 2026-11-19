"""Developer-only renderer for actual smoke-test PDFs. Needs PyMuPDF and Pillow."""
from pathlib import Path
import pymupdf
from PIL import Image

root = Path(__file__).resolve().parents[3]
source = root / ".cache/manuscript-template-audit/pdf"
target = root / "apps/web/public/manuscript-templates/v2"
files = sorted(source.glob("*-preview.pdf"))
if len(files) != 10:
    raise RuntimeError("Compile all ten previews first with verify-manuscript-templates.ts --previews")
target.mkdir(parents=True, exist_ok=True)
for path in files:
    with pymupdf.open(path) as document:
        pixmap = document[0].get_pixmap(matrix=pymupdf.Matrix(1.3, 1.3), alpha=False)
        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
        image.save(target / (path.stem.removesuffix("-preview") + ".webp"), format="WEBP", quality=85)
