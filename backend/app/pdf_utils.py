"""Apply text overlay patches with PyMuPDF (typed PDFs only)."""

from __future__ import annotations

import fitz

def _contains_cjk(s: str) -> bool:
    for ch in s:
        o = ord(ch)
        if (
            0x4E00 <= o <= 0x9FFF
            or 0x3400 <= o <= 0x4DBF
            or 0x3040 <= o <= 0x30FF
            or 0xAC00 <= o <= 0xD7AF
        ):
            return True
    return False

def _pdf_user_bbox_to_page_rect(page: fitz.Page, bbox: tuple[float, float, float, float]) -> fitz.Rect:
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
    return fitz.Rect(
        max(pr.x0, rect.x0 - pad_x),
        max(pr.y0, rect.y0 - pad_y),
        min(pr.x1, rect.x1 + grow_x),
        min(pr.y1, rect.y1 + grow_y),
    )


def _span_color_to_rgb(color: object) -> tuple[float, float, float]:
    if color is None:
        return (0.0, 0.0, 0.0)
    try:
        c = int(color)
    except (TypeError, ValueError):
        return (0.0, 0.0, 0.0)
    r = ((c >> 16) & 255) / 255.0
    g = ((c >> 8) & 255) / 255.0
    b = (c & 255) / 255.0
    return (r, g, b)


def _pick_base_font(font_name: str, flags: int) -> str:
    """Map PDF font name + flags to a PyMuPDF base font."""
    f = font_name.lower()
    bold = "bold" in f or (flags & 16) != 0
    italic = "italic" in f or "oblique" in f or (flags & 1) != 0

    def pick(sans: str, serif: str, mono: str) -> str:
        if any(x in f for x in ("courier", "mono", "consolas", "menlo")):
            return mono
        if any(
            x in f
            for x in (
                "times",
                "serif",
                "georgia",
                "garamond",
                "minion",
                "charter",
            )
        ):
            return serif
        return sans

    if bold and italic:
        return pick("hebo", "tibo", "cobo")
    if bold:
        return pick("hebo", "tibo", "cobo")
    if italic:
        return pick("heit", "tiit", "coit")
    return pick("helv", "tiro", "cour")


def _detect_line_alignment(page: fitz.Page, line_bbox: fitz.Rect) -> int:
    pr = page.rect
    mid = (line_bbox.x0 + line_bbox.x1) / 2
    center = (pr.x0 + pr.x1) / 2
    if abs(mid - center) < pr.width * 0.08:
        return fitz.TEXT_ALIGN_CENTER
    return fitz.TEXT_ALIGN_LEFT


def detect_text_style(page: fitz.Page, rect: fitz.Rect) -> tuple[float, str, tuple[float, float, float], int]:
    """
    Inspect text dict under ``rect``; return (fontsize, fontname, rgb, align).
    Falls back to Helvetica 12pt black left.
    """
    d = page.get_text("dict", clip=rect)
    best_span: dict | None = None
    best_area = 0.0
    best_line_bbox: fitz.Rect | None = None

    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            lb = fitz.Rect(line["bbox"])
            line_clip = lb & rect
            if line_clip.is_empty:
                continue
            for span in line.get("spans", []):
                sb = fitz.Rect(span["bbox"])
                inter = sb & rect
                if inter.is_empty or not inter.is_valid:
                    continue
                area = inter.get_area()
                if area > best_area:
                    best_area = area
                    best_span = span
                    best_line_bbox = lb

    if not best_span:
        return 12.0, "helv", (0.0, 0.0, 0.0), fitz.TEXT_ALIGN_LEFT

    size = float(best_span.get("size") or 12.0)
    size = max(5.0, min(size, 72.0))
    font = str(best_span.get("font") or "helv")
    flags = int(best_span.get("flags") or 0)
    rgb = _span_color_to_rgb(best_span.get("color"))
    fname = _pick_base_font(font, flags)
    align = (
        _detect_line_alignment(page, best_line_bbox)
        if best_line_bbox is not None
        else fitz.TEXT_ALIGN_LEFT
    )
    return size, fname, rgb, align


def apply_text_patch_to_doc(
    doc: fitz.Document,
    *,
    page_index: int,
    bbox: tuple[float, float, float, float],
    replacement_text: str,
) -> None:
    if page_index < 0 or page_index >= doc.page_count:
        raise ValueError("page out of range")

    page = doc[page_index]
    base = _pdf_user_bbox_to_page_rect(page, bbox)
    rect = _inflate_page_rect(page, base)
    if rect.is_empty:
        raise ValueError("bbox is empty")

    page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), width=0)

    text = replacement_text.replace("\r\n", "\n").strip()
    if not text:
        return

    fontsize, fontname, color, align = detect_text_style(page, base)
    if _contains_cjk(text):
        # Base-14 fonts won't draw CJK glyphs; use built-in CJK font.
        fontname = "china-s"
    min_font = max(5.0, fontsize * 0.45)

    # Prefer keeping the detected font size. If the rewrite is longer than the
    # selected box, expand the patch region downward (white-out more area)
    # before shrinking the font. This avoids tiny “corner text” for long edits.
    pr = page.rect
    max_grow = min(pr.y1, rect.y0 + max(140.0, rect.height * 4.0))
    grow_step = max(12.0, fontsize * 1.35)

    cur = fitz.Rect(rect)
    while cur.y1 < max_grow:
        page.draw_rect(cur, color=(1, 1, 1), fill=(1, 1, 1), width=0)
        excess = page.insert_textbox(
            cur,
            text,
            fontsize=fontsize,
            fontname=fontname,
            color=color,
            align=align,
        )
        if excess >= 0:
            return
        cur = fitz.Rect(cur.x0, cur.y0, cur.x1, min(max_grow, cur.y1 + grow_step))

    # Fall back to shrinking the font if it still doesn't fit.
    cur = fitz.Rect(cur.x0, cur.y0, cur.x1, pr.y1)
    while fontsize >= min_font:
        page.draw_rect(cur, color=(1, 1, 1), fill=(1, 1, 1), width=0)
        excess = page.insert_textbox(
            cur,
            text,
            fontsize=fontsize,
            fontname=fontname,
            color=color,
            align=align,
        )
        if excess >= 0:
            return
        fontsize -= 0.75


def apply_text_patch(
    pdf_bytes: bytes,
    *,
    page_index: int,
    bbox: tuple[float, float, float, float],
    replacement_text: str,
) -> bytes:
    """
    Whitespace out ``bbox`` on ``page_index`` (0-based), then draw ``replacement_text``.

    ``bbox`` is in **PDF user space** (pdf.js ``convertToPdfPoint``).
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        apply_text_patch_to_doc(
            doc,
            page_index=page_index,
            bbox=bbox,
            replacement_text=replacement_text,
        )
        return doc.tobytes()
    finally:
        doc.close()


def apply_patches(
    pdf_bytes: bytes,
    patches: list[tuple[int, tuple[float, float, float, float], str]],
) -> bytes:
    """
    Apply multiple patches in order. Each item is (1-based page, bbox pdf user, text).
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page_1, bbox, replacement in patches:
            apply_text_patch_to_doc(
                doc,
                page_index=page_1 - 1,
                bbox=bbox,
                replacement_text=replacement,
            )
        return doc.tobytes()
    finally:
        doc.close()
