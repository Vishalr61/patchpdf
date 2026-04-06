from typing import Annotated

from pydantic import BaseModel, Field


class RewriteRequest(BaseModel):
    text: str = Field(..., description="Original excerpt from the PDF selection")
    instruction: str = Field(..., description="User instruction for how to rewrite it")
    previous_replacement: str | None = Field(
        None,
        description="Optional prior draft so the model can revise",
    )


class RewriteResponse(BaseModel):
    replacement_text: str = Field(..., description="Proposed replacement text")


BBox = Annotated[
    tuple[float, float, float, float],
    Field(
        description=(
            "Axis-aligned box in PDF user space (pdf.js convertToPdfPoint), "
            "y axis upward; server maps to page space via PyMuPDF transformation_matrix"
        ),
    ),
]


class ExportPatch(BaseModel):
    page: int = Field(..., ge=1, description="1-based page number")
    bbox: BBox
    replacement_text: str = Field(..., description="Text to draw over the whited-out region")


class ExportPatchesBody(BaseModel):
    patches: list[ExportPatch] = Field(
        ...,
        min_length=1,
        description="Ordered patches applied sequentially to the uploaded PDF",
    )


class PlanRequestJson(BaseModel):
    instruction: str = Field(..., description="High-level edit instruction for the document")


class PlanResolvedEdit(BaseModel):
    page: int
    find: str
    replace: str
    bbox: list[float] | None = Field(None, description="PDF-user-space bbox or null if unresolved")
    error: str | None = None


class PlanResponse(BaseModel):
    edits: list[PlanResolvedEdit]
