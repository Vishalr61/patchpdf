"""Apply a single text overlay patch with PyMuPDF (typed PDFs only)."""

import fitz


def _pdf_user_bbox_to_page_rect(page: fitz.Page, bbox: tuple[float, float, float, float]) -> fitz.Rect:
    """
    Map an axis-aligned box from **PDF user space** (same as pdf.js ``convertToPdfPoint``:
    ISO-style, y increases upward) into **PyMuPDF page space** (``page.rect``, y downward)
    using the page's ``transformation_matrix`` (crop, rotation, etc.).
    """
    x0, y0, x1, y1 = bbox
    xa0, xa1 = min(x0, x1), max(x0, x1)
    ya0, ya1 = min(y0, y1), max(y0, y1)
    m = page.transformation_matrix
    corners = [(xa0, ya0), (xa0, ya1), (xa1, ya0), (xa1, ya1)]
    pts = [fitz.Point(x, y).transform(m) for x, y in corners]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return fitz.Rect(min(xs), min(ys), max(xs), max(ys))


def _inflate_page_rect(page: fitz.Page, rect: fitz.Rect) -> fitz.Rect:
    pr = page.rect
    pad_x, pad_y = 4.0, 5.0
    grow_x = min(200.0, max(48.0, pr.width * 0.28))
    grow_y = 18.0
    r = fitz.Rect(
        max(pr.x0, rect.x0 - pad_x),
        max(pr.y0, rect.y0 - pad_y),
        min(pr.x1, rect.x1 + grow_x),
        min(pr.y1, rect.y1 + grow_y),
    )
    return r


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

    ``bbox`` is ``(x0, y0, x1, y1)`` in **PDF user space** (pdf.js ``convertToPdfPoint`` output),
    not PyMuPDF page space. It is converted with ``page.transformation_matrix``.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise ValueError("page out of range")

        page = doc[page_index]
        base = _pdf_user_bbox_to_page_rect(page, bbox)
        rect = _inflate_page_rect(page, base)
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
