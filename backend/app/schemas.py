from typing import Annotated

from pydantic import BaseModel, Field


class RewriteRequest(BaseModel):
    text: str = Field(..., description="Original excerpt from the PDF selection")
    instruction: str = Field(..., description="User instruction for how to rewrite it")


class RewriteResponse(BaseModel):
    replacement_text: str = Field(..., description="Proposed replacement text")


BBox = Annotated[
    tuple[float, float, float, float],
    Field(description="PDF user-space axis-aligned box: x0, y0, x1, y1"),
]


class ExportPatch(BaseModel):
    page: int = Field(..., ge=1, description="1-based page number")
    bbox: BBox
    replacement_text: str = Field(..., description="Text to draw over the whited-out region")
