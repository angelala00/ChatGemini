import os
from typing import Callable, Dict, Optional

from docx import Document
from openpyxl import load_workbook
from PyPDF2 import PdfReader

try:  # textract is optional; gracefully degrade when it is not installed
    import textract as _textract  # type: ignore
except ModuleNotFoundError:
    _textract = None


def _process_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as infile:
        return infile.read()


def _process_pdf(file_path: str) -> str:
    reader = PdfReader(file_path)
    chunks = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text:
            chunks.append(text)
    return "\n".join(chunks)


def _process_docx(file_path: str) -> str:
    document = Document(file_path)
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def _process_xlsx(file_path: str) -> str:
    workbook = load_workbook(file_path, data_only=True)
    sheet = workbook.active
    rows = []
    for row in sheet.iter_rows(values_only=True):
        normalized = " ".join("" if cell is None else str(cell) for cell in row)
        rows.append(normalized.rstrip())
    return "\n".join(rows)


_EXTRACTORS: Dict[str, Callable[[str], str]] = {
    ".txt": _process_txt,
    ".pdf": _process_pdf,
    ".docx": _process_docx,
    ".xlsx": _process_xlsx,
}


def _extract_with_textract(file_path: str, extension: Optional[str]) -> str:
    if _textract is None:
        raise ValueError(
            "Unsupported file type without optional textract dependency. "
            "Please install textract manually if you need broader format support."
        )

    raw = _textract.process(file_path, extension=extension)
    return raw.decode("utf-8", errors="ignore")


def extract_text(file_path: str, extension: Optional[str] = None) -> str:
    """
    Extract text content from supported files. Falls back to textract (when available)
    so that callers can still process legacy formats such as .doc.
    """
    ext = extension or os.path.splitext(file_path)[1]
    ext = (ext or "").lower()
    if not ext.startswith("."):
        ext = f".{ext}"

    extractor = _EXTRACTORS.get(ext)
    if extractor:
        return extractor(file_path)

    return _extract_with_textract(file_path, ext or None)
