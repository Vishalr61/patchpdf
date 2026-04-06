"""Extract PDF text for LLM planning and resolve find→bbox in PDF user space."""

from __future__ import annotations

import fitz


def extract_document_text_for_plan(pdf_bytes: bytes, *, max_chars: int = 120_000) -> str:
    """Concatenate plain text per page for model context (truncated if huge)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        parts: list[str] = []
        n = 0
        for i in range(doc.page_count):
            block = f"--- Page {i + 1} ---\n{doc[i].get_text('text')}"
            if n + len(block) > max_chars:
                parts.append(block[: max_chars - n])
                break
            parts.append(block)
            n += len(block) + 1
        return "\n".join(parts)
    finally:
        doc.close()


def page_rect_to_pdf_bbox(page: fitz.Page, rect: fitz.Rect) -> tuple[float, float, float, float]:
    inv = ~page.transformation_matrix
    corners = [
        (rect.x0, rect.y0),
        (rect.x1, rect.y0),
        (rect.x0, rect.y1),
        (rect.x1, rect.y1),
    ]
    pts = [fitz.Point(x, y).transform(inv) for x, y in corners]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def resolve_plan_edit(
    page: fitz.Page,
    find: str,
    replace: str,
    *,
    page_1based: int,
) -> dict:
    """Return bbox in PDF user space + metadata, or error if not found."""
    needle = find.strip()
    if not needle:
        return {
            "page": page_1based,
            "find": find,
            "replace": replace,
            "bbox": None,
            "error": "empty find string",
        }

    hits = page.search_for(needle)
    if not hits:
        return {
            "page": page_1based,
            "find": find,
            "replace": replace,
            "bbox": None,
            "error": "text not found on page",
        }

    r = hits[0]
    bbox_pdf = page_rect_to_pdf_bbox(page, r)
    return {
        "page": page_1based,
        "find": find,
        "replace": replace,
        "bbox": list(bbox_pdf),
        "error": None,
    }


def resolve_all_plan_edits(
    pdf_bytes: bytes,
    edits: list[dict],
) -> list[dict]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        out: list[dict] = []
        for e in edits:
            pnum = int(e.get("page", 1))
            if pnum < 1 or pnum > doc.page_count:
                out.append(
                    {
                        "page": pnum,
                        "find": str(e.get("find", "")),
                        "replace": str(e.get("replace", "")),
                        "bbox": None,
                        "error": "page out of range",
                    },
                )
                continue
            page = doc[pnum - 1]
            out.append(
                resolve_plan_edit(
                    page,
                    str(e.get("find", "")),
                    str(e.get("replace", "")),
                    page_1based=pnum,
                ),
            )
        return out
    finally:
        doc.close()
