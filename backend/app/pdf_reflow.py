"""Reflow rebuild: extract text, apply edits, render a new PDF."""

from __future__ import annotations

import fitz


def _contains_cjk(s: str) -> bool:
    # Rough detection for CJK Unified Ideographs + Hiragana/Katakana + Hangul.
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


def _apply_replacements(text: str, repls: list[tuple[str, str]]) -> str:
    out = text
    for find, replace in repls:
        f = (find or "").strip()
        if not f:
            continue
        # Replace first occurrence per patch to reduce accidental global changes.
        if f in out:
            out = out.replace(f, replace or "", 1)
    return out


def rebuild_pdf_from_text(
    pdf_bytes: bytes,
    *,
    replacements_by_page: dict[int, list[tuple[str, str]]],
    fontname: str = "helv",
    fontsize: float = 11.0,
    margin: float = 54.0,
) -> bytes:
    """Generate a new PDF with flowing text per page (1-based page keys)."""
    src = fitz.open(stream=pdf_bytes, filetype="pdf")
    out = fitz.open()
    try:
        for i in range(src.page_count):
            sp = src[i]
            pr = sp.rect
            page = out.new_page(width=pr.width, height=pr.height)
            rect = fitz.Rect(
                margin,
                margin,
                max(margin + 50.0, pr.width - margin),
                max(margin + 50.0, pr.height - margin),
            )

            raw_text = sp.get_text("text") or ""
            repls = replacements_by_page.get(i + 1, [])
            text = _apply_replacements(raw_text, repls).strip()

            if not text:
                continue

            # Use a CJK-capable built-in font when needed, otherwise Helvetica.
            fn = "china-s" if _contains_cjk(text) else fontname

            # Render into a single text box with wrapping. This sacrifices original layout
            # (columns, exact spacing) but provides stable reflow for longer edits.
            page.insert_textbox(
                rect,
                text,
                fontsize=fontsize,
                fontname=fn,
                color=(0, 0, 0),
                align=fitz.TEXT_ALIGN_LEFT,
            )

        return out.tobytes()
    finally:
        src.close()
        out.close()

