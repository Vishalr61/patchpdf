"""Apply a single text overlay patch with PyMuPDF (typed PDFs only)."""

import fitz


def apply_text_patch(
    pdf_bytes: bytes,
    *,
    page_index: int,
    bbox: tuple[float, float, float, float],
    replacement_text: str,
) -> bytes:
    """
    Whitespace out ``bbox`` on ``page_index`` (0-based), then draw ``replacement_text``
    inside it. Font size is reduced until the text fits (simple loop).
    """
    x0, y0, x1, y1 = bbox
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise ValueError("page out of range")

        page = doc[page_index]
        rect = fitz.Rect(x0, y0, x1, y1)
        if rect.is_empty:
            raise ValueError("bbox is empty")

        # Cover original glyphs (typed PDFs).
        page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), width=0)

        text = replacement_text.replace("\r\n", "\n").strip()
        if not text:
            return doc.tobytes()

        # insert_textbox returns unused rectangle height if OK, negative if text did not fit.
        fontsize = 12.0
        min_font = 5.0
        while fontsize >= min_font:
            excess = page.insert_textbox(
                rect,
                text,
                fontsize=fontsize,
                fontname="helv",
                color=(0, 0, 0),
                align=fitz.TEXT_ALIGN_LEFT,
            )
            if excess >= 0:
                break
            fontsize -= 0.75
            page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), width=0)

        return doc.tobytes()
    finally:
        doc.close()
