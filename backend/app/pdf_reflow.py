"""Reflow rebuild: extract text, apply edits, render a new PDF."""

from __future__ import annotations

import re
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


def _contains_wide_punct(s: str) -> bool:
    # Bullets and common dash variants that Base-14 fonts often miss.
    return any(ch in s for ch in ("•", "·", "‧", "–", "—", "‒", "−"))


def _extract_page_text(page: fitz.Page) -> str:
    # Primary path: standard text extraction, sorted for reading order.
    try:
        t = page.get_text("text", sort=True) or ""
    except TypeError:
        t = page.get_text("text") or ""
    if t.strip():
        return t

    # Fallback: extract from dict spans (some PDFs extract poorly via plain text).
    d = page.get_text("dict")
    parts: list[str] = []
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                s = span.get("text")
                if isinstance(s, str) and s:
                    parts.append(s)
            parts.append("\n")
        parts.append("\n")
    return "".join(parts)


def _apply_replacements(text: str, repls: list[tuple[str, str]]) -> str:
    out = text
    for find, replace in repls:
        f = (find or "").replace("\u00a0", " ").strip()
        if not f:
            continue

        # Replace first occurrence per patch to reduce accidental global changes.
        # PDF extraction often differs in whitespace vs the selection string (newlines, multiple spaces).
        # Make matching whitespace-tolerant.
        escaped = re.escape(f)
        escaped = re.sub(r"(?:\\\s)+", r"\\s+", escaped)
        pattern = re.compile(escaped, flags=re.MULTILINE)
        out2, n = pattern.subn(replace or "", out, count=1)
        if n == 0 and f in out:
            out2 = out.replace(f, replace or "", 1)
            n = 1
        out = out2
    return out


def _insert_textbox_fit(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    fontname: str,
    color: tuple[float, float, float] = (0, 0, 0),
    align: int = fitz.TEXT_ALIGN_LEFT,
    fontsize: float,
) -> float:
    # Try to fit by shrinking first (avoid blank pages when insert_textbox refuses).
    min_font = max(7.0, fontsize * 0.7)
    fs = fontsize
    while fs >= min_font:
        excess = page.insert_textbox(
            rect,
            text,
            fontsize=fs,
            fontname=fontname,
            color=color,
            align=align,
        )
        if excess >= 0:
            return rect.height - float(excess)
        fs -= 0.5

    # Last resort: draw as much as fits at min_font (may clip / partially render).
    excess = page.insert_textbox(
        rect,
        text,
        fontsize=min_font,
        fontname=fontname,
        color=color,
        align=align,
    )
    if excess >= 0:
        return rect.height - float(excess)
    return rect.height


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
            x0 = margin
            x1 = max(margin + 50.0, pr.width - margin)
            y = margin
            y_bottom = max(margin + 50.0, pr.height - margin)

            raw_text = _extract_page_text(sp)
            repls = replacements_by_page.get(i + 1, [])
            text = _apply_replacements(raw_text, repls).strip()

            if not text:
                continue

            # Reflow in chunks so we can switch fonts only where needed.
            # This keeps Latin text looking normal while still supporting bullets/dashes/CJK.
            chunks = [c.strip() for c in re.split(r"\n{2,}", text) if c.strip()]
            gap = max(8.0, fontsize * 0.8)

            for chunk in chunks:
                if y >= y_bottom - 10:
                    break
                rect = fitz.Rect(x0, y, x1, y_bottom)
                needs_unicode = _contains_cjk(chunk) or _contains_wide_punct(chunk)
                fn = "korea" if needs_unicode else fontname
                used = _insert_textbox_fit(
                    page,
                    rect,
                    chunk,
                    fontsize=fontsize,
                    fontname=fn,
                    color=(0, 0, 0),
                    align=fitz.TEXT_ALIGN_LEFT,
                )
                y = min(y_bottom, y + used + gap)

        return out.tobytes()
    finally:
        src.close()
        out.close()

