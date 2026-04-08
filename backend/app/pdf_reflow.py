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
) -> None:
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
            return
        fs -= 0.5

    # Last resort: insert the largest prefix that fits.
    lo, hi = 0, len(text)
    best = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        trial = text[:mid].rstrip()
        if not trial:
            hi = mid - 1
            continue
        page.clean_contents()  # reset any partial insertions
        excess = page.insert_textbox(
            rect,
            trial + "…",
            fontsize=min_font,
            fontname=fontname,
            color=color,
            align=align,
        )
        if excess >= 0:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1

    if best > 0:
        page.clean_contents()
        page.insert_textbox(
            rect,
            text[:best].rstrip() + "…",
            fontsize=min_font,
            fontname=fontname,
            color=color,
            align=align,
        )


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

            raw_text = _extract_page_text(sp)
            repls = replacements_by_page.get(i + 1, [])
            text = _apply_replacements(raw_text, repls).strip()

            if not text:
                continue

            # Use built-in fonts that can render CJK + bullets/dashes reliably.
            # Base-14 fonts (helv/tiro) frequently miss these glyphs.
            fn = "korea" if (_contains_cjk(text) or _contains_wide_punct(text)) else fontname

            # Render into a single text box with wrapping. This sacrifices original layout
            # (columns, exact spacing) but provides stable reflow for longer edits.
            _insert_textbox_fit(
                page,
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

