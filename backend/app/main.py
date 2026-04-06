from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.ai_utils import plan_edits, rewrite
from app.pdf_plan import extract_document_text_for_plan, resolve_all_plan_edits
from app.pdf_utils import apply_patches, apply_text_patch
from app.schemas import (
    ExportPatchesBody,
    PlanResolvedEdit,
    PlanResponse,
    RewriteRequest,
    RewriteResponse,
)

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
        "rewrite": "POST /rewrite — JSON body: text, instruction, optional previous_replacement",
        "export": "POST /export — multipart: file, patches (JSON array)",
        "plan": "POST /plan — multipart: file, instruction (form), optional plan (JSON)",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/rewrite", response_model=RewriteResponse)
def rewrite_endpoint(body: RewriteRequest) -> RewriteResponse:
    try:
        replacement = rewrite(
            body.text,
            body.instruction,
            previous_replacement=body.previous_replacement,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RewriteResponse(replacement_text=replacement)


@app.post("/export")
async def export_pdf(
    file: Annotated[UploadFile, File(description="Original PDF")],
    patches: Annotated[
        str,
        Form(
            description='JSON: {"patches":[{"page":1,"bbox":[...],"replacement_text":"..."}]}',
        ),
    ],
) -> Response:
    try:
        body = ExportPatchesBody.model_validate_json(patches)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid patches JSON: {e}") from e

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty PDF upload")

    items: list[tuple[int, tuple[float, float, float, float], str]] = [
        (p.page, tuple(p.bbox), p.replacement_text) for p in body.patches
    ]

    try:
        if len(items) == 1:
            page_1, bbox, text = items[0]
            out = apply_text_patch(
                raw,
                page_index=page_1 - 1,
                bbox=bbox,
                replacement_text=text,
            )
        else:
            out = apply_patches(raw, items)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return Response(
        content=out,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="patched.pdf"',
        },
    )


@app.post("/plan", response_model=PlanResponse)
async def plan_pdf(
    file: Annotated[UploadFile, File(description="PDF to analyze")],
    instruction: Annotated[str, Form(description="What to change in the document")],
) -> PlanResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty PDF upload")

    doc_text = extract_document_text_for_plan(raw)
    try:
        raw_edits = plan_edits(doc_text, instruction)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    resolved = resolve_all_plan_edits(raw, raw_edits)
    edits_out: list[PlanResolvedEdit] = []
    for r in resolved:
        bb = r.get("bbox")
        bbox_list: list[float] | None = None
        if isinstance(bb, (list, tuple)) and len(bb) == 4:
            bbox_list = [float(x) for x in bb]
        edits_out.append(
            PlanResolvedEdit(
                page=int(r["page"]),
                find=str(r["find"]),
                replace=str(r["replace"]),
                bbox=bbox_list,
                error=r.get("error"),
            ),
        )
    return PlanResponse(edits=edits_out)
