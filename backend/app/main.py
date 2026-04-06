import json
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.ai_utils import mock_rewrite
from app.pdf_utils import apply_text_patch
from app.schemas import ExportPatch, RewriteRequest, RewriteResponse

app = FastAPI(title="PatchPDF API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    """Avoid 404 when opening the server root in a browser."""
    return {
        "service": "PatchPDF API",
        "docs": "/docs",
        "health": "/health",
        "rewrite": "POST /rewrite — JSON body: text, instruction",
        "export": "POST /export — multipart: file, patch (JSON)",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/rewrite", response_model=RewriteResponse)
def rewrite(body: RewriteRequest) -> RewriteResponse:
    replacement = mock_rewrite(body.text, body.instruction)
    return RewriteResponse(replacement_text=replacement)


@app.post("/export")
async def export_pdf(
    file: Annotated[UploadFile, File(description="Original PDF")],
    patch: Annotated[str, Form(description="JSON: page, bbox, replacement_text")],
) -> Response:
    try:
        body = ExportPatch.model_validate_json(patch)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid patch JSON: {e}") from e

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty PDF upload")

    try:
        out = apply_text_patch(
            raw,
            page_index=body.page - 1,
            bbox=tuple(body.bbox),
            replacement_text=body.replacement_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return Response(
        content=out,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="patched.pdf"',
        },
    )
