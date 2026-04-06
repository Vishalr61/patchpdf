#!/usr/bin/env python3
"""
Exercise /rewrite and /export without a running server (ASGI transport).

Run from repo:  cd backend && .venv/bin/python scripts/smoke_test_capabilities.py
Requires: httpx (Starlette TestClient; pip install httpx python-multipart)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow `python scripts/smoke_test_capabilities.py` from backend/
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import fitz  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def make_sample_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((72, 100), "Hello PatchPDF", fontsize=16)
    page.insert_text((72, 200), "FooterNote", fontsize=10)
    out = doc.tobytes()
    doc.close()
    return out


def _page_rect_to_pdf_user_bbox(page: fitz.Page, rect: fitz.Rect) -> tuple[float, float, float, float]:
    """Invert ``transformation_matrix`` so /export receives PDF-user-space like the web client."""
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


def bbox_for_phrase(pdf_bytes: bytes, needle: str) -> tuple[float, float, float, float]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[0]
        hits = page.search_for(needle)
        if not hits:
            raise RuntimeError(f"phrase not found in PDF: {needle!r}")
        r = hits[0]
        # Tight search boxes are too small for insert_textbox; give room for replacement text.
        pad_x, pad_y = 6.0, 8.0
        grow_right, grow_down = 220.0, 36.0
        page_box = fitz.Rect(
            r.x0 - pad_x,
            r.y0 - pad_y,
            r.x1 + grow_right,
            r.y1 + grow_down,
        )
        return _page_rect_to_pdf_user_bbox(page, page_box)
    finally:
        doc.close()


def main() -> int:
    pdf = make_sample_pdf()
    bbox = bbox_for_phrase(pdf, "Hello PatchPDF")

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}, r.text
    print("OK GET /health")

    r = client.post(
        "/rewrite",
        json={"text": "Hello PatchPDF", "instruction": "smoke test"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "replacement_text" in body
    assert "[mock]" in body["replacement_text"]
    assert "smoke test" in body["replacement_text"]
    print("OK POST /rewrite ->", body["replacement_text"][:72])

    token = "PATCH_OK_42"
    export_body = {
        "patches": [
            {
                "page": 1,
                "bbox": list(bbox),
                "replacement_text": token,
            },
        ],
    }
    r = client.post(
        "/export",
        files={"file": ("sample.pdf", pdf, "application/pdf")},
        data={"patches": json.dumps(export_body)},
    )
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert "application/pdf" in ct, ct
    patched = r.content
    assert len(patched) > 100 and patched[:4] == b"%PDF", "not a PDF"
    print(f"OK POST /export -> {len(patched)} bytes application/pdf")

    doc2 = fitz.open(stream=patched, filetype="pdf")
    try:
        hits = doc2[0].search_for(token)
        assert hits, f"replacement {token!r} not found (get_text={doc2[0].get_text()!r})"
        print("OK exported PDF contains replacement token (PyMuPDF search_for)")
        # Note: get_text() may still list original glyphs (overlay does not remove content streams).
    finally:
        doc2.close()

    out_path = _BACKEND / "scripts" / "_smoke_patched.pdf"
    out_path.write_bytes(patched)
    print(f"Wrote {out_path} for manual inspection")

    r = client.post(
        "/plan",
        files={"file": ("sample.pdf", pdf, "application/pdf")},
        data={"instruction": "smoke plan"},
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    assert "edits" in plan and isinstance(plan["edits"], list)
    print("OK POST /plan ->", len(plan["edits"]), "edits (mock may be empty)")

    bbox2 = bbox_for_phrase(pdf, "FooterNote")
    export_two = {
        "patches": [
            {
                "page": 1,
                "bbox": list(bbox),
                "replacement_text": token,
            },
            {
                "page": 1,
                "bbox": list(bbox2),
                "replacement_text": "FOOTER_OK",
            },
        ],
    }
    r = client.post(
        "/export",
        files={"file": ("sample.pdf", pdf, "application/pdf")},
        data={"patches": json.dumps(export_two)},
    )
    assert r.status_code == 200, r.text
    doc3 = fitz.open(stream=r.content, filetype="pdf")
    try:
        assert doc3[0].search_for("FOOTER_OK")
    finally:
        doc3.close()
    print("OK POST /export multi-patch -> second token found")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as e:
        print("FAIL:", e, file=sys.stderr)
        raise SystemExit(1)
